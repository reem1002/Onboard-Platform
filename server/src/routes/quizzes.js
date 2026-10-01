const router = require('express').Router();
const { Quiz, QuizAttempt, QuizStart, QuizGrant } = require('../models/Quiz');
const Enrollment = require('../models/Enrollment');
const { notify } = require('../services/notify');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errors');
const { patchSchema, z, objectId } = require('../utils/schemas');
const { loadCourseForUser, assertCanAuthor, canAuthor } = require('../services/access');

router.use(requireAuth);

const question = z
  .object({
    _id: objectId.optional(),
    type: z.enum(['single', 'multiple', 'true_false']).default('single'),
    prompt: z.string().trim().min(1).max(2000),
    options: z.array(z.string().trim().min(1).max(500)).min(2).max(8),
    correct: z.array(z.number().int().min(0)).min(1),
    explanation: z.string().max(2000).optional(),
    points: z.number().min(0).max(100).default(1),
  })
  .refine((q) => q.correct.every((i) => i < q.options.length), 'Correct answer must be one of the options')
  .refine((q) => q.type === 'multiple' || q.correct.length === 1, 'Single-answer questions need exactly one correct option');

const quizBody = z.object({
  milestoneId: objectId,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  order: z.number().int().min(0).default(99),
  questions: z.array(question).max(100).default([]),
  passScore: z.number().min(0).max(100).default(70),
  maxAttempts: z.number().int().min(0).max(20).default(3),
  timeLimitMinutes: z.number().int().min(0).max(600).nullish(),
  shuffle: z.boolean().default(true),
  isPublished: z.boolean().default(false),
});

async function loadQuiz(user, id) {
  const quiz = await Quiz.findById(id);
  if (!quiz) throw new AppError(404, 'Not found');
  const ctx = await loadCourseForUser(user, quiz.course);
  if (user.role === 'employee' && !quiz.isPublished) throw new AppError(404, 'Not found');
  return { quiz, ...ctx };
}

/** What an employee may see before answering: no correct answers, no explanations. */
function publicQuiz(q) {
  const o = q.toJSON();
  o.questions = o.questions.map(({ correct, explanation, ...rest }) => ({ ...rest, multi: rest.type === 'multiple' }));
  return o;
}

/** Grade on the server. A multiple-answer question is correct only if the selection matches exactly. */
function grade(quiz, answers) {
  const byId = new Map(answers.map((a) => [String(a.questionId), a.selected || []]));
  let points = 0;
  let maxPoints = 0;
  const graded = quiz.questions.map((q) => {
    const sel = [...new Set(byId.get(String(q._id)) || [])].filter((i) => Number.isInteger(i)).sort();
    const want = [...q.correct].sort();
    const correct = sel.length === want.length && sel.every((v, i) => v === want[i]);
    maxPoints += q.points;
    if (correct) points += q.points;
    return { questionId: q._id, selected: sel, correct };
  });
  const score = maxPoints ? Math.round((points / maxPoints) * 1000) / 10 : 0;
  return { answers: graded, points, maxPoints, score, passed: score >= quiz.passScore };
}

/* Create (course author) */
router.post(
  '/',
  validate({ body: quizBody.extend({ courseId: objectId }) }),
  asyncHandler(async (req, res) => {
    const { course } = await loadCourseForUser(req.user, req.body.courseId);
    assertCanAuthor(req.user, course);
    if (!course.milestones.id(req.body.milestoneId)) throw new AppError(400, 'Unknown milestone');
    const { courseId, ...data } = req.body;
    const quiz = await Quiz.create({ ...data, course: course._id });
    res.status(201).json({ quiz });
  })
);

router.get(
  '/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const { quiz, course } = await loadQuiz(req.user, req.params.id);
    if (canAuthor(req.user, course)) return res.json({ quiz, canEdit: true });
    if (req.user.role !== 'employee') return res.json({ quiz: publicQuiz(quiz), canEdit: false });
    const [attempts, grant, open] = await Promise.all([
      QuizAttempt.find({ quiz: quiz._id, student: req.user._id }).sort({ attemptNo: 1 }).select('attemptNo score passed createdAt overtime'),
      QuizGrant.findOne({ quiz: quiz._id, student: req.user._id }),
      QuizStart.findOne({ quiz: quiz._id, student: req.user._id, used: false }).sort({ startedAt: -1 }),
    ]);
    res.json({
      quiz: publicQuiz(quiz), attempts, canEdit: false,
      allowedAttempts: quiz.maxAttempts ? quiz.maxAttempts + (grant?.extra || 0) : 0,
      openAttempt: open && quiz.timeLimitMinutes ? { startedAt: open.startedAt, endsAt: new Date(open.startedAt.getTime() + quiz.timeLimitMinutes * 60000) } : null,
    });
  })
);

