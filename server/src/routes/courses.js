const router = require('express').Router();
const { notify, instructorsOf, companyAdmins, platformAdmins } = require('../services/notify');
const Course = require('../models/Course');
const Assignment = require('../models/Assignment');
const Enrollment = require('../models/Enrollment');
const Submission = require('../models/Submission');
const { Quiz, QuizAttempt } = require('../models/Quiz');
const { courseProgress } = require('../services/progress');
const User = require('../models/User');
const { audit } = require('../models/AuditLog');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errors');
const { patchSchema, z, objectId, assignmentBody } = require('../utils/schemas');
const { loadCourseForUser, assertCanAuthor, canAuthor } = require('../services/access');

router.use(requireAuth);

const milestone = z.object({
  _id: objectId.optional(),
  title: z.string().trim().min(1).max(200),
  weeks: z.string().max(40).optional(),
  weight: z.number().min(0).max(100).default(0),
  order: z.number().int().min(0).default(0),
});

const courseBody = z.object({
  code: z.string().trim().min(2).max(40),
  title: z.string().trim().min(2).max(200),
  summary: z.string().max(2000).optional(),
  coverColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  certificationTarget: z.string().trim().max(300).optional(),
  isPublished: z.boolean().optional(),
  milestones: z.array(milestone).max(30).default([]),
});

/** Latest submission per assignment for one student → { [assignmentId]: submission } */
async function latestSubmissions(studentId, assignmentIds) {
  const subs = await Submission.find({ student: studentId, assignment: { $in: assignmentIds } })
    .sort({ attempt: -1 })
    .select('assignment status attempt final.totalScore createdAt');
  const map = {};
  for (const s of subs) if (!map[s.assignment]) map[s.assignment] = s;
  return map;
}

/* List courses */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (req.user.role === 'employee') {
      const enrollments = await Enrollment.find({ user: req.user._id, status: { $ne: 'withdrawn' } }).populate({
        path: 'course',
        match: { isPublished: true },
      });
      const courses = [];
      for (const e of enrollments.filter((x) => x.course)) {
        const p = await courseProgress(e.course, req.user._id);
        courses.push({
          ...e.course.toJSON(),
          enrollment: { dueAt: e.dueAt, status: e.status },
          progress: { total: p.total, submitted: p.submitted, approved: p.completed, pct: p.pct },
        });
      }
      return res.json({ courses });
    }
    let filter = {};
    if (req.user.role === 'instructor') filter = { instructors: req.user._id };
    else if (req.user.role === 'company_admin') filter = { isPublished: true, $or: [{ company: null }, { company: req.user.company }] };
    const courses = await Course.find(filter).sort('-updatedAt').populate('instructors', 'name');
    res.json({ courses });
  })
);

/* Create course */
router.post(
  '/',
  requireRole('super_admin'), // courses are created by the platform; instructors are then assigned to them
  validate({ body: courseBody }),
  asyncHandler(async (req, res) => {
    const course = await Course.create({ ...req.body, company: null, createdBy: req.user._id });
    await audit(req, 'course.create', { target: String(course._id) });
    res.status(201).json({ course });
  })
);

/* Course detail with assignments grouped by milestone */
router.get(
  '/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const { course } = await loadCourseForUser(req.user, req.params.id);
    const isStudent = req.user.role === 'employee';
    const filter = { course: course._id };
    if (isStudent) filter.isPublished = true;
    const assignments = await Assignment.find(filter)
      .sort('order')
      .select('code title milestoneId order kind meta.difficulty meta.type meta.estimatedHours dueAt isPublished videos attachments._id');

    let submissions = {};
    if (isStudent) submissions = await latestSubmissions(req.user._id, assignments.map((a) => a._id));

    // Milestone quizzes (+ the employee's best attempt)
    const quizFilter = { course: course._id };
    if (isStudent || !canAuthor(req.user, course)) quizFilter.isPublished = true;
    const quizzes = await Quiz.find(quizFilter).sort('order').select('title milestoneId order passScore maxAttempts isPublished questions._id');
    const best = {};
    if (isStudent) {
      const atts = await QuizAttempt.find({ student: req.user._id, quiz: { $in: quizzes.map((q) => q._id) } }).select('quiz score passed');
      for (const a of atts) if (!best[a.quiz] || (a.passed && !best[a.quiz].passed) || (a.passed === best[a.quiz].passed && a.score > best[a.quiz].score)) best[a.quiz] = a;
    }

    await course.populate('instructors', 'name');
    res.json({
      course,
      canEdit: canAuthor(req.user, course),
      assignments: assignments.map((a) => { const { attachments, ...rest } = a.toJSON(); return { ...rest, attachmentCount: attachments?.length || 0, mySubmission: submissions[a._id] || null }; }),
      quizzes: quizzes.map((q) => ({
        _id: q._id, title: q.title, milestoneId: q.milestoneId, order: q.order, passScore: q.passScore, isPublished: q.isPublished,
        questionCount: q.questions.length, myBest: best[q._id] ? { score: best[q._id].score, passed: best[q._id].passed } : null,
      })),
    });
  })
);

