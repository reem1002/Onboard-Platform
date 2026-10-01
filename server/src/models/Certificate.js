const { Schema, model } = require('mongoose');

/**
 * Issued automatically when an employee completes every graded item of a course.
 * Names are snapshotted so the certificate never changes if the course is renamed later.
 */
const certificateSchema = new Schema(
  {
    number: { type: String, required: true, unique: true }, // human-readable, e.g. SOC-L1-2026-0007
    code: { type: String, required: true, unique: true }, // random, used in the public verification link
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    studentName: String,
    courseCode: String,
    courseTitle: String,
    certificationTarget: String,
    companyName: String,
    avgScore: Number,
    issuedAt: { type: Date, default: Date.now },
    revokedAt: Date,
    revokedReason: String,
  },
  { timestamps: true }
);
certificateSchema.index({ student: 1, course: 1 }, { unique: true });

module.exports = model('Certificate', certificateSchema);
