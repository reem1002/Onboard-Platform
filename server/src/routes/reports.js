const router = require('express').Router();
const env = require('../config/env');
const Course = require('../models/Course');
const Enrollment = require('../models/Enrollment');
const { audit } = require('../models/AuditLog');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errors');
const { z, objectId } = require('../utils/schemas');
const { buildReportData, defaultNarrative } = require('../services/reportData');
const { courseProgress } = require('../services/progress');
const { assignedCourseIds } = require('../services/access');
const ProgressReport = require('../models/ProgressReport');

router.use(requireAuth, requireRole('super_admin', 'instructor', 'company_admin'));

const target = z.object({ student: objectId, course: objectId });
const narrative = z.object({
  executiveSummary: z.string().max(6000).optional(),
  businessValue: z.array(z.string().max(1000)).max(10).optional(),
  recommendation: z.string().max(2000).optional(),
  nextSteps: z.array(z.string().max(1000)).max(10).optional(),
});

/* Employees in a course the caller can report on */
router.get(
  '/course/:courseId',
  validate({ params: z.object({ courseId: objectId }) }),
  asyncHandler(async (req, res) => {
    const course = await Course.findById(req.params.courseId);
    if (!course) throw new AppError(404, 'Not found');
    const u = req.user;
    if (u.role === 'instructor' && !course.instructors.some((i) => String(i) === String(u._id))) throw new AppError(404, 'Not found');
    const filter = { course: course._id, status: { $ne: 'withdrawn' } };
    if (u.role === 'company_admin') filter.company = u.company;
    const enrollments = await Enrollment.find(filter).populate('user', 'name email department jobTitle isActive').populate('company', 'name');
    const rows = [];
    for (const e of enrollments.filter((x) => x.user)) {
      const p = await courseProgress(course, e.user._id);
      rows.push({ student: e.user, company: e.company?.name, pct: p.pct, completed: p.completed, total: p.total, avgScore: p.avgScore, currentMilestone: p.currentMilestone?.title });
    }
    res.json({ course: { _id: course._id, code: course.code, title: course.title }, rows });
  })
);

/* Report data + default narrative (for the preview/editor page) */
router.get(
  '/progress',
  validate({ query: target.extend({ preparedFor: z.string().max(200).optional() }) }),
  asyncHandler(async (req, res) => {
    const { student, course, preparedFor } = req.validatedQuery;
    const data = await buildReportData(req.user, student, course);
    res.json({ data, narrative: defaultNarrative(data, preparedFor), aiAvailable: Boolean(env.ANTHROPIC_API_KEY) });
  })
);

