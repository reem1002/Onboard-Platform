const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const { Quiz, QuizAttempt } = require('../models/Quiz');

/**
 * Progress for one employee in one course.
 * Counts gradable assignments (not lessons) + published quizzes.
 *   assignment complete = instructor-approved submission
 *   quiz complete       = a passed attempt
 */
async function courseProgress(course, studentId, preload = {}) {
  const assignments =
    preload.assignments ||
    (await Assignment.find({ course: course._id, isPublished: true, kind: { $ne: 'lesson' } })
      .sort('order')
      .select('code title milestoneId order jdRequirement professionalDevelopment maxScore passScore'));
  const quizzes = preload.quizzes || (await Quiz.find({ course: course._id, isPublished: true }).sort('order').select('title milestoneId order passScore'));

  const subs = await Submission.find({ student: studentId, assignment: { $in: assignments.map((a) => a._id) } })
    .sort({ attempt: -1 })
    .select('assignment status attempt final createdAt updatedAt');
  const latest = new Map();
  for (const s of subs) if (!latest.has(String(s.assignment))) latest.set(String(s.assignment), s);

  const attempts = await QuizAttempt.find({ student: studentId, quiz: { $in: quizzes.map((q) => q._id) } }).select('quiz score passed createdAt');
  const bestAttempt = new Map();
  for (const a of attempts) {
    const k = String(a.quiz);
    if (!bestAttempt.has(k) || a.score > bestAttempt.get(k).score) bestAttempt.set(k, a);
  }

  const msOrder = new Map([...course.milestones].sort((a, b) => a.order - b.order).map((m, i) => [String(m._id), i]));
  const items = [
    ...assignments.map((a) => {
      const s = latest.get(String(a._id));
      return {
        kind: 'assignment', _id: a._id, code: a.code, title: a.title, milestoneId: String(a.milestoneId), order: a.order,
        jdRequirement: a.jdRequirement, skills: a.professionalDevelopment?.linkedinSkills || [],
        status: s ? s.status : 'not_started',
        completed: s?.status === 'approved',
        score: s?.status === 'approved' ? s.final?.totalScore : undefined,
        maxScore: a.maxScore || 100,
        passScore: a.passScore,
        feedback: s?.status === 'approved' ? s.final : undefined,
        submissionId: s?._id,
        gradedAt: s?.final?.reviewedAt,
      };
    }),
    ...quizzes.map((q) => {
      const b = bestAttempt.get(String(q._id));
      return {
        kind: 'quiz', _id: q._id, code: 'Quiz', title: q.title, milestoneId: String(q.milestoneId), order: q.order,
        status: b ? (b.passed ? 'passed' : 'failed') : 'not_started',
        completed: Boolean(b?.passed),
        score: b?.score,
        maxScore: 100,
        passScore: q.passScore,
      };
    }),
  ].sort((x, y) => (msOrder.get(x.milestoneId) ?? 99) - (msOrder.get(y.milestoneId) ?? 99) || x.order - y.order);

  const milestones = [...course.milestones]
    .sort((a, b) => a.order - b.order)
    .map((m) => {
      const mine = items.filter((i) => i.milestoneId === String(m._id));
      const done = mine.filter((i) => i.completed).length;
      return { _id: m._id, title: m.title, weeks: m.weeks, total: mine.length, completed: done, pct: mine.length ? Math.round((done / mine.length) * 1000) / 10 : 0 };
    });

  const graded = items.filter((i) => i.kind === 'assignment' && i.completed);
  const total = items.length;
  const completed = items.filter((i) => i.completed).length;
  return {
    total,
    completed,
    pct: total ? Math.round((completed / total) * 1000) / 10 : 0,
    submitted: items.filter((i) => i.kind === 'assignment' && i.status !== 'not_started').length,
    pendingReview: items.filter((i) => ['submitted', 'ai_grading', 'ai_graded', 'ai_failed'].includes(i.status)).length,
    avgScore: graded.length ? Math.round((graded.reduce((s, i) => s + (i.score || 0), 0) / graded.length) * 10) / 10 : null,
    currentMilestone: milestones.find((m) => m.pct < 100) || milestones[milestones.length - 1] || null,
    milestones,
    items,
    nextItems: items.filter((i) => !i.completed && !['submitted', 'ai_grading', 'ai_graded', 'ai_failed'].includes(i.status)).slice(0, 5),
  };
}

module.exports = { courseProgress };
