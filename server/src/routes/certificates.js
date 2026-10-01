const router = require('express').Router();
const env = require('../config/env');
const Certificate = require('../models/Certificate');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errors');
const { z, objectId } = require('../utils/schemas');
const { assignedCourseIds } = require('../services/access');
const { audit } = require('../models/AuditLog');

/* PUBLIC: anyone holding the link/QR can check a certificate is genuine (minimal details only) */
router.get(
  '/verify/:code',
  validate({ params: z.object({ code: z.string().regex(/^[A-Z2-9]{8,20}$/) }) }),
  asyncHandler(async (req, res) => {
    const c = await Certificate.findOne({ code: req.params.code });
    if (!c) return res.status(404).json({ valid: false });
    res.json({
      valid: !c.revokedAt, revoked: Boolean(c.revokedAt), number: c.number, studentName: c.studentName,
      courseCode: c.courseCode, courseTitle: c.courseTitle, certificationTarget: c.certificationTarget, issuedAt: c.issuedAt, issuer: env.ORG_NAME,
    });
  })
);

router.use(requireAuth);

async function scopeFilter(user) {
  if (user.role === 'employee') return { student: user._id };
  if (user.role === 'company_admin') return { company: user.company };
  if (user.role === 'instructor') return { course: { $in: await assignedCourseIds(user) } };
  return {};
}

router.get(
  '/',
  validate({ query: z.object({ course: objectId.optional(), student: objectId.optional() }) }),
  asyncHandler(async (req, res) => {
    const f = await scopeFilter(req.user);
    if (req.validatedQuery.course) f.course = f.course ? { $in: (f.course.$in || []).filter((id) => String(id) === req.validatedQuery.course) } : req.validatedQuery.course;
    if (req.validatedQuery.student && req.user.role !== 'employee') f.student = req.validatedQuery.student;
    const certs = await Certificate.find(f).sort({ issuedAt: -1 }).limit(500);
    res.json({ certificates: certs.map((c) => ({ ...c.toJSON(), verifyUrl: `${env.APP_URL.replace(/\/$/, '')}/verify/${c.code}` })) });
  })
);

async function loadCert(req) {
  const c = await Certificate.findById(req.params.id);
  if (!c) throw new AppError(404, 'Not found');
  const f = await scopeFilter(req.user);
  const ok = (!f.student || String(f.student) === String(c.student))
    && (!f.company || String(f.company) === String(c.company))
    && (!f.course || f.course.$in.some((id) => String(id) === String(c.course)));
  if (!ok) throw new AppError(404, 'Not found');
  return c;
}

router.get(
  '/:id/pdf',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const c = await loadCert(req);
    if (c.revokedAt) throw new AppError(410, 'This certificate was revoked');
    const { buildCertificatePdf } = require('../services/pdf');
    const { logoDataUrl } = require('./branding');
    const Company = require('../models/Company');
    const company = await Company.findById(c.company).select('accentColor');
    const buf = await buildCertificatePdf(c, { logo: await logoDataUrl(c.company), accent: company?.accentColor, verifyUrl: `${env.APP_URL.replace(/\/$/, '')}/verify/${c.code}` });
    const name = `Certificate ${c.courseCode} - ${c.studentName}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${name.replace(/[^\x20-\x7E]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buf);
  })
);

router.post(
  '/:id/revoke',
  requireRole('super_admin'),
  validate({ params: z.object({ id: objectId }), body: z.object({ reason: z.string().trim().min(3).max(300) }) }),
  asyncHandler(async (req, res) => {
    const c = await Certificate.findById(req.params.id);
    if (!c) throw new AppError(404, 'Not found');
    c.revokedAt = new Date();
    c.revokedReason = req.body.reason;
    await c.save();
    await audit(req, 'certificate.revoke', { target: String(c._id), meta: { reason: req.body.reason } });
    res.json({ certificate: c });
  })
);

/* Staff: re-check completion now (e.g. after fixing a grade) */
router.post(
  '/check',
  requireRole('super_admin', 'instructor'),
  validate({ body: z.object({ student: objectId, course: objectId }) }),
  asyncHandler(async (req, res) => {
    if (req.user.role === 'instructor' && !(await assignedCourseIds(req.user)).some((id) => String(id) === req.body.course)) throw new AppError(404, 'Not found');
    const cert = await require('../services/certificates').maybeIssue(req.body.student, req.body.course);
    res.json({ issued: Boolean(cert), certificate: cert });
  })
);

module.exports = router;
