const { Schema, model } = require('mongoose');

/** In-app notification ("what's new"). One document per recipient. */
const TYPES = [
  'course_assigned', 'graded', 'returned', 'ticket_reply', 'ticket_new', 'submission_new', 'submission_ai_ready',
  'course_instructor', 'course_published', 'employee_completed', 'seat_limit_reached', 'seats_changed', 'report_shared', 'quiz_failed_out',
  'certificate_issued', 'quiz_extra_attempt', 'due_soon', 'overdue', 'review_waiting',
];

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, maxlength: 500 },
    link: { type: String, maxlength: 300 }, // in-app path only, e.g. /feedback/<id>
    readAt: { type: Date, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 120 }); // keep 120 days

module.exports = model('Notification', notificationSchema);
module.exports.TYPES = TYPES;
