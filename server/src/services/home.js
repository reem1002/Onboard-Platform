const mongoose = require('mongoose');
const User = require('../models/User');
const Company = require('../models/Company');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Submission = require('../models/Submission');
const Ticket = require('../models/Ticket');
const { courseProgress } = require('./progress');

/**
 * Role-specific home dashboards. Each answers "what needs me today, and how are things going?"
 */
const DAY = 864e5;
const PENDING = ['submitted', 'ai_graded', 'ai_failed'];
const daysBetween = (a, b) => Math.round((b - a) / DAY);
const hours = (ms) => Math.round((ms / 36e5) * 10) / 10;
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/** Submissions per day for the last n days (oldest → newest) */
async function perDay(match, n = 14) {
  const since = new Date(Date.now() - (n - 1) * DAY);
  since.setHours(0, 0, 0, 0);
  const subs = await Submission.find({ ...match, createdAt: { $gte: since } }).select('createdAt');
  const buckets = Array.from({ length: n }, (_, i) => {
    const d = new Date(since.getTime() + i * DAY);
    return { date: d.toISOString().slice(0, 10), count: 0 };
  });
  for (const s of subs) {
    const i = Math.floor((s.createdAt - since) / DAY);
    if (buckets[i]) buckets[i].count += 1;
  }
  return buckets;
}

/* ---------------------------- Employee ---------------------------- */
async function employeeHome(user) {
  const enrollments = await Enrollment.find({ user: user._id, status: { $ne: 'withdrawn' } }).populate('course');
  const courses = [];
  const upNext = [];
  for (const e of enrollments.filter((x) => x.course?.isPublished)) {
    const p = await courseProgress(e.course, user._id);
    const daysLeft = e.dueAt ? daysBetween(Date.now(), e.dueAt) : null;
    courses.push({
      _id: e.course._id, code: e.course.code, title: e.course.title, pct: p.pct, completed: p.completed, total: p.total,
      avgScore: p.avgScore, currentMilestone: p.currentMilestone?.title, dueAt: e.dueAt, daysLeft,
      overdue: daysLeft !== null && daysLeft < 0 && p.completed < p.total,
    });
    for (const n of p.nextItems.slice(0, 3)) {
      upNext.push({ ...n, link: n.kind === 'quiz' ? `/quizzes/${n._id}` : `/assignments/${n._id}`, courseCode: e.course.code, dueAt: e.dueAt });
    }
  }

  const subs = await Submission.find({ student: user._id }).sort({ updatedAt: -1 }).limit(50)
    .populate('assignment', 'code title maxScore').select('assignment status final.totalScore final.reviewedAt createdAt attempt');
  const latest = new Map();
  for (const s of subs) if (!latest.has(String(s.assignment?._id))) latest.set(String(s.assignment?._id), s);
  const all = [...latest.values()].filter((s) => s.assignment);

  return {
    role: 'employee',
    stats: {
      courses: courses.length,
      avgPct: avg(courses.map((c) => c.pct)) ?? 0,
      avgScore: avg(all.filter((s) => s.status === 'approved').map((s) => s.final.totalScore)),
      underReview: all.filter((s) => PENDING.includes(s.status) || s.status === 'ai_grading').length,
    },
    courses,
    // Action first: returned work needs resubmitting
    toFix: all.filter((s) => s.status === 'returned').map((s) => ({ code: s.assignment.code, title: s.assignment.title, link: `/assignments/${s.assignment._id}` })),
    upNext: upNext.slice(0, 5),
    recentGrades: all
      .filter((s) => s.status === 'approved')
      .sort((a, b) => (b.final.reviewedAt || 0) - (a.final.reviewedAt || 0))
      .slice(0, 5)
      .map((s) => ({ code: s.assignment.code, title: s.assignment.title, score: s.final.totalScore, maxScore: s.assignment.maxScore || 100, at: s.final.reviewedAt, link: `/feedback/${s._id}` })),
    support: { replies: await Ticket.countDocuments({ requester: user._id, status: 'answered' }) },
  };
}

