const Reminder = require('../models/Reminder');
const Enrollment = require('../models/Enrollment');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');
const Course = require('../models/Course');
const { notify, companyAdmins } = require('./notify');
const { courseProgress } = require('./progress');

const HOUR = 36e5;
const DAY = 24 * HOUR;

/** Send once per key. Returns true when this call sent it. */
async function once(key, fn) {
  try {
    await Reminder.create({ key });
  } catch (e) {
    if (e.code === 11000) return false;
    throw e;
  }
  await fn();
  return true;
}

/**
 * Due-date reminders (in-app + email per preference):
 *  - course due in ≤3 days and ≤1 day, and overdue (employee; overdue also tells the company admins)
 *  - assignment due in ≤2 days with nothing submitted, and overdue
 *  - instructors: one daily nudge when submissions wait more than 48 h
 */
async function runReminders(now = new Date()) {
  let sent = 0;
  const t = now.getTime();

  // Courses
  const enrollments = await Enrollment.find({ status: 'active', dueAt: { $gte: new Date(t - 30 * DAY), $lte: new Date(t + 3 * DAY) } }).populate('course').populate('user', 'name isActive');
  for (const e of enrollments) {
    if (!e.course?.isPublished || !e.user?.isActive) continue;
    const left = e.dueAt.getTime() - t;
    const p = await courseProgress(e.course, e.user._id);
    if (p.total && p.completed >= p.total) continue;
    const base = `${e.course._id}:${e.user._id}:${e.dueAt.toISOString().slice(0, 10)}`;
    const link = `/courses/${e.course._id}`;
    if (left < 0) {
      if (await once(`course-overdue:${base}`, async () => {
        await notify(e.user._id, { type: 'overdue', title: `${e.course.code} is past its due date`, body: `You're ${p.pct}% through — finish the remaining items as soon as you can.`, link });
        await notify(await companyAdmins(e.company), { type: 'overdue', title: `${e.user.name} is past the ${e.course.code} due date`, body: `${p.pct}% complete`, link: `/reports?student=${e.user._id}&course=${e.course._id}` });
      })) sent += 1;
    } else if (left <= DAY) {
      if (await once(`course-1d:${base}`, () => notify(e.user._id, { type: 'due_soon', title: `${e.course.code} is due tomorrow`, body: `You're ${p.pct}% through (${p.completed}/${p.total} items).`, link }))) sent += 1;
    } else if (left <= 3 * DAY) {
      if (await once(`course-3d:${base}`, () => notify(e.user._id, { type: 'due_soon', title: `${e.course.code} is due in 3 days`, body: `You're ${p.pct}% through (${p.completed}/${p.total} items).`, link }))) sent += 1;
    }
  }

  // Assignments with their own due date
  const assignments = await Assignment.find({ isPublished: true, kind: { $ne: 'lesson' }, dueAt: { $gte: new Date(t - 14 * DAY), $lte: new Date(t + 2 * DAY) } }).select('code title course dueAt');
  for (const a of assignments) {
    const course = await Course.findById(a.course).select('isPublished');
    if (!course?.isPublished) continue;
    const enrolled = await Enrollment.find({ course: a.course, status: 'active' }).populate('user', 'isActive');
    for (const e of enrolled.filter((x) => x.user?.isActive)) {
      const last = await Submission.findOne({ assignment: a._id, student: e.user._id }).sort({ attempt: -1 }).select('status');
      if (last && last.status !== 'returned') continue; // submitted (or graded)
      const base = `${a._id}:${e.user._id}:${a.dueAt.toISOString().slice(0, 10)}`;
      const link = `/assignments/${a._id}`;
      if (a.dueAt.getTime() < t) {
        if (await once(`asg-overdue:${base}`, () => notify(e.user._id, { type: 'overdue', title: `${a.code} is overdue`, body: `${a.title} — submit it as soon as you can.`, link }))) sent += 1;
      } else if (await once(`asg-2d:${base}`, () => notify(e.user._id, { type: 'due_soon', title: `${a.code} is due ${a.dueAt.getTime() - t <= DAY ? 'tomorrow' : 'in 2 days'}`, body: a.title, link }))) sent += 1;
    }
  }

  // Instructors: submissions waiting > 48 h (one nudge per instructor per day)
  const waiting = await Submission.find({ status: { $in: ['submitted', 'ai_graded', 'ai_failed'] }, createdAt: { $lt: new Date(t - 2 * DAY) } }).select('course');
  const perCourse = new Map();
  for (const w of waiting) perCourse.set(String(w.course), (perCourse.get(String(w.course)) || 0) + 1);
  const perInstructor = new Map();
  for (const [courseId, n] of perCourse) {
    const c = await Course.findById(courseId).select('instructors');
    for (const i of c?.instructors || []) perInstructor.set(String(i), (perInstructor.get(String(i)) || 0) + n);
  }
  const day = now.toISOString().slice(0, 10);
  for (const [instructor, n] of perInstructor) {
    if (await once(`review-waiting:${instructor}:${day}`, () => notify(instructor, { type: 'review_waiting', title: `${n} submission${n > 1 ? 's' : ''} waiting more than 2 days`, body: 'Employees are waiting for their feedback.', link: '/review' }))) sent += 1;
  }
  return sent;
}

let timer;
function startReminderJob() {
  const tick = () => runReminders().catch((e) => console.error('reminders failed', e.message));
  setTimeout(tick, 60 * 1000); // shortly after boot
  timer = setInterval(tick, HOUR);
  timer.unref?.();
}

module.exports = { runReminders, startReminderJob };
