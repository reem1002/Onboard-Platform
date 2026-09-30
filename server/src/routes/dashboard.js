const router = require('express').Router();
const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');
const { Quiz } = require('../models/Quiz');
const { courseProgress } = require('../services/progress');
const Enrollment = require('../models/Enrollment');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const { requireAuth, requireRole, tenantFilter } = require('../middleware/auth');
const { asyncHandler } = require('../utils/errors');
const { assignedCourseIds } = require('../services/access');

router.use(requireAuth);

/**
 * Company admin dashboard: one row per employee with onboarding progress.
 * Everything is scoped to the caller's company.
 */
router.get(
  '/company',
  requireRole('super_admin', 'company_admin'),
  asyncHandler(async (req, res) => {
    // Company admins see their own company; the platform admin picks one with ?company=<id>
    let scope = tenantFilter(req.user);
    if (req.user.role === 'super_admin' && mongoose.isValidObjectId(req.query.company)) {
      scope = { company: new mongoose.Types.ObjectId(String(req.query.company)) };
    }
    const employees = await User.find({ ...scope, role: 'employee' }).select('name email department jobTitle isActive lastLoginAt');
    const ids = employees.map((e) => e._id);

    const enrollments = await Enrollment.find({ user: { $in: ids }, status: { $ne: 'withdrawn' } }).populate('course', 'code title milestones');

    // Preload each course's gradable items once, then compute progress per enrollment
    const preload = {};
    for (const c of new Map(enrollments.filter((e) => e.course).map((e) => [String(e.course._id), e.course])).values()) {
      preload[c._id] = {
        assignments: await Assignment.find({ course: c._id, isPublished: true, kind: { $ne: 'lesson' } }).sort('order')
          .select('code title milestoneId order jdRequirement professionalDevelopment maxScore passScore'),
        quizzes: await Quiz.find({ course: c._id, isPublished: true }).sort('order').select('title milestoneId order passScore'),
      };
    }

    const rows = [];
    for (const emp of employees) {
      const courses = [];
      for (const e of enrollments.filter((x) => String(x.user) === String(emp._id) && x.course)) {
        const p = await courseProgress(e.course, emp._id, preload[e.course._id]);
        courses.push({
          courseId: e.course._id,
          code: e.course.code,
          title: e.course.title,
          dueAt: e.dueAt,
          total: p.total,
          submitted: p.submitted,
          approved: p.completed,
          pendingReview: p.pendingReview,
          avgScore: p.avgScore,
          percent: Math.round(p.pct),
          currentMilestone: p.currentMilestone?.title,
          overdue: Boolean(e.dueAt && e.dueAt < new Date() && p.completed < p.total),
        });
      }
      rows.push({ employee: emp, courses });
    }

    const allCourses = rows.flatMap((r) => r.courses);
    const company = scope.company ? await Company.findById(scope.company).select('name seatLimit') : null;
    res.json({
      company: company ? { _id: company._id, name: company.name, seatLimit: company.seatLimit } : null,
      summary: {
        employees: employees.length,
        seatsUsed: employees.filter((e) => e.isActive).length,
        activeEnrollments: allCourses.length,
        avgCompletion: allCourses.length ? Math.round(allCourses.reduce((a, c) => a + c.percent, 0) / allCourses.length) : 0,
        overdue: allCourses.filter((c) => c.overdue).length,
        pendingReview: allCourses.reduce((a, c) => a + c.pendingReview, 0),
      },
      rows,
    });
  })
);

/* Instructor dashboard numbers */
router.get(
  '/instructor',
  requireRole('super_admin', 'instructor'),
  asyncHandler(async (req, res) => {
    const scope = req.user.role === 'instructor' ? { course: { $in: await assignedCourseIds(req.user) } } : {};
    const byStatus = await Submission.aggregate([
      { $match: scope },
      { $group: { _id: '$status', n: { $sum: 1 } } },
    ]);
    const counts = Object.fromEntries(byStatus.map((b) => [b._id, b.n]));
    const approved = await Submission.find({ ...scope, status: 'approved', 'final.acceptedAiAsIs': { $exists: true } }).select('final.acceptedAiAsIs');
    res.json({
      counts,
      aiAgreementRate: approved.length ? Math.round((approved.filter((s) => s.final.acceptedAiAsIs).length / approved.length) * 100) : null,
    });
  })
);

/* Role-specific home dashboard */
router.get(
  '/home',
  asyncHandler(async (req, res) => res.json(await require('../services/home').homeFor(req.user)))
);

module.exports = router;
