const { Schema, model } = require('mongoose');

/**
 * Submission lifecycle:
 *   submitted → ai_grading → ai_graded (awaiting instructor) → approved | returned
 *   ai_failed → falls back to manual grading by instructor
 * The AI grade is ALWAYS a draft. Only an instructor approval produces the final grade.
 */
const STATUSES = ['submitted', 'ai_grading', 'ai_graded', 'ai_failed', 'approved', 'returned'];

const criterionScoreSchema = new Schema(
  {
    criterionId: Schema.Types.ObjectId,
    criterion: String,
    weight: Number,
    score: { type: Number, min: 0, max: 100 }, // % achievement on this criterion
    comment: { type: String, maxlength: 3000 },
    evidence: [{ type: String, maxlength: 400 }], // AI only: verified quotes from the submission
    spread: Number, // AI only: max-min across repeated runs
  },
  { _id: false }
);

/**
 * Feedback document structure (mirrors the instructor feedback template):
 *   Overview   – one-paragraph verdict ("X's SOC-01 submission earned 85/100 — …")
 *   Strengths  – table: Task | What stood out
 *   Areas to tighten up – table: Task | Issue | Suggestion
 *   Grading breakdown – per-criterion notes (criteria[].comment)
 *   Closing    – one encouraging sentence
 */
function feedbackFields() {
  return {
    overview: { type: String, maxlength: 3000 },
    strengths: [new Schema({ task: { type: String, maxlength: 300 }, detail: { type: String, maxlength: 2000 } }, { _id: false })],
    improvements: [
      new Schema(
        { task: { type: String, maxlength: 300 }, issue: { type: String, maxlength: 2000 }, suggestion: { type: String, maxlength: 2000 } },
        { _id: false }
      ),
    ],
    closing: { type: String, maxlength: 1000 },
  };
}

const submissionSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    assignment: { type: Schema.Types.ObjectId, ref: 'Assignment', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    attempt: { type: Number, default: 1 },
    files: [
      {
        storedName: { type: String, required: true }, // random name on disk – never user-controlled
        originalName: { type: String, maxlength: 255 },
        mimeType: String,
        size: Number,
      },
    ],
    note: { type: String, maxlength: 3000 },
    status: { type: String, enum: STATUSES, default: 'submitted', index: true },
    fingerprint: { type: [Number], select: false }, // MinHash of the text — compares submissions without storing their text twice

    // AI draft — same feedback shape as `final`, never shown to the student
    ai: {
      model: String,
      provider: String, // local | claude
      durationMs: Number,
      checks: [new Schema({ kind: String, severity: String, message: String }, { _id: false })], // deterministic pre-checks
      criteria: [criterionScoreSchema],
      totalScore: Number,
      ...feedbackFields(),
      confidence: { type: String, enum: ['low', 'medium', 'high'] },
      flags: [String], // e.g. "prompt_injection_attempt", "off_topic", "incomplete"
      error: String,
      gradedAt: Date,
    },

    // Instructor's unsent edits (scores + feedback). Staff only; cleared on approve/return/regrade.
    reviewDraft: { type: Schema.Types.Mixed },

    // What the student receives after instructor approval
    final: {
      criteria: [criterionScoreSchema],
      totalScore: Number,
      ...feedbackFields(),
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: Date,
      acceptedAiAsIs: Boolean,
    },
  },
  { timestamps: true }
);

submissionSchema.index({ assignment: 1, student: 1, attempt: -1 });

module.exports = model('Submission', submissionSchema);
module.exports.STATUSES = STATUSES;
