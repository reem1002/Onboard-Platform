const { Schema, model } = require('mongoose');

/**
 * Refresh tokens are stored ONLY as SHA-256 hashes.
 * Each login starts a "family"; every refresh rotates the token inside that family.
 * If a revoked (already-used) token is presented again → token theft is assumed
 * and the whole family is revoked (reuse detection).
 */
const refreshTokenSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    replacedByHash: String,
    // "Remember me": persistent cookie + long expiry. Otherwise a browser-session cookie + short expiry.
    persistent: { type: Boolean, default: false },
    familyStartedAt: Date, // when this sign-in (session) began — shown on the profile's session list
    createdByIp: String,
    userAgent: { type: String, maxlength: 300 },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('RefreshToken', refreshTokenSchema);