router.patch(
  '/:id',
  validate({ params: z.object({ id: objectId }), body: patchSchema(quizBody) }),
  asyncHandler(async (req, res) => {
    const { quiz, course } = await loadQuiz(req.user, req.params.id);
    assertCanAuthor(req.user, course);
    if (req.body.milestoneId && !course.milestones.id(req.body.milestoneId)) throw new AppError(400, 'Unknown milestone');
    Object.assign(quiz, req.body);
    await quiz.save();
    res.json({ quiz });
  })
);

router.delete(
  '/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const { quiz, course } = await loadQuiz(req.user, req.params.id);
    assertCanAuthor(req.user, course);
    if (await QuizAttempt.exists({ quiz: quiz._id })) throw new AppError(409, 'This quiz has attempts — unpublish it instead of deleting');
    await quiz.deleteOne();
    res.status(204).end();
  })
);

async function attemptsAllowed(quiz, studentId) {
  if (!quiz.maxAttempts) return Infinity;
  const g = await QuizGrant.findOne({ quiz: quiz._id, student: studentId });
  return quiz.maxAttempts + (g?.extra || 0);
}
const GRACE_MS = 2 * 60 * 1000; // network / clock slack after the timer hits zero

/* Start (or resume) an attempt — the server records when the clock starts */
router.post(
  '/:id/start',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'employee') throw new AppError(403, 'Only enrolled employees take quizzes');
    const { quiz } = await loadQuiz(req.user, req.params.id);
    if (await QuizAttempt.exists({ quiz: quiz._id, student: req.user._id, passed: true })) throw new AppError(409, 'You already passed this quiz');
    const previous = await QuizAttempt.countDocuments({ quiz: quiz._id, student: req.user._id });
    if (previous >= (await attemptsAllowed(quiz, req.user._id))) throw new AppError(409, 'No attempts left — ask your instructor if you need another try');
    let start = await QuizStart.findOne({ quiz: quiz._id, student: req.user._id, used: false }).sort({ startedAt: -1 });
    const expired = start && quiz.timeLimitMinutes && Date.now() > start.startedAt.getTime() + quiz.timeLimitMinutes * 60000 + GRACE_MS;
    if (!start || expired) start = await QuizStart.create({ quiz: quiz._id, student: req.user._id });
    res.status(201).json({
      startedAt: start.startedAt,
      endsAt: quiz.timeLimitMinutes ? new Date(start.startedAt.getTime() + quiz.timeLimitMinutes * 60000) : null,
    });
  })
);

/* Submit answers (employee) — graded on the server */
router.post(
  '/:id/attempts',
  validate({
    params: z.object({ id: objectId }),
    body: z.object({
      answers: z.array(z.object({ questionId: objectId, selected: z.array(z.number().int().min(0).max(20)).max(8) })).max(100),
      startedAt: z.coerce.date().optional(), // ignored — kept so older clients still work
    }),
  }),
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'employee') throw new AppError(403, 'Only enrolled employees take quizzes');
    const { quiz, enrollment } = await loadQuiz(req.user, req.params.id);
    if (!quiz.questions.length) throw new AppError(400, 'This quiz has no questions yet');

    const previous = await QuizAttempt.countDocuments({ quiz: quiz._id, student: req.user._id });
    const alreadyPassed = await QuizAttempt.exists({ quiz: quiz._id, student: req.user._id, passed: true });
    if (alreadyPassed) throw new AppError(409, 'You already passed this quiz');
    const allowed = await attemptsAllowed(quiz, req.user._id);
    if (previous >= allowed) throw new AppError(409, 'No attempts left — ask your instructor if you need another try');

    // Timed quizzes need a server-side start; claim it atomically so one start = one attempt
    const start = await QuizStart.findOneAndUpdate({ quiz: quiz._id, student: req.user._id, used: false }, { used: true }, { sort: { startedAt: -1 }, returnDocument: 'before' });
    if (quiz.timeLimitMinutes && !start) throw new AppError(409, 'Start the quiz first');
    const overtime = Boolean(quiz.timeLimitMinutes && start && Date.now() > start.startedAt.getTime() + quiz.timeLimitMinutes * 60000 + GRACE_MS);

    const result = grade(quiz, req.body.answers);
    if (overtime) result.passed = false;
    const attempt = await QuizAttempt.create({
      ...result,
      quiz: quiz._id,
      course: quiz.course,
      company: enrollment.company,
      student: req.user._id,
      attemptNo: previous + 1,
      startedAt: start?.startedAt,
      overtime,
    });
    const left = allowed === Infinity ? null : Math.max(0, allowed - previous - 1);
    if (!attempt.passed && left === 0) {
      const { instructorsOf } = require('../services/notify');
      await notify(await instructorsOf(quiz.course), {
        type: 'quiz_failed_out', title: `Out of attempts: ${quiz.title}`, body: `${req.user.name} used all attempts (best ${attempt.score}%). You can allow another try.`, link: `/quizzes/${quiz._id}/results`,
      });
    }
    if (attempt.passed) await require('../services/certificates').maybeIssue(req.user._id, quiz.course).catch(() => {});

    // After submitting, reveal the answers and explanations for learning
    res.status(201).json({
      attempt,
      review: quiz.questions.map((q) => ({ questionId: q._id, correct: q.correct, explanation: q.explanation })),
      attemptsLeft: left,
    });
  })
);

