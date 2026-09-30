const { Schema, model } = require('mongoose');

/**
 * One-time password reset tokens. Only a SHA-256 hash is stored, so a database leak
 * doesn't expose usable links. Single use, short-lived, and all older tokens for the
 * same user are invalidated when a new one is issued.
 */
const passwordResetSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    purpose: { type: String, enum: ['self_service', 'admin_reset'], required: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    expiresAt: { type: Date, required: true },
    usedAt: Date,
    requestIp: String,
  },
  { timestamps: true }
);

passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 }); // purge a day after expiry

module.exports = model('PasswordReset', passwordResetSchema);
