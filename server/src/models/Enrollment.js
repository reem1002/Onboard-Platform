const { Schema, model } = require('mongoose');

const enrollmentSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    dueAt: Date,
    status: { type: String, enum: ['active', 'completed', 'withdrawn'], default: 'active' },
    completedAt: Date,
  },
  { timestamps: true }
);

enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

module.exports = model('Enrollment', enrollmentSchema);
