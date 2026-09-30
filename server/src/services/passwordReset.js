const crypto = require('crypto');
const env = require('../config/env');
const PasswordReset = require('../models/PasswordReset');

const hash = (v) => crypto.createHash('sha256').update(v).digest('hex');
const TTL = { self_service: 30 * 60 * 1000, admin_reset: 24 * 60 * 60 * 1000 };

/** Create a single-use reset link; any older unused link for this user stops working. */
async function createResetLink(user, { purpose, requestedBy, ip }) {
  await PasswordReset.updateMany({ user: user._id, usedAt: null }, { usedAt: new Date() });
  const raw = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + TTL[purpose]);
  await PasswordReset.create({ user: user._id, tokenHash: hash(raw), purpose, requestedBy, expiresAt, requestIp: ip });
  return { url: `${env.APP_URL.replace(/\/$/, '')}/reset-password?token=${raw}`, expiresAt };
}

/** Atomically consume a token (prevents double use under races). Returns the reset record or null. */
async function consumeToken(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > 200) return null;
  return PasswordReset.findOneAndUpdate(
    { tokenHash: hash(raw), usedAt: null, expiresAt: { $gt: new Date() } },
    { usedAt: new Date() },
    { returnDocument: 'after' }
  );
}

async function peekToken(raw) {
  if (!raw || typeof raw !== 'string' || raw.length > 200) return null;
  return PasswordReset.findOne({ tokenHash: hash(raw), usedAt: null, expiresAt: { $gt: new Date() } });
}

module.exports = { createResetLink, consumeToken, peekToken };