/* Results for instructors / admins (company admins: their own employees) + per-question analysis */
router.get(
  '/:id/results',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const { quiz, course } = await loadQuiz(req.user, req.params.id);
    const u = req.user;
    if (u.role === 'employee') throw new AppError(404, 'Not found');
    if (u.role === 'instructor' && !canAuthor(u, course)) throw new AppError(404, 'Not found');
    const enrFilter = { course: quiz.course, status: { $ne: 'withdrawn' } };
    if (u.role === 'company_admin') enrFilter.company = u.company;
    const enrollments = await Enrollment.find(enrFilter).populate('user', 'name email').populate('company', 'name');
    const attempts = await QuizAttempt.find({ quiz: quiz._id, student: { $in: enrollments.map((e) => e.user?._id).filter(Boolean) } }).sort({ attemptNo: 1 }).lean();
    const grants = await QuizGrant.find({ quiz: quiz._id }).lean();
    const byStudent = new Map();
    for (const a of attempts) {
      const k = String(a.student);
      if (!byStudent.has(k)) byStudent.set(k, []);
      byStudent.get(k).push(a);
    }
    const rows = enrollments.filter((e) => e.user).map((e) => {
      const list = byStudent.get(String(e.user._id)) || [];
      const best = list.reduce((m, a) => (a.score > (m?.score ?? -1) ? a : m), null);
      const extra = grants.find((g) => String(g.student) === String(e.user._id))?.extra || 0;
      const allowed = quiz.maxAttempts ? quiz.maxAttempts + extra : null;
      return {
        student: { _id: e.user._id, name: e.user.name, email: e.user.email }, company: e.company?.name,
        attempts: list.length, allowed, best: best?.score ?? null, passed: list.some((a) => a.passed),
        lastAt: list.at(-1)?.createdAt || null, overtime: list.some((a) => a.overtime),
        outOfAttempts: allowed !== null && list.length >= allowed && !list.some((a) => a.passed),
      };
    });
    // Item analysis on each employee's latest attempt
    const latest = [...byStudent.values()].map((l) => l.at(-1));
    const items = quiz.questions.map((q) => {
      const ans = latest.map((a) => a.answers.find((x) => String(x.questionId) === String(q._id))).filter(Boolean);
      const pick = q.options.map((_, oi) => ans.filter((x) => x.selected.includes(oi)).length);
      return { _id: q._id, prompt: q.prompt, options: q.options, correct: q.correct, answered: ans.length, correctPct: ans.length ? Math.round((ans.filter((x) => x.correct).length / ans.length) * 100) : null, pick };
    });
    res.json({ quiz: { _id: quiz._id, title: quiz.title, course: quiz.course, passScore: quiz.passScore, maxAttempts: quiz.maxAttempts, timeLimitMinutes: quiz.timeLimitMinutes, questionCount: quiz.questions.length }, canGrant: u.role !== 'company_admin', rows, items });
  })
);

/* Instructor allows one more attempt */
router.post(
  '/:id/grant',
  validate({ params: z.object({ id: objectId }), body: z.object({ student: objectId, extra: z.number().int().min(1).max(5).default(1) }) }),
  asyncHandler(async (req, res) => {
    const { quiz, course } = await loadQuiz(req.user, req.params.id);
    assertCanAuthor(req.user, course);
    if (!(await Enrollment.exists({ course: quiz.course, user: req.body.student, status: { $ne: 'withdrawn' } }))) throw new AppError(404, 'Not found');
    const g = await QuizGrant.findOneAndUpdate({ quiz: quiz._id, student: req.body.student }, { $inc: { extra: req.body.extra }, grantedBy: req.user._id }, { upsert: true, returnDocument: 'after' });
    await notify(req.body.student, { type: 'quiz_extra_attempt', title: `Another try: ${quiz.title}`, body: 'Your instructor allowed you another attempt at this quiz.', link: `/quizzes/${quiz._id}` });
    res.json({ extra: g.extra });
  })
);

module.exports = router;
module.exports.grade = grade;
