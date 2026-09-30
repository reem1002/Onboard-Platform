const router = require('express').Router();
const User = require('../models/User');
const RefreshToken = require('../models/RefreshToken');
const { audit } = require('../models/AuditLog');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { authLimiter } = require('../middleware/security');
const { asyncHandler, AppError } = require('../utils/errors');
const { z, email, password } = require('../utils/schemas');
const t = require('../utils/tokens');
const { createResetLink, consumeToken, peekToken } = require('../services/passwordReset');
const { sendMail } = require('../services/mailer');

const meta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

// Dummy hash used to equalize timing when the email doesn't exist (prevents user enumeration)
const DUMMY_HASH = require('bcryptjs').hashSync('timing-equalizer-not-a-real-password', 12);

const revokeAllSessions = (userId) => RefreshToken.updateMany({ user: userId, revokedAt: null }, { revokedAt: new Date() });

async function startSession(req, res, user, persistent) {
  const { raw } = await t.issueRefreshToken(user, { ...meta(req), persistent });
  t.setRefreshCookie(res, raw, persistent);
  return t.signAccessToken(user);
}

router.post(
  '/login',
  authLimiter,
  validate({ body: z.object({ email, password: z.string().min(1).max(128), rememberMe: z.boolean().default(false) }) }),
  asyncHandler(async (req, res) => {
    const { email: mail, password: pwd, rememberMe } = req.body;
    const user = await User.findOne({ email: mail }).select('+password +failedLoginAttempts +lockUntil');
    const generic = new AppError(401, 'Invalid email or password');

    if (!user) {
      await require('bcryptjs').compare(pwd, DUMMY_HASH);
      await audit(req, 'auth.login_failed', { meta: { email: mail, reason: 'no_user' } });
      throw generic;
    }
    if (user.isLocked()) {
      await audit(req, 'auth.login_locked', { actor: user._id, company: user.company });
      throw new AppError(423, 'Account temporarily locked after repeated failed attempts. Try again in 15 minutes or reset your password.');
    }
    if (!(await user.comparePassword(pwd)) || !user.isActive) {
      await user.registerFailedLogin();
      await audit(req, 'auth.login_failed', { actor: user._id, company: user.company });
      throw generic;
    }

    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    user.lastLoginAt = new Date();
    await user.save({ validateModifiedOnly: true });

    const accessToken = await startSession(req, res, user, rememberMe);
    await audit(req, 'auth.login', { actor: user._id, company: user.company, meta: { rememberMe } });
    res.json({ accessToken, user: user.toJSON() });
  })
);

router.post(
  '/refresh',
  authLimiter,
  asyncHandler(async (req, res) => {
    try {
      const { user, raw, persistent } = await t.rotateRefreshToken(req.cookies[t.REFRESH_COOKIE], meta(req));
      t.setRefreshCookie(res, raw, persistent);
      res.json({ accessToken: t.signAccessToken(user), user: user.toJSON() });
    } catch (e) {
      t.clearRefreshCookie(res);
      if (e.code === 'TOKEN_REUSE') await audit(req, 'auth.token_reuse');
      throw e;
    }
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await t.revokeRefreshToken(req.cookies[t.REFRESH_COOKIE]);
    t.clearRefreshCookie(res);
    res.status(204).end();
  })
);

/* ---------------- Forgot / reset password ---------------- */

// Always the same answer, whether or not the email exists (no account enumeration)
router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: z.object({ email }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email, isActive: true });
    if (user) {
      const { url } = await createResetLink(user, { purpose: 'self_service', ip: req.ip });
      await sendMail({
        to: user.email,
        subject: 'Reset your password',
        text: `Hi ${user.name},\n\nUse this link to choose a new password. It works once and expires in 30 minutes:\n${url}\n\nIf you didn't ask for this, ignore this email — your password won't change.`,
      }).catch((e) => console.error('reset email failed', e.message));
      await audit(req, 'auth.reset_requested', { actor: user._id, company: user.company });
    }
    res.json({ ok: true, message: 'If an account exists for that email, a reset link is on its way.' });
  })
);

// Lets the reset page say "link expired" before the user types a new password
router.get(
  '/reset-password/check',
  authLimiter,
  validate({ query: z.object({ token: z.string().min(10).max(200) }) }),
  asyncHandler(async (req, res) => {
    const r = await peekToken(req.validatedQuery.token);
    if (!r) throw new AppError(400, 'This link is invalid or has expired. Request a new one.', 'RESET_INVALID');
    const u = await User.findById(r.user).select('email');
    res.json({ ok: true, email: u?.email?.replace(/^(.).*(@.*)$/, '$1•••$2') });
  })
);

