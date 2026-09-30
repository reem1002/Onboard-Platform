const { Schema, model } = require('mongoose');

// OWASP A09: Security Logging & Monitoring – record security-relevant events
const auditSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    company: { type: Schema.Types.ObjectId, ref: 'Company' },
    action: { type: String, required: true }, // auth.login, auth.login_failed, auth.token_reuse, grade.approve…
    target: String,
    ip: String,
    meta: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditSchema.index({ createdAt: -1 });

const AuditLog = model('AuditLog', auditSchema);

async function audit(req, action, extra = {}) {
  try {
    await AuditLog.create({
      actor: extra.actor || req.user?._id,
      company: extra.company || req.user?.company,
      action,
      target: extra.target,
      ip: req.ip,
      meta: extra.meta,
    });
  } catch (e) {
    console.error('audit log failed', e.message);
  }
}

module.exports = { AuditLog, audit };
