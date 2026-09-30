const router = require('express').Router();
const { Quiz, QuizAttempt } = require('../models/Quiz');
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
  timeLimitMinutes: z.number().int().min(0).max(600).optional(),
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
    const attempts = await QuizAttempt.find({ quiz: quiz._id, student: req.user._id }).sort({ attemptNo: 1 }).select('attemptNo score passed createdAt');
    res.json({ quiz: publicQuiz(quiz), attempts, canEdit: false });
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

/* Take the quiz (employee) */
router.post(
  '/:id/attempts',
  validate({
    params: z.object({ id: objectId }),
    body: z.object({
      answers: z.array(z.object({ questionId: objectId, selected: z.array(z.number().int().min(0).max(20)).max(8) })).max(100),
      startedAt: z.coerce.date().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    if (req.user.role !== 'employee') throw new AppError(403, 'Only enrolled employees take quizzes');
    const { quiz, enrollment } = await loadQuiz(req.user, req.params.id);
    if (!quiz.questions.length) throw new AppError(400, 'This quiz has no questions yet');

    const previous = await QuizAttempt.countDocuments({ quiz: quiz._id, student: req.user._id });
    const alreadyPassed = await QuizAttempt.exists({ quiz: quiz._id, student: req.user._id, passed: true });
    if (alreadyPassed) throw new AppError(409, 'You already passed this quiz');
    if (quiz.maxAttempts && previous >= quiz.maxAttempts) throw new AppError(409, 'No attempts left — ask your instructor if you need another try');

    const result = grade(quiz, req.body.answers);
    const attempt = await QuizAttempt.create({
      ...result,
      quiz: quiz._id,
      course: quiz.course,
      company: enrollment.company,
      student: req.user._id,
      attemptNo: previous + 1,
      startedAt: req.body.startedAt,
    });

    // After submitting, reveal the answers and explanations for learning
    res.status(201).json({
      attempt,
      review: quiz.questions.map((q) => ({ questionId: q._id, correct: q.correct, explanation: q.explanation })),
      attemptsLeft: quiz.maxAttempts ? Math.max(0, quiz.maxAttempts - previous - 1) : null,
    });
  })
);

module.exports = router;
module.exports.grade = grade;
