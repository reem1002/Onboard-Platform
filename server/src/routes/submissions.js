const router = require('express').Router();
const { notify, instructorsOf, companyAdmins, platformAdmins } = require('../services/notify');
const path = require('path');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Course = require('../models/Course');
const { assignedCourseIds } = require('../services/access');
const { audit } = require('../models/AuditLog');
const validate = require('../middleware/validate');
const { requireAuth, requireRole, tenantFilter, assertSameTenant } = require('../middleware/auth');
const { UPLOAD_DIR } = require('../middleware/upload');
const { asyncHandler, AppError } = require('../utils/errors');
const { z, objectId } = require('../utils/schemas');
const { enqueue, weightedTotal } = require('../services/aiGrader');
const { studentView } = require('./assignments');

router.use(requireAuth);

// Grading is done by platform staff only. Company admins get read-only access to their own employees' results.
const GRADERS = ['super_admin', 'instructor'];

/* Review queue for instructors */
router.get(
  '/queue',
  requireRole(...GRADERS),
  validate({
    query: z.object({
      status: z.enum(['submitted', 'ai_grading', 'ai_graded', 'ai_failed', 'approved', 'returned', 'pending']).default('pending'),
      course: objectId.optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { status, course, page, limit } = req.validatedQuery;
    const filter = {};
    if (req.user.role === 'instructor') {
      const mine = (await assignedCourseIds(req.user)).map(String);
      if (course && !mine.includes(String(course))) return res.json({ items: [], total: 0, page, limit });
      filter.course = { $in: mine };
    }
    filter.status = status === 'pending' ? { $in: ['submitted', 'ai_graded', 'ai_failed'] } : status;
    if (course) filter.course = course;
    const [items, total] = await Promise.all([
      Submission.find(filter)
        .sort({ createdAt: 1 }) // oldest first – fair queue
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('student', 'name email department')
        .populate('assignment', 'code title')
        .select('-files.storedName'),
      Submission.countDocuments(filter),
    ]);
    res.json({ items, total, page, limit });
  })
);

async function loadSubmission(user, id) {
  const sub = await Submission.findById(id);
  if (!sub) throw new AppError(404, 'Not found');
  const deny = () => {
    throw new AppError(404, 'Not found'); // 404 not 403: don't confirm the submission exists (IDOR protection)
  };
  switch (user.role) {
    case 'super_admin':
      break;
    case 'instructor':
      if (!(await Course.exists({ _id: sub.course, instructors: user._id }))) deny();
      break;
    case 'company_admin':
      assertSameTenant(user, sub.company);
      break;
    case 'employee':
      if (String(sub.student) !== String(user._id)) deny();
      break;
    default:
      deny();
  }
  return sub;
}

router.get(
  '/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const sub = await loadSubmission(req.user, req.params.id);
    // Employees and company admins get the read-only view: never the unapproved AI draft
    if (['employee', 'company_admin'].includes(req.user.role)) {
      await sub.populate([
        { path: 'student', select: 'name email' },
        { path: 'assignment', select: 'code title maxScore passScore' },
        { path: 'course', select: 'title' },
      ]);
      const view = studentView(sub);
      view.files = view.files.map(({ storedName, ...f }) => f);
      return res.json({ submission: view });
    }
    await sub.populate([
      { path: 'student', select: 'name email department jobTitle' },
      { path: 'assignment', select: 'code title rubric maxScore passScore deliverable' },
      { path: 'course', select: 'title' },
    ]);
    const s = sub.toJSON();
    s.files = s.files.map(({ storedName, ...f }) => f);
    res.json({ submission: s });
  })
);

/* Authorized file download */
router.get(
  '/:id/files/:index',
  validate({ params: z.object({ id: objectId, index: z.coerce.number().int().min(0).max(9) }) }),
  asyncHandler(async (req, res) => {
    const sub = await loadSubmission(req.user, req.params.id);
    const file = sub.files[req.params.index];
    if (!file) throw new AppError(404, 'Not found');
    const name = path.basename(file.storedName); // basename + root: defence-in-depth vs path traversal
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.download(name, file.originalName, { root: UPLOAD_DIR, dotfiles: 'allow' });
  })
);

