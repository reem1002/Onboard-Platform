const { Schema, model } = require('mongoose');

/**
 * Milestone quiz (knowledge check). Auto-graded on the server:
 * correct answers are never sent to an employee before they submit.
 */
const questionSchema = new Schema({
  type: { type: String, enum: ['single', 'multiple', 'true_false'], default: 'single' },
  prompt: { type: String, required: true, maxlength: 2000 },
  options: { type: [{ type: String, maxlength: 500 }], validate: [(a) => a.length >= 2 && a.length <= 8, '2–8 options'] },
  correct: { type: [Number], validate: [(a) => a.length >= 1, 'Mark at least one correct option'] },
  explanation: { type: String, maxlength: 2000 },
  points: { type: Number, default: 1, min: 0, max: 100 },
});

const quizSchema = new Schema(
  {
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    milestoneId: { type: Schema.Types.ObjectId, required: true },
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    order: { type: Number, default: 99 }, // after the milestone's assignments by default
    questions: [questionSchema],
    passScore: { type: Number, default: 70, min: 0, max: 100 }, // percent
    maxAttempts: { type: Number, default: 3, min: 0, max: 20 }, // 0 = unlimited
    timeLimitMinutes: { type: Number, min: 0, max: 600 }, // optional, enforced on the server
    shuffle: { type: Boolean, default: true }, // randomise question and option order per attempt
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const attemptSchema = new Schema(
  {
    quiz: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', index: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    attemptNo: Number,
    answers: [{ questionId: Schema.Types.ObjectId, selected: [Number], correct: Boolean, _id: false }],
    points: Number,
    maxPoints: Number,
    score: Number, // percent
    passed: Boolean,
    startedAt: Date,
    overtime: Boolean, // submitted after the time limit (+ grace) → recorded but not passed
  },
  { timestamps: true }
);

/** Server-side start time for timed quizzes (the client's clock is never trusted). */
const startSchema = new Schema(
  {
    quiz: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    startedAt: { type: Date, default: Date.now },
    used: { type: Boolean, default: false },
  },
  { timestamps: false }
);
startSchema.index({ quiz: 1, student: 1, used: 1 });

/** Extra attempts granted by an instructor to one employee. */
const grantSchema = new Schema(
  {
    quiz: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true },
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    extra: { type: Number, default: 0, min: 0, max: 20 },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
grantSchema.index({ quiz: 1, student: 1 }, { unique: true });

attemptSchema.index({ quiz: 1, student: 1, attemptNo: 1 }, { unique: true });

module.exports = {
  Quiz: model('Quiz', quizSchema),
  QuizAttempt: model('QuizAttempt', attemptSchema),
  QuizStart: model('QuizStart', startSchema),
  QuizGrant: model('QuizGrant', grantSchema),
};
