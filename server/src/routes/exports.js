const router = require('express').Router();
const mongoose = require('mongoose');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const Certificate = require('../models/Certificate');
const Company = require('../models/Company');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errors');
const { z, objectId } = require('../utils/schemas');
const { courseProgress } = require('../services/progress');
const { assignedCourseIds } = require('../services/access');
const { audit } = require('../models/AuditLog');

router.use(requireAuth, requireRole('super_admin', 'instructor', 'company_admin'));

/** CSV cell: quote, double quotes, and neutralise spreadsheet formulas (CSV injection). */
const cell = (v) => {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const toCsv = (rows) => `﻿${rows.map((r) => r.map(cell).join(',')).join('\r\n')}\r\n`; // BOM → Excel opens Arabic names correctly
// Server-local calendar day (YYYY-MM-DD) so CSV dates match what people see in the app
const day = (d) => (d ? new Date(d).toLocaleDateString('en-CA') : '');

function send(res, name, type, body) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(body);
}

/** Enrollments the caller may export (company admins: own company; instructors: own courses; admin: all or ?company) */
async function scopedEnrollments(req, courseId) {
  const u = req.user;
  const f = { status: { $ne: 'withdrawn' } };
  if (u.role === 'company_admin') f.company = u.company;
  if (u.role === 'super_admin' && req.validatedQuery.company) f.company = new mongoose.Types.ObjectId(req.validatedQuery.company);
  if (u.role === 'instructor') {
    const mine = await assignedCourseIds(u);
    if (courseId && !mine.some((id) => String(id) === String(courseId))) throw new AppError(404, 'Not found');
    f.course = courseId || { $in: mine };
  } else if (courseId) f.course = courseId;
  return Enrollment.find(f).populate('user', 'name email department jobTitle isActive lastLoginAt').populate('course').populate('company', 'name');
}

async function teamRows(req) {
  const enr = (await scopedEnrollments(req, req.validatedQuery.course)).filter((e) => e.user && e.course);
  const certs = await Certificate.find({ student: { $in: enr.map((e) => e.user._id) } }).select('student course number revokedAt');
  const certOf = (e) => certs.find((c) => String(c.student) === String(e.user._id) && String(c.course) === String(e.course._id) && !c.revokedAt);
  const rows = [];
  for (const e of enr) {
    const p = await courseProgress(e.course, e.user._id);
    const done = p.total && p.completed >= p.total;
    const overdue = !done && e.dueAt && e.dueAt < new Date();
    rows.push({
      name: e.user.name, email: e.user.email, department: e.user.department || '', jobTitle: e.user.jobTitle || '', company: e.company?.name || '',
      courseCode: e.course.code, courseTitle: e.course.title, pct: p.pct, completed: p.completed, total: p.total, avgScore: p.avgScore,
      milestone: p.currentMilestone?.title || '', dueAt: e.dueAt, status: done ? 'Completed' : overdue ? 'Overdue' : p.submitted ? 'In progress' : 'Not started',
      certificate: certOf(e)?.number || '', lastLogin: e.user.lastLoginAt, active: e.user.isActive,
    });
  }
  return rows.sort((a, b) => a.company.localeCompare(b.company) || a.name.localeCompare(b.name));
}

const teamQuery = z.object({ course: objectId.optional(), company: objectId.optional() });

router.get(
  '/team.csv',
  validate({ query: teamQuery }),
  asyncHandler(async (req, res) => {
    const rows = await teamRows(req);
    const csv = toCsv([
      ['Employee', 'Email', 'Department', 'Job title', 'Company', 'Course code', 'Course', 'Progress %', 'Items done', 'Items total', 'Average grade', 'Current milestone', 'Due date', 'Status', 'Certificate', 'Last sign-in', 'Account active'],
      ...rows.map((r) => [r.name, r.email, r.department, r.jobTitle, r.company, r.courseCode, r.courseTitle, r.pct, r.completed, r.total, r.avgScore ?? '', r.milestone, day(r.dueAt), r.status, r.certificate, day(r.lastLogin), r.active ? 'Yes' : 'No']),
    ]);
    await audit(req, 'export.team_csv', { meta: { rows: rows.length } });
    send(res, `Team progress ${day(new Date())}.csv`, 'text/csv; charset=utf-8', csv);
  })
);

router.get(
  '/team.pdf',
  validate({ query: teamQuery }),
  asyncHandler(async (req, res) => {
    const rows = await teamRows(req);
    const companyId = req.user.role === 'company_admin' ? req.user.company : req.validatedQuery.company;
    const company = companyId ? await Company.findById(companyId).select('name accentColor') : null;
    const { logoDataUrl } = require('./branding');
    const { buildTeamPdf } = require('../services/pdf');
    const buf = await buildTeamPdf(rows, { title: company ? `${company.name} — team progress` : 'Team progress', logo: await logoDataUrl(companyId), accent: company?.accentColor });
    await audit(req, 'export.team_pdf', { meta: { rows: rows.length } });
    send(res, `Team progress ${day(new Date())}.pdf`, 'application/pdf', buf);
  })
);

/* Gradebook: one row per employee, one column per graded item of the course */
router.get(
  '/gradebook.csv',
  validate({ query: z.object({ course: objectId, company: objectId.optional() }) }),
  asyncHandler(async (req, res) => {
    const course = await Course.findById(req.validatedQuery.course);
    if (!course) throw new AppError(404, 'Not found');
    const enr = (await scopedEnrollments(req, course._id)).filter((e) => e.user);
    let header = null;
    const lines = [];
    for (const e of enr) {
      const p = await courseProgress(course, e.user._id);
      if (!header) header = ['Employee', 'Email', 'Company', ...p.items.map((i) => (i.kind === 'quiz' ? `Quiz: ${i.title}` : i.code)), 'Progress %', 'Average grade'];
      lines.push([e.user.name, e.user.email, e.company?.name || '', ...p.items.map((i) => (i.score != null ? i.score : i.status === 'not_started' ? '' : i.status.replace(/_/g, ' '))), p.pct, p.avgScore ?? '']);
    }
    await audit(req, 'export.gradebook', { meta: { course: course.code, rows: lines.length } });
    send(res, `${course.code} gradebook ${day(new Date())}.csv`, 'text/csv; charset=utf-8', toCsv([header || ['Employee', 'Email', 'Company'], ...lines]));
  })
);

module.exports = router;
module.exports.toCsv = toCsv;
