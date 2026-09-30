const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const RefreshToken = require('../models/RefreshToken');
const { AppError } = require('./errors');

const REFRESH_COOKIE = 'lms_rt';
const hash = (v) => crypto.createHash('sha256').update(v).digest('hex');

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, company: user.company ? String(user.company) : null },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.ACCESS_TOKEN_TTL, algorithm: 'HS256', issuer: 'lms-api', audience: 'lms-client' }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'], // pin algorithm – blocks "alg: none" / confusion attacks
    issuer: 'lms-api',
    audience: 'lms-client',
  });
}

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // no "remember me": max 12h, cookie dies with the browser
const rememberTtlMs = () => env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000;

async function issueRefreshToken(user, { family, ip, userAgent, persistent = false, familyStartedAt } = {}) {
  const raw = crypto.randomBytes(48).toString('base64url');
  const doc = await RefreshToken.create({
    user: user._id,
    tokenHash: hash(raw),
    family: family || crypto.randomUUID(),
    persistent,
    familyStartedAt: familyStartedAt || new Date(),
    // Rotation never extends a non-remembered session beyond 12h from sign-in
    expiresAt: persistent
      ? new Date(Date.now() + rememberTtlMs())
      : new Date((familyStartedAt ? new Date(familyStartedAt).getTime() : Date.now()) + SESSION_TTL_MS),
    createdByIp: ip,
    userAgent: userAgent?.slice(0, 300),
  });
  return { raw, doc };
}

/** Rotate: validate presented token, revoke it, issue a new one in the same family. */
async function rotateRefreshToken(raw, meta) {
  if (!raw) throw new AppError(401, 'Missing refresh token');
  const existing = await RefreshToken.findOne({ tokenHash: hash(raw) });
  if (!existing) throw new AppError(401, 'Invalid refresh token');

  if (existing.revokedAt) {
    // Reuse of a rotated token → likely stolen. Kill the entire family.
    await RefreshToken.updateMany({ family: existing.family, revokedAt: null }, { revokedAt: new Date() });
    throw new AppError(401, 'Refresh token reuse detected', 'TOKEN_REUSE');
  }
  if (existing.expiresAt < new Date()) throw new AppError(401, 'Refresh token expired');

  const User = require('../models/User');
  const user = await User.findById(existing.user).select('+passwordChangedAt');
  if (!user || !user.isActive) throw new AppError(401, 'Account unavailable');
  if (user.passwordChangedAt && user.passwordChangedAt > existing.createdAt) {
    await RefreshToken.updateMany({ user: user._id, revokedAt: null }, { revokedAt: new Date() });
    throw new AppError(401, 'Session invalidated by password change');
  }

  const next = await issueRefreshToken(user, {
    family: existing.family,
    persistent: existing.persistent,
    familyStartedAt: existing.familyStartedAt || existing.createdAt,
    ...meta,
  });
  existing.revokedAt = new Date();
  existing.replacedByHash = next.doc.tokenHash;
  await existing.save();

  return { user, raw: next.raw, persistent: existing.persistent };
}

async function revokeRefreshToken(raw) {
  if (!raw) return;
  const existing = await RefreshToken.findOne({ tokenHash: hash(raw) });
  if (existing) await RefreshToken.updateMany({ family: existing.family, revokedAt: null }, { revokedAt: new Date() });
}

function setRefreshCookie(res, raw, persistent = false) {
  res.cookie(REFRESH_COOKIE, raw, {
    httpOnly: true, // not readable by JS → XSS can't steal it
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict', // CSRF mitigation
    path: '/api/auth', // only sent to auth endpoints
    // No maxAge = session cookie: gone when the browser closes (unless "remember me")
    ...(persistent ? { maxAge: rememberTtlMs() } : {}),
  });
}

function clearRefreshCookie(res) {
  res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
}

module.exports = {
  REFRESH_COOKIE,
  signAccessToken,
  verifyAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  setRefreshCookie,
  clearRefreshCookie,
};