/* ---------------------------- Instructor ---------------------------- */
async function instructorHome(user) {
  const courses = await Course.find({ instructors: user._id }).select('code title milestones isPublished');
  const ids = courses.map((c) => c._id);
  const [pending, aiFailed, openQuestions, reviewedWeek, recentApproved] = await Promise.all([
    Submission.find({ course: { $in: ids }, status: { $in: PENDING } }).sort({ createdAt: 1 }).limit(200)
      .populate('student', 'name').populate('assignment', 'code title').select('student assignment status createdAt ai.totalScore course'),
    Submission.countDocuments({ course: { $in: ids }, status: 'ai_failed' }),
    Ticket.countDocuments({ channel: 'course', course: { $in: ids }, status: 'open' }),
    Submission.countDocuments({ course: { $in: ids }, 'final.reviewedBy': user._id, 'final.reviewedAt': { $gte: new Date(Date.now() - 7 * DAY) } }),
    Submission.find({ course: { $in: ids }, status: 'approved', 'final.reviewedAt': { $gte: new Date(Date.now() - 30 * DAY) } }).select('createdAt final.reviewedAt final.totalScore'),
  ]);

  const perCourse = [];
  const atRisk = [];
  for (const c of courses) {
    const enr = await Enrollment.find({ course: c._id, status: { $ne: 'withdrawn' } }).populate('user', 'name').populate('company', 'name');
    const pcts = [];
    const scores = [];
    for (const e of enr.filter((x) => x.user)) {
      const p = await courseProgress(c, e.user._id);
      pcts.push(p.pct);
      if (p.avgScore !== null) scores.push(p.avgScore);
      const overdue = e.dueAt && e.dueAt < new Date() && p.completed < p.total;
      const lowScore = p.avgScore !== null && p.avgScore < 60;
      const stalled = p.submitted === 0 && daysBetween(e.createdAt, Date.now()) >= 7;
      if (overdue || lowScore || stalled) {
        atRisk.push({
          name: e.user.name, company: e.company?.name, course: c.code, pct: p.pct, avgScore: p.avgScore,
          reason: overdue ? 'Past due date' : lowScore ? 'Low average grade' : 'No submissions after a week',
          link: `/reports?student=${e.user._id}&course=${c._id}`,
        });
      }
    }
    perCourse.push({
      _id: c._id, code: c.code, title: c.title, isPublished: c.isPublished, students: pcts.length,
      avgPct: avg(pcts) ?? 0, avgScore: avg(scores), pending: pending.filter((s) => String(s.course) === String(c._id)).length,
    });
  }

  return {
    role: 'instructor',
    stats: {
      toReview: pending.filter((s) => s.status !== 'ai_failed').length,
      aiFailed,
      openQuestions,
      reviewedThisWeek: reviewedWeek,
      avgTurnaroundHours: avg(recentApproved.map((s) => hours(s.final.reviewedAt - s.createdAt))),
    },
    queue: pending.slice(0, 6).map((s) => ({
      _id: s._id, student: s.student?.name, code: s.assignment?.code, title: s.assignment?.title, status: s.status,
      aiScore: s.ai?.totalScore, waitingHours: hours(Date.now() - s.createdAt), link: `/review/${s._id}`,
    })),
    courses: perCourse,
    atRisk: atRisk.slice(0, 8),
  };
}

/* ---------------------------- Company admin ---------------------------- */
async function companyHome(user) {
  const company = await Company.findById(user.company).select('name seatLimit');
  const employees = await User.find({ company: user.company, role: 'employee' }).select('name isActive lastLoginAt createdAt');
  const active = employees.filter((e) => e.isActive);
  const enrollments = await Enrollment.find({ company: user.company, status: { $ne: 'withdrawn' } }).populate('course').populate('user', 'name isActive');

  const byCourse = new Map();
  const attention = [];
  const pcts = [];
  let completed = 0;
  for (const e of enrollments.filter((x) => x.user?.isActive && x.course)) {
    const p = await courseProgress(e.course, e.user._id);
    pcts.push(p.pct);
    if (p.total && p.completed === p.total) completed += 1;
    const k = String(e.course._id);
    if (!byCourse.has(k)) byCourse.set(k, { _id: e.course._id, code: e.course.code, title: e.course.title, enrolled: 0, pcts: [] });
    byCourse.get(k).enrolled += 1;
    byCourse.get(k).pcts.push(p.pct);
    const overdue = e.dueAt && e.dueAt < new Date() && p.completed < p.total;
    const notStarted = p.submitted === 0 && daysBetween(e.createdAt, Date.now()) >= 7;
    if (overdue || notStarted) {
      attention.push({ name: e.user.name, course: e.course.code, pct: p.pct, reason: overdue ? 'Past due date' : 'Hasn’t started yet', link: `/reports?student=${e.user._id}&course=${e.course._id}` });
    }
  }
  for (const emp of active) {
    const neverOrStale = !emp.lastLoginAt ? daysBetween(emp.createdAt, Date.now()) >= 3 : daysBetween(emp.lastLoginAt, Date.now()) >= 14;
    if (neverOrStale) attention.push({ name: emp.name, reason: emp.lastLoginAt ? 'No sign-in for 2+ weeks' : 'Never signed in', link: '/people' });
  }

  const recent = await Submission.find({ company: user.company, status: 'approved' }).sort({ 'final.reviewedAt': -1 }).limit(6)
    .populate('student', 'name').populate('assignment', 'code title maxScore').select('student assignment final.totalScore final.reviewedAt course');

  return {
    role: 'company_admin',
    company: { name: company?.name, seatLimit: company?.seatLimit ?? 0, seatsUsed: active.length },
    stats: {
      employees: active.length,
      avgPct: avg(pcts) ?? 0,
      completedCourses: completed,
      needsAttention: attention.length,
    },
    courses: [...byCourse.values()].map(({ pcts: ps, ...c }) => ({ ...c, avgPct: avg(ps) ?? 0 })),
    attention: attention.slice(0, 8),
    recentResults: recent.filter((s) => s.student && s.assignment).map((s) => ({
      name: s.student.name, code: s.assignment.code, title: s.assignment.title, score: s.final.totalScore,
      maxScore: s.assignment.maxScore || 100, at: s.final.reviewedAt, link: `/reports?student=${s.student._id}&course=${s.course}`,
    })),
    support: { waiting: await Ticket.countDocuments({ requester: user._id, status: 'answered' }) },
  };
}

