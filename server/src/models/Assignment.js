const { Schema, model } = require('mongoose');

/**
 * Structured assignment – replaces "write it in Word then copy-paste".
 * Mirrors the live SOC-L1-2026 assignment layout:
 *   Meta row (Difficulty | Type | Time, Platform, Certs)
 *   Scenario (bullets) + optional callouts
 *   Tasks[] – each with bullets + callouts (TIP / HINT / EXAMPLE / WARNING)
 *   Deliverable (bullets, accepted file types, page range)
 *   Grading Criteria (weighted rubric – weights must sum to 100)
 *   Professional Development (LinkedIn skills, CV accomplishment)
 */
const CALLOUT_KINDS = ['tip', 'hint', 'example', 'warning', 'note'];

const calloutSchema = new Schema(
  {
    kind: { type: String, enum: CALLOUT_KINDS, required: true },
    title: { type: String, maxlength: 200 },
    bullets: [{ type: String, maxlength: 2000 }],
  },
  { _id: false }
);

const taskSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 300 },
    bullets: [{ type: String, maxlength: 3000 }],
    callouts: [calloutSchema],
  },
  { _id: true }
);

const criterionSchema = new Schema(
  {
    criterion: { type: String, required: true, maxlength: 500 },
    weight: { type: Number, required: true, min: 0, max: 100 },
    // Optional guidance for graders/AI: what "excellent" vs "poor" looks like
    guidance: { type: String, maxlength: 2000 },
  },
  { _id: true }
);

const assignmentSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    milestoneId: { type: Schema.Types.ObjectId, required: true },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 }, // SOC-03
    title: { type: String, required: true, trim: true, maxlength: 300 },
    order: { type: Number, default: 0 },
    // 'lesson' = content only (e.g. an explainer video) — nothing to submit, not graded
    kind: { type: String, enum: ['report', 'lab', 'capstone', 'lesson'], default: 'report' },
    // Videos shown in the brief (YouTube, Vimeo, Loom, Google Drive or a direct .mp4/.webm link)
    videos: [
      new Schema(
        { title: { type: String, maxlength: 200 }, url: { type: String, required: true, maxlength: 1000 }, note: { type: String, maxlength: 1000 } },
        { _id: false }
      ),
    ],
    // Job-description requirement this assignment evidences (used in the employee progress report)
    jdRequirement: { type: String, maxlength: 500 },

    meta: {
      difficulty: { type: String, enum: ['Beginner', 'Intermediate', 'Advanced'], default: 'Beginner' },
      type: { type: String, maxlength: 120 }, // "Framework Design Document", "Wazuh Lab (READ-ONLY)"
      estimatedHours: { type: String, maxlength: 20 }, // "5-6"
      platform: { type: String, maxlength: 200 },
      certifications: [{ type: String, maxlength: 120 }],
    },

    scenario: { bullets: [{ type: String, maxlength: 3000 }], callouts: [calloutSchema] },
    tasks: [taskSchema],
    deliverable: {
      bullets: [{ type: String, maxlength: 2000 }],
      acceptedFileTypes: { type: [String], default: ['docx', 'pdf'] },
      maxFiles: { type: Number, default: 3, min: 1, max: 10 },
      // Per-file size limit for this assignment in MB (empty = platform default)
      maxFileMB: { type: Number, min: 1, max: 1024 },
    },
    // Resource files the instructor provides (templates, sample logs, pcaps…). Stored outside the web root.
    attachments: [
      new Schema(
        {
          storedName: { type: String, required: true },
          originalName: { type: String, required: true, maxlength: 255 },
          mimeType: String,
          size: Number,
          uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
        },
        { _id: true, timestamps: { createdAt: true, updatedAt: false } }
      ),
    ],
    rubric: {
      type: [criterionSchema],
      validate: {
        validator: (arr) => !arr.length || Math.round(arr.reduce((s, c) => s + c.weight, 0)) === 100,
        message: 'Grading criteria weights must sum to 100',
      },
    },
    maxScore: { type: Number, default: 100 },
    passScore: { type: Number, default: 60 },
    professionalDevelopment: {
      linkedinSkills: [{ type: String, maxlength: 80 }],
      cvAccomplishment: { type: String, maxlength: 1000 },
    },

    opensAt: Date,
    dueAt: Date,
    isPublished: { type: Boolean, default: false },
    aiGrading: { type: Boolean, default: true },
  },
  { timestamps: true }
);

assignmentSchema.index({ course: 1, code: 1 }, { unique: true });

module.exports = model('Assignment', assignmentSchema);
module.exports.CALLOUT_KINDS = CALLOUT_KINDS;

// Never expose server-side file names
module.exports.schema.set('toJSON', {
  transform: (_doc, ret) => {
    if (ret.attachments) ret.attachments = ret.attachments.map(({ storedName, ...a }) => a);
    return ret;
  },
});
