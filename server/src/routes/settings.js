const router = require('express').Router();
const env = require('../config/env');
const Setting = require('../models/Setting');
const Company = require('../models/Company');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { asyncHandler, AppError } = require('../utils/errors');
const { z, objectId } = require('../utils/schemas');
const { audit } = require('../models/AuditLog');
const { getSettings, clearSettingsCache } = require('../services/settings');
const { usageByCompany } = require('../services/storage');
const { mailConfigured, sendMail } = require('../services/mailer');

router.use(requireAuth);

/* Upload limits every signed-in user may know (the UI shows them next to upload boxes) */
router.get(
  '/limits',
  asyncHandler(async (_req, res) => {
    const s = await getSettings();
    res.json({ uploads: s.uploads });
  })
);

router.use(requireRole('super_admin'));

router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const s = await getSettings({ fresh: true });
    const [companies, usage] = await Promise.all([Company.find().sort('name').select('name storageQuotaMB isActive'), usageByCompany()]);
    res.json({
      settings: { uploads: s.uploads, email: s.email, ai: s.ai },
      mail: { configured: mailConfigured(), from: env.MAIL_FROM },
      maxUploadMB: env.MAX_UPLOAD_MB,
      storage: companies.map((c) => ({
        _id: c._id, name: c.name, isActive: c.isActive, storageQuotaMB: c.storageQuotaMB,
        effectiveQuotaMB: c.storageQuotaMB ?? s.uploads.defaultCompanyQuotaMB, usedBytes: usage.get(String(c._id))?.bytes || 0, files: usage.get(String(c._id))?.files || 0,
      })),
    });
  })
);

router.put(
  '/',
  validate({
    body: z.object({
      uploads: z.object({
        submissionFileMB: z.number().int().min(1).max(1024),
        submissionTotalMB: z.number().int().min(1).max(4096),
        attachmentFileMB: z.number().int().min(1).max(1024),
        defaultCompanyQuotaMB: z.number().int().min(0).max(10485760),
      }).partial().optional(),
      email: z.object({ notificationsEnabled: z.boolean() }).partial().optional(),
      ai: z.object({
        provider: z.enum(['local', 'claude', 'off']),
        localModel: z.string().trim().regex(/^[a-zA-Z0-9._:\/-]{1,100}$/, 'Use the model name exactly as shown by "ollama list"'),
        runs: z.number().int().min(1).max(3),
        useExamples: z.boolean(),
        maxChars: z.number().int().min(2000).max(60000),
      }).partial().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const u = req.body.uploads || {};
    for (const k of ['submissionFileMB', 'attachmentFileMB']) {
      if (u[k] > env.MAX_UPLOAD_MB) throw new AppError(400, `The server accepts at most ${env.MAX_UPLOAD_MB} MB per file (MAX_UPLOAD_MB). Raise it in the server .env first.`);
    }
    const $set = { updatedBy: req.user._id };
    for (const [k, v] of Object.entries(u)) $set[`uploads.${k}`] = v;
    for (const [k, v] of Object.entries(req.body.email || {})) $set[`email.${k}`] = v;
    if (req.body.ai?.provider === 'claude' && !env.ANTHROPIC_API_KEY) throw new AppError(400, 'Add ANTHROPIC_API_KEY to the server .env before switching to Claude');
    for (const [k, v] of Object.entries(req.body.ai || {})) $set[`ai.${k}`] = v;
    await Setting.findOneAndUpdate({ key: 'platform' }, { $set }, { upsert: true });
    clearSettingsCache();
    await audit(req, 'settings.update', { meta: req.body });
    const s = await getSettings({ fresh: true });
    res.json({ settings: { uploads: s.uploads, email: s.email, ai: s.ai } });
  })
);

/* AI grading health: is the local model reachable, what's queued, and how close are drafts to instructors' final grades? */
router.get(
  '/ai/status',
  asyncHandler(async (_req, res) => {
    const { ollamaStatus } = require('../services/grading/providers');
    const { queueStatus, activeEngine } = require('../services/aiGrader');
    const Submission = require('../models/Submission');
    const s = await getSettings({ fresh: true });
    const since = new Date(Date.now() - 90 * 864e5);
    const graded = await Submission.find({ status: 'approved', 'ai.totalScore': { $exists: true }, 'final.reviewedAt': { $gte: since } })
      .select('ai.totalScore ai.provider ai.model ai.confidence ai.durationMs final.totalScore final.acceptedAiAsIs').lean();
    const rows = graded.filter((g) => typeof g.ai?.totalScore === 'number' && typeof g.final?.totalScore === 'number');
    const diffs = rows.map((g) => Math.abs(g.ai.totalScore - g.final.totalScore));
    const byModel = {};
    for (const g of rows) {
      const k = `${g.ai.provider || 'claude'} · ${g.ai.model || '?'}`;
      (byModel[k] ||= []).push(Math.abs(g.ai.totalScore - g.final.totalScore));
    }
    const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);
    const durations = rows.map((g) => g.ai.durationMs).filter(Boolean);
    res.json({
      engine: (await activeEngine())?.kind || 'off',
      provider: s.ai.provider,
      local: { url: env.OLLAMA_URL, model: s.ai.localModel, ...(await ollamaStatus()) },
      claudeConfigured: Boolean(env.ANTHROPIC_API_KEY),
      queue: queueStatus(),
      agreement: {
        graded: rows.length,
        meanAbsDiff: avg(diffs),
        within5Pct: rows.length ? Math.round((diffs.filter((d) => d <= 5).length / rows.length) * 100) : null,
        acceptedAsIsPct: rows.length ? Math.round((rows.filter((g) => g.final.acceptedAiAsIs).length / rows.length) * 100) : null,
        avgSeconds: durations.length ? Math.round(avg(durations) / 1000) : null,
        byModel: Object.entries(byModel).map(([model, d]) => ({ model, graded: d.length, meanAbsDiff: avg(d) })),
      },
    });
  })
);

router.patch(
  '/companies/:id/quota',
  validate({ params: z.object({ id: objectId }), body: z.object({ storageQuotaMB: z.number().int().min(0).max(10485760).nullable() }) }),
  asyncHandler(async (req, res) => {
    const c = await Company.findByIdAndUpdate(req.params.id, { storageQuotaMB: req.body.storageQuotaMB }, { returnDocument: 'after' });
    if (!c) throw new AppError(404, 'Not found');
    await audit(req, 'company.quota', { target: String(c._id), meta: req.body });
    res.json({ company: { _id: c._id, storageQuotaMB: c.storageQuotaMB } });
  })
);

router.post(
  '/test-email',
  asyncHandler(async (req, res) => {
    if (!mailConfigured()) throw new AppError(400, 'SMTP is not configured on the server (SMTP_HOST in .env)');
    const { renderEmail } = require('../services/notify');
    await sendMail({ to: req.user.email, ...renderEmail(req.user, { title: 'Test email from your training platform', body: 'If you can read this, notification emails are working.', link: '/dashboard' }) });
    res.json({ sent: true, to: req.user.email });
  })
);

module.exports = router;
