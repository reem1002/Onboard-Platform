const { Schema, model } = require('mongoose');

const courseSchema = new Schema(
  {
    // null company = global catalogue course (created by super_admin, assignable to any company)
    company: { type: Schema.Types.ObjectId, ref: 'Company', index: true, default: null },
    code: { type: String, required: true, trim: true, uppercase: true, maxlength: 40 }, // e.g. SOC-L1-2026
    title: { type: String, required: true, trim: true, maxlength: 200 },
    summary: { type: String, maxlength: 2000 },
    coverColor: { type: String, default: '#4f46e5', match: /^#[0-9a-fA-F]{6}$/ },
    isPublished: { type: Boolean, default: false },
    // Shown on progress reports, e.g. "CompTIA CySA+ CS0-003 (2 exam-attempt voucher)"
    certificationTarget: { type: String, maxlength: 300 },
    // Milestones (sections) in display order – each groups assignments/quizzes
    milestones: [
      {
        title: { type: String, required: true, maxlength: 200 },
        weeks: { type: String, maxlength: 40 }, // "Weeks 1-2"
        weight: { type: Number, min: 0, max: 100, default: 0 },
        order: { type: Number, default: 0 },
      },
    ],
    // Instructors (platform staff) the admin assigned to teach & grade this course
    instructors: [{ type: Schema.Types.ObjectId, ref: 'User', index: true }],
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

courseSchema.index({ company: 1, code: 1 }, { unique: true });

module.exports = model('Course', courseSchema);