/* ---------------------------- Platform admin ---------------------------- */
async function adminHome() {
  const [companies, employees, instructors, courses, subsWeek, gradedWeek, pending, platformOpen, unanswered, responded] = await Promise.all([
    Company.find({ isActive: true }).select('name seatLimit'),
    User.aggregate([{ $match: { role: 'employee', isActive: true } }, { $group: { _id: '$company', n: { $sum: 1 } } }]),
    User.countDocuments({ role: 'instructor', isActive: true }),
    Course.find().select('code title instructors isPublished').populate('instructors', 'name'),
    Submission.countDocuments({ createdAt: { $gte: new Date(Date.now() - 7 * DAY) } }),
    Submission.find({ status: 'approved', 'final.reviewedAt': { $gte: new Date(Date.now() - 7 * DAY) } }).select('final.totalScore'),
    Submission.find({ status: { $in: PENDING } }).select('course createdAt'),
    Ticket.countDocuments({ channel: 'platform', status: 'open' }),
    Ticket.countDocuments({ status: 'open', firstResponseAt: null, createdAt: { $lt: new Date(Date.now() - DAY) } }),
    Ticket.find({ firstResponseAt: { $ne: null }, createdAt: { $gte: new Date(Date.now() - 30 * DAY) } }).select('createdAt firstResponseAt'),
  ]);
  const used = Object.fromEntries(employees.map((e) => [String(e._id), e.n]));
  const seatsUsed = employees.reduce((a, e) => a + e.n, 0);
  const seatsTotal = companies.reduce((a, c) => a + c.seatLimit, 0);

  const backlog = courses
    .map((c) => {
      const mine = pending.filter((p) => String(p.course) === String(c._id));
      return {
        _id: c._id, code: c.code, instructors: c.instructors.map((i) => i.name), pending: mine.length,
        oldestHours: mine.length ? hours(Date.now() - Math.min(...mine.map((p) => p.createdAt.getTime()))) : 0,
      };
    })
    .filter((c) => c.pending)
    .sort((a, b) => b.oldestHours - a.oldestHours);

  return {
    role: 'super_admin',
    stats: {
      companies: companies.length,
      employees: seatsUsed,
      seatsUsed,
      seatsTotal,
      instructors,
      coursesPublished: courses.filter((c) => c.isPublished).length,
      submissionsWeek: subsWeek,
      gradedWeek: gradedWeek.length,
      avgGradeWeek: avg(gradedWeek.map((s) => s.final.totalScore)),
      pendingReview: pending.length,
      openPlatformTickets: platformOpen,
      unansweredOver24h: unanswered,
      avgFirstResponseHours: avg(responded.map((t) => hours(t.firstResponseAt - t.createdAt))),
    },
    activity: await perDay({}, 14),
    backlog: backlog.slice(0, 6),
    alerts: [
      ...courses.filter((c) => c.isPublished && !c.instructors.length).map((c) => ({ kind: 'warning', text: `${c.code} is published but has no instructor`, link: '/admin/instructors' })),
      ...companies
        .map((c) => ({ c, pct: c.seatLimit ? (used[String(c._id)] || 0) / c.seatLimit : 1 }))
        .filter(({ pct }) => pct >= 0.9)
        .map(({ c }) => ({ kind: 'info', text: `${c.name} is using ${used[String(c._id)] || 0} of ${c.seatLimit} seats`, link: '/admin/companies' })),
      ...(unanswered ? [{ kind: 'warning', text: `${unanswered} support request(s) waiting more than 24h for a first reply`, link: '/support' }] : []),
    ],
  };
}

async function homeFor(user) {
  switch (user.role) {
    case 'employee': return employeeHome(user);
    case 'instructor': return instructorHome(user);
    case 'company_admin': return companyHome(user);
    case 'super_admin': return adminHome(user);
    default: return {};
  }
}

module.exports = { homeFor, mongoose };