router.post(
  '/reset-password',
  authLimiter,
  validate({ body: z.object({ token: z.string().min(10).max(200), password }) }),
  asyncHandler(async (req, res) => {
    const r = await consumeToken(req.body.token);
    if (!r) throw new AppError(400, 'This link is invalid or has expired. Request a new one.', 'RESET_INVALID');
    const user = await User.findById(r.user).select('+password +failedLoginAttempts +lockUntil');
    if (!user || !user.isActive) throw new AppError(400, 'This link is invalid or has expired. Request a new one.', 'RESET_INVALID');
    user.password = req.body.password;
    user.mustChangePassword = false;
    user.failedLoginAttempts = 0;
    user.lockUntil = undefined;
    await user.save();
    await revokeAllSessions(user._id); // sign out everywhere, including a possible attacker
    await audit(req, 'auth.password_reset', { actor: user._id, company: user.company, meta: { purpose: r.purpose } });
    res.json({ ok: true });
  })
);

/* ---------------- Signed-in user ---------------- */

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toJSON() }));

// Profile: people can edit their own details, never their email/role/company (those are admin-managed)
router.patch(
  '/me',
  requireAuth,
  validate({
    body: z
      .object({
        name: z.string().trim().min(2).max(120),
        jobTitle: z.string().trim().max(120),
        department: z.string().trim().max(120),
        phone: z.string().trim().max(40).regex(/^[+\d\s().-]*$/, 'Use digits, spaces and + ( ) - only'),
      })
      .partial(),
  }),
  asyncHandler(async (req, res) => {
    Object.assign(req.user, req.body);
    await req.user.save();
    res.json({ user: req.user.toJSON() });
  })
);

router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: z.object({ currentPassword: z.string().min(1).max(128), newPassword: password }) }),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+password');
    if (!(await user.comparePassword(req.body.currentPassword))) throw new AppError(400, 'Current password is incorrect');
    if (await user.comparePassword(req.body.newPassword)) throw new AppError(400, 'Choose a password you haven’t used here before');
    user.password = req.body.newPassword;
    user.mustChangePassword = false;
    await user.save();
    // Keep "remember me" choice of the current device, revoke everything else
    const current = await RefreshToken.findOne({ tokenHash: require('crypto').createHash('sha256').update(req.cookies[t.REFRESH_COOKIE] || '').digest('hex') });
    await revokeAllSessions(user._id);
    const accessToken = await startSession(req, res, user, Boolean(current?.persistent));
    await audit(req, 'auth.password_changed');
    res.json({ accessToken, user: user.toJSON() });
  })
);

/* Personal preferences: theme + which notifications are emailed */
router.patch(
  '/me/preferences',
  requireAuth,
  validate({
    body: z.object({
      theme: z.enum(['default', 'light', 'dark', 'system']).optional(),
      email: z.object({
        enabled: z.boolean(), grades: z.boolean(), courses: z.boolean(), support: z.boolean(), reviews: z.boolean(), team: z.boolean(),
      }).partial().optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    if (req.body.theme) req.user.set('preferences.theme', req.body.theme);
    for (const [k, v] of Object.entries(req.body.email || {})) req.user.set(`preferences.email.${k}`, v);
    await req.user.save();
    res.json({ user: req.user.toJSON() });
  })
);

/* Active sessions (one per sign-in) */
router.get(
  '/sessions',
  requireAuth,
  asyncHandler(async (req, res) => {
    const live = await RefreshToken.find({ user: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    const currentHash = require('crypto').createHash('sha256').update(req.cookies[t.REFRESH_COOKIE] || '').digest('hex');
    const byFamily = new Map();
    for (const s of live) if (!byFamily.has(s.family)) byFamily.set(s.family, s);
    res.json({
      sessions: [...byFamily.values()].map((s) => ({
        id: s.family,
        current: s.tokenHash === currentHash,
        userAgent: s.userAgent,
        ip: s.createdByIp,
        signedInAt: s.familyStartedAt || s.createdAt,
        lastActiveAt: s.createdAt,
        remembered: s.persistent,
        expiresAt: s.expiresAt,
      })),
    });
  })
);

router.post(
  '/sessions/revoke-others',
  requireAuth,
  asyncHandler(async (req, res) => {
    const currentHash = require('crypto').createHash('sha256').update(req.cookies[t.REFRESH_COOKIE] || '').digest('hex');
    const current = await RefreshToken.findOne({ tokenHash: currentHash, user: req.user._id });
    const r = await RefreshToken.updateMany(
      { user: req.user._id, revokedAt: null, ...(current ? { family: { $ne: current.family } } : {}) },
      { revokedAt: new Date() }
    );
    await audit(req, 'auth.sessions_revoked', { meta: { count: r.modifiedCount } });
    res.json({ revoked: r.modifiedCount });
  })
);

router.delete(
  '/sessions/:id',
  requireAuth,
  validate({ params: z.object({ id: z.string().uuid() }) }),
  asyncHandler(async (req, res) => {
    await RefreshToken.updateMany({ user: req.user._id, family: req.params.id, revokedAt: null }, { revokedAt: new Date() });
    res.status(204).end();
  })
);

module.exports = router;
module.exports.revokeAllSessions = revokeAllSessions;
