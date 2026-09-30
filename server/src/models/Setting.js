const { Schema, model } = require('mongoose');

/**
 * Platform-wide settings (single document, key "platform"), edited by the platform admin.
 * Hard ceilings still come from the environment (MAX_UPLOAD_MB) so a UI mistake can't exceed what the server accepts.
 */
const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'platform' },
    uploads: {
      submissionFileMB: { type: Number, default: 10, min: 1, max: 1024 }, // default per-file limit for employee submissions
      submissionTotalMB: { type: Number, default: 25, min: 1, max: 4096 }, // all files in one submission
      attachmentFileMB: { type: Number, default: 50, min: 1, max: 1024 }, // instructor resources on an assignment
      defaultCompanyQuotaMB: { type: Number, default: 0, min: 0, max: 10485760 }, // 0 = unlimited
    },
    // AI draft grading. 'local' = Ollama on this server (free, in-house), 'claude' = Anthropic API, 'off' = manual only
    ai: {
      provider: { type: String, enum: ['local', 'claude', 'off'], default: 'local' },
      localModel: { type: String, default: 'qwen2.5:7b', maxlength: 100 },
      runs: { type: Number, default: 1, min: 1, max: 3 }, // repeat each criterion and take the median
      useExamples: { type: Boolean, default: true }, // past instructor grades as calibration
      maxChars: { type: Number, default: 14000, min: 2000, max: 60000 }, // submission text sent to the model
    },
    email: {
      notificationsEnabled: { type: Boolean, default: true }, // master switch for notification emails
    },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

module.exports = model('Setting', settingSchema);