/* AI-drafted narrative (optional) */
router.post(
  '/progress/draft',
  validate({ body: target.extend({ preparedFor: z.string().max(200).optional() }) }),
  asyncHandler(async (req, res) => {
    if (!env.ANTHROPIC_API_KEY) throw new AppError(503, 'AI drafting is not configured');
    const data = await buildReportData(req.user, req.body.student, req.body.course);
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const out = await client.messages.create({
      model: env.AI_MODEL,
      max_tokens: 2500,
      system:
        'You write concise, evidence-based employee training progress reports for HR stakeholders. Use ONLY the facts in the JSON provided — never invent grades, dates, tasks or people. Professional, confident, specific; British spelling; no hype.',
      tools: [
        {
          name: 'write_report',
          description: 'Narrative sections of the progress report.',
          input_schema: {
            type: 'object',
            properties: {
              executiveSummary: { type: 'string', description: '3 short paragraphs separated by blank lines: purpose, progress with numbers, what the evidence shows.' },
              businessValue: { type: 'array', items: { type: 'string' }, description: '3-4 bullets on measurable business value, each grounded in the data.' },
              recommendation: { type: 'string', description: 'One or two sentences.' },
              nextSteps: { type: 'array', items: { type: 'string' }, description: '2-3 bullets: next items for the employee, next report timing.' },
            },
            required: ['executiveSummary', 'businessValue', 'recommendation', 'nextSteps'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'write_report' },
      messages: [{ role: 'user', content: `Prepared for: ${req.body.preparedFor || data.company.name}\n\nREPORT DATA (JSON):\n${JSON.stringify(data)}` }],
    });
    const block = out.content.find((c) => c.type === 'tool_use');
    if (!block) throw new AppError(502, 'AI did not return a draft');
    res.json({ narrative: narrative.parse(block.input) });
  })
);

const STAFF = ['super_admin', 'instructor'];

/** Company admins get the generated wording as-is (they can't rewrite our assessment); staff may edit it. */
function narrativeFor(req, data) {
  const base = defaultNarrative(data, req.body.preparedFor);
  const edited = STAFF.includes(req.user.role) ? req.body.narrative || {} : {};
  return { ...base, ...edited, preparedFor: req.body.preparedFor };
}

function sendFile(res, buf, name, type) {
  res.setHeader('Content-Type', type);
  res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(buf);
}
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/* Live report as PDF (everyone with access) */
router.post(
  '/progress.pdf',
  validate({ body: target.extend({ preparedFor: z.string().max(200).optional(), narrative: narrative.optional() }) }),
  asyncHandler(async (req, res) => {
    const data = await buildReportData(req.user, req.body.student, req.body.course);
    const { buildProgressReportPdf } = require('../services/pdf');
    const { reportFileName } = require('../services/reportDocx');
    await audit(req, 'report.progress', { target: String(req.body.student), meta: { course: req.body.course, format: 'pdf' } });
    sendFile(res, await buildProgressReportPdf(data, narrativeFor(req, data)), reportFileName(data).replace(/\.docx$/, '.pdf'), 'application/pdf');
  })
);

/* Download as Word — editable, so staff only */
router.post(
  '/progress.docx',
  requireRole(...STAFF),
  validate({ body: target.extend({ preparedFor: z.string().max(200).optional(), narrative: narrative.optional() }) }),
  asyncHandler(async (req, res) => {
    const { student, course, preparedFor } = req.body;
    const data = await buildReportData(req.user, student, course);
    const n = narrativeFor(req, data);
    const { buildProgressReportDocx, reportFileName } = require('../services/reportDocx');
    const buf = await buildProgressReportDocx(data, n);
    const name = reportFileName(data);
    await audit(req, 'report.progress', { target: String(student), meta: { course } });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buf);
  })
);

/* ---------- Saved / shared reports ---------- */

// Staff save a snapshot and share it with the employee's company admins
router.post(
  '/saved',
  requireRole(...STAFF),
  validate({ body: target.extend({ preparedFor: z.string().max(200).optional(), narrative }) }),
  asyncHandler(async (req, res) => {
    const data = await buildReportData(req.user, req.body.student, req.body.course);
    const User = require('../models/User');
    const student = await User.findById(req.body.student).select('company name');
    const n = narrativeFor(req, data);
    const { preparedFor, ...narr } = n;
    const saved = await ProgressReport.create({
      student: req.body.student, course: req.body.course, company: student.company, preparedFor, narrative: narr,
      data: JSON.parse(JSON.stringify(data)), createdBy: req.user._id,
    });
    const { notify, companyAdmins } = require('../services/notify');
    await notify(await companyAdmins(student.company), {
      type: 'report_shared', title: `New progress report: ${student.name}`, body: `${data.course.code} — ${data.progress.pct}% complete`, link: '/reports/shared',
    });
    await audit(req, 'report.shared', { target: String(saved._id) });
    res.status(201).json({ report: { _id: saved._id, createdAt: saved.createdAt } });
  })
);

// List saved reports the caller may see
router.get(
  '/saved',
  validate({ query: z.object({ student: objectId.optional(), course: objectId.optional() }) }),
  asyncHandler(async (req, res) => {
    const f = {};
    if (req.validatedQuery.student) f.student = req.validatedQuery.student;
    if (req.validatedQuery.course) f.course = req.validatedQuery.course;
    if (req.user.role === 'company_admin') f.company = req.user.company;
    if (req.user.role === 'instructor') f.course = { $in: (await assignedCourseIds(req.user)).filter((id) => !f.course || String(id) === String(f.course)) };
    const reports = await ProgressReport.find(f).sort({ createdAt: -1 }).limit(200)
      .populate('student', 'name jobTitle').populate('course', 'code title').populate('createdBy', 'name').select('-data -narrative');
    res.json({ reports });
  })
);

async function loadSaved(req) {
  const r = await ProgressReport.findById(req.params.id);
  if (!r) throw new AppError(404, 'Not found');
  const u = req.user;
  if (u.role === 'company_admin' && String(r.company) !== String(u.company)) throw new AppError(404, 'Not found');
  if (u.role === 'instructor' && !(await assignedCourseIds(u)).some((id) => String(id) === String(r.course))) throw new AppError(404, 'Not found');
  return r;
}

router.get(
  '/saved/:id.pdf',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const r = await loadSaved(req);
    const { buildProgressReportPdf } = require('../services/pdf');
    const { reportFileName } = require('../services/reportDocx');
    const n = { ...r.narrative.toObject?.() ?? r.narrative, preparedFor: r.preparedFor, reportDate: r.createdAt };
    sendFile(res, await buildProgressReportPdf(r.data, n), reportFileName(r.data).replace(/\.docx$/, '.pdf'), 'application/pdf');
  })
);

router.get(
  '/saved/:id.docx',
  requireRole(...STAFF),
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const r = await loadSaved(req);
    const { buildProgressReportDocx, reportFileName } = require('../services/reportDocx');
    const n = { ...r.narrative.toObject?.() ?? r.narrative, preparedFor: r.preparedFor };
    sendFile(res, await buildProgressReportDocx({ ...r.data, reportDate: r.createdAt }, n), reportFileName(r.data), DOCX);
  })
);

module.exports = router;