/* Instructor decision: approve AI draft (optionally edited) or return for rework */
router.post(
  '/:id/review',
  requireRole(...GRADERS),
  validate({
    params: z.object({ id: objectId }),
    body: z.object({
      decision: z.enum(['approve', 'return']),
      criteria: z
        .array(z.object({ criterionId: objectId, score: z.number().min(0).max(100), comment: z.string().max(3000).optional() }))
        .max(20)
        .optional(),
      overview: z.string().max(3000).optional(),
      strengths: z.array(z.object({ task: z.string().max(300), detail: z.string().max(2000) })).max(10).optional(),
      improvements: z
        .array(z.object({ task: z.string().max(300), issue: z.string().max(2000), suggestion: z.string().max(2000) }))
        .max(10)
        .optional(),
      closing: z.string().max(1000).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const sub = await loadSubmission(req.user, req.params.id);
    if (['approved'].includes(sub.status)) throw new AppError(409, 'Submission already approved');
    if (sub.status === 'ai_grading') throw new AppError(409, 'AI grading still in progress');
    const assignment = await Assignment.findById(sub.assignment);

    // Start from the AI draft, overlay instructor edits
    const source = req.body.criteria || sub.ai?.criteria?.map((c) => ({ criterionId: String(c.criterionId), score: c.score, comment: c.comment })) || [];
    const byId = new Map(source.map((c) => [String(c.criterionId), c]));
    const missing = assignment.rubric.filter((r) => !byId.has(String(r._id)));
    if (req.body.decision === 'approve' && missing.length) {
      throw new AppError(400, 'Every rubric criterion needs a score before approval');
    }

    const criteria = assignment.rubric.map((r) => {
      const c = byId.get(String(r._id));
      return { criterionId: r._id, criterion: r.criterion, weight: r.weight, score: c?.score ?? 0, comment: c?.comment };
    });
    const acceptedAiAsIs =
      !req.body.criteria ||
      criteria.every((c) => {
        const ai = sub.ai?.criteria?.find((x) => String(x.criterionId) === String(c.criterionId));
        return ai && ai.score === c.score;
      });

    // Feedback sections: instructor's edits win, otherwise fall back to the AI draft
    const ai = sub.ai?.toObject?.() || {};
    const pick = (key) => (req.body[key] !== undefined ? req.body[key] : ai[key]);
    const clean = (rows, keys) => (rows || []).filter((r) => keys.some((k) => String(r?.[k] || '').trim()));
    sub.final = {
      criteria,
      totalScore: weightedTotal(assignment.rubric, criteria, assignment.maxScore),
      overview: pick('overview'),
      strengths: clean(pick('strengths'), ['task', 'detail']),
      improvements: clean(pick('improvements'), ['task', 'issue', 'suggestion']),
      closing: pick('closing'),
      reviewedBy: req.user._id,
      reviewedAt: new Date(),
      acceptedAiAsIs,
    };
    sub.status = req.body.decision === 'approve' ? 'approved' : 'returned';
    await sub.save();
    await notify(sub.student, req.body.decision === 'approve'
      ? { type: 'graded', title: `${assignment.code} graded: ${sub.final.totalScore}/${assignment.maxScore}`, body: assignment.title, link: `/feedback/${sub._id}` }
      : { type: 'returned', title: `${assignment.code} returned for rework`, body: 'Read the feedback and resubmit when ready.', link: `/assignments/${assignment._id}` });
    if (req.body.decision === 'approve') {
      // Did this finish the course? Tell the employee's company admins.
      const Course = require('../models/Course');
      const User = require('../models/User');
      const { courseProgress } = require('../services/progress');
      const c = await Course.findById(sub.course);
      const p = await courseProgress(c, sub.student);
      if (p.total && p.completed === p.total) {
        const u = await User.findById(sub.student).select('name');
        await notify(await companyAdmins(sub.company), {
          type: 'employee_completed', title: `${u.name} completed ${c.code}`, body: `Average grade ${p.avgScore ?? '—'}%`,
          link: `/reports?student=${sub.student}&course=${c._id}`,
        });
      }
    }
    await audit(req, `grade.${req.body.decision}`, { target: String(sub._id), meta: { total: sub.final.totalScore, acceptedAiAsIs } });
    res.json({ submission: sub });
  })
);

/* Feedback sheet download.
   PDF: everyone with access (employee/company admin only once it's approved or returned).
   Word (editable): our staff only. Staff may also export the unapproved AI draft. */
async function feedbackFor(req) {
  const sub = await loadSubmission(req.user, req.params.id);
  const viewer = ['employee', 'company_admin'].includes(req.user.role);
  const hasFinal = ['approved', 'returned'].includes(sub.status) && sub.final?.criteria?.length;
  if (viewer && !hasFinal) throw new AppError(404, 'Feedback is not available yet');
  const feedback = hasFinal ? sub.final.toObject() : sub.ai?.criteria?.length ? sub.ai.toObject() : null;
  if (!feedback) throw new AppError(404, 'No feedback to export yet');
  await sub.populate([
    { path: 'student', select: 'name email' },
    { path: 'assignment', select: 'code title maxScore' },
    { path: 'course', select: 'title' },
  ]);
  return { sub, feedback };
}

function sendFile(res, buf, name, type) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buf);
}

router.get(
  '/:id/feedback.pdf',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const { sub, feedback } = await feedbackFor(req);
    const { buildFeedbackPdf } = require('../services/pdf');
    const { feedbackFileName } = require('../services/feedbackDocx');
    sendFile(res, await buildFeedbackPdf({ submission: sub, feedback }), feedbackFileName(sub).replace(/\.docx$/, '.pdf'), 'application/pdf');
  })
);

router.get(
  '/:id/feedback.docx',
  requireRole(...GRADERS),
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const { sub, feedback } = await feedbackFor(req);
    const { buildFeedbackDocx, feedbackFileName } = require('../services/feedbackDocx');
    sendFile(res, await buildFeedbackDocx({ submission: sub, feedback }), feedbackFileName(sub), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  })
);

/* Re-run AI grading (e.g. after ai_failed) */
router.post(
  '/:id/regrade',
  requireRole(...GRADERS),
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const sub = await loadSubmission(req.user, req.params.id);
    if (['approved', 'ai_grading'].includes(sub.status)) throw new AppError(409, 'Cannot regrade now');
    const queued = await enqueue(sub._id);
    if (!queued) throw new AppError(503, 'AI grading is not configured');
    res.status(202).json({ queued: true });
  })
);

module.exports = router;
