const { Schema, model } = require('mongoose');

/**
 * Support ticket.
 *   channel "course"   – employee → the instructors assigned to that course
 *   channel "platform" – company admin / employee → platform admin
 * Status flow: open (waiting on staff) → answered (waiting on requester) → open … → resolved
 */
const CHANNELS = ['course', 'platform'];
const STATUSES = ['open', 'answered', 'resolved'];
const CATEGORIES = ['question', 'assignment', 'grading', 'technical', 'account', 'billing', 'other'];
const PRIORITIES = ['low', 'normal', 'high', 'urgent'];

const messageSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorRole: String,
    body: { type: String, required: true, maxlength: 5000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const ticketSchema = new Schema(
  {
    number: { type: Number, unique: true }, // human-friendly #1042
    channel: { type: String, enum: CHANNELS, required: true, index: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    requester: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', index: true },
    assignment: { type: Schema.Types.ObjectId, ref: 'Assignment' },
    subject: { type: String, required: true, maxlength: 200 },
    category: { type: String, enum: CATEGORIES, default: 'question' },
    priority: { type: String, enum: PRIORITIES, default: 'normal' },
    status: { type: String, enum: STATUSES, default: 'open', index: true },
    messages: [messageSchema],
    firstResponseAt: Date,
    resolvedAt: Date,
    lastActivityAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true }
);

/** Atomic-enough ticket numbering (single collection counter). */
ticketSchema.pre('validate', async function assignNumber() {
  if (this.number) return;
  const last = await this.constructor.findOne().sort({ number: -1 }).select('number').lean();
  this.number = (last?.number || 1000) + 1;
});

module.exports = model('Ticket', ticketSchema);
Object.assign(module.exports, { CHANNELS, STATUSES, CATEGORIES, PRIORITIES });