/* Update course */
router.patch(
  '/:id',
  validate({ params: z.object({ id: objectId }), body: patchSchema(courseBody) }),
  asyncHandler(async (req, res) => {
    const { course } = await loadCourseForUser(req.user, req.params.id);
    assertCanAuthor(req.user, course);
    const wasPublished = course.isPublished;
    Object.assign(course, req.body);
    await course.save();
    if (!wasPublished && course.isPublished) {
      // New catalogue course: let every customer's admins know it can be assigned
      const User = require('../models/User');
      const admins = await User.find({ role: 'company_admin', isActive: true, ...(course.company ? { company: course.company } : {}) }).distinct('_id');
      await notify(admins, { type: 'course_published', title: `New course available: ${course.code}`, body: course.title, link: `/courses/${course._id}` });
    }
    res.json({ course });
  })
);

/* Reorder / move items across milestones in one save (assignments + quizzes) */
router.put(
  '/:id/outline',
  validate({
    params: z.object({ id: objectId }),
    body: z.object({
      items: z.array(z.object({ kind: z.enum(['assignment', 'quiz']), id: objectId, milestoneId: objectId, order: z.number().int().min(0).max(10000) })).max(500),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { course } = await loadCourseForUser(req.user, req.params.id);
    assertCanAuthor(req.user, course);
    const milestoneIds = new Set(course.milestones.map((m) => String(m._id)));
    if (req.body.items.some((i) => !milestoneIds.has(String(i.milestoneId)))) throw new AppError(400, 'Unknown milestone');
    const byKind = (k) => req.body.items.filter((i) => i.kind === k);
    // Only items that belong to THIS course are touched (ids from other courses are ignored)
    const ops = (items) => items.map((i) => ({ updateOne: { filter: { _id: i.id, course: course._id }, update: { $set: { milestoneId: i.milestoneId, order: i.order } } } }));
    const [a, q] = await Promise.all([
      byKind('assignment').length ? Assignment.bulkWrite(ops(byKind('assignment'))) : null,
      byKind('quiz').length ? Quiz.bulkWrite(ops(byKind('quiz'))) : null,
    ]);
    await audit(req, 'course.outline', { target: String(course._id), meta: { items: req.body.items.length } });
    res.json({ updated: (a?.modifiedCount || 0) + (q?.modifiedCount || 0) });
  })
);

/* Enroll employees (company admin assigns the onboarding course) */
router.post(
  '/:id/enroll',
  requireRole('super_admin', 'company_admin'),
  validate({
    params: z.object({ id: objectId }),
    body: z.object({ userIds: z.array(objectId).min(1).max(500), dueAt: z.coerce.date().optional() }),
  }),
  asyncHandler(async (req, res) => {
    const { course } = await loadCourseForUser(req.user, req.params.id);
    const userFilter = { _id: { $in: req.body.userIds }, role: 'employee' };
    if (req.user.role !== 'super_admin') userFilter.company = req.user.company; // cannot enroll other tenants' users
    const users = await User.find(userFilter).select('_id company');
    if (!users.length) throw new AppError(400, 'No eligible employees found');

    let created = 0;
    const newlyEnrolled = [];
    for (const u of users) {
      const r = await Enrollment.updateOne(
        { user: u._id, course: course._id },
        { $setOnInsert: { company: u.company, assignedBy: req.user._id, dueAt: req.body.dueAt, status: 'active' } },
        { upsert: true }
      );
      if (r.upsertedCount) {
        created += 1;
        newlyEnrolled.push(u._id);
      }
    }
    await notify(newlyEnrolled, {
      type: 'course_assigned',
      title: `You’ve been enrolled in ${course.code}`,
      body: `${course.title}${req.body.dueAt ? ` — complete by ${new Date(req.body.dueAt).toDateString()}` : ''}`,
      link: `/courses/${course._id}`,
    });
    await audit(req, 'course.enroll', { target: String(course._id), meta: { count: created } });
    res.json({ enrolled: created, skipped: users.length - created });
  })
);

/* Create assignment inside a course */
router.post(
  '/:id/assignments',
  validate({ params: z.object({ id: objectId }), body: assignmentBody }),
  asyncHandler(async (req, res) => {
    const { course } = await loadCourseForUser(req.user, req.params.id);
    assertCanAuthor(req.user, course);
    if (!course.milestones.id(req.body.milestoneId)) throw new AppError(400, 'Unknown milestone');
    const assignment = await Assignment.create({ ...req.body, course: course._id });
    res.status(201).json({ assignment });
  })
);

module.exports = router;
