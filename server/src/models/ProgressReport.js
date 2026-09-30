const { Schema, model } = require('mongoose');

/**
 * A progress report our staff prepared and shared with the customer.
 * Stores a snapshot, so the document the customer received never changes afterwards.
 */
const progressReportSchema = new Schema(
  {
    student: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: 'Course', required: true, index: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    preparedFor: { type: String, maxlength: 200 },
    narrative: {
      executiveSummary: String,
      businessValue: [String],
      recommendation: String,
      nextSteps: [String],
    },
    data: { type: Schema.Types.Mixed, required: true }, // snapshot of buildReportData()
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

module.exports = model('ProgressReport', progressReportSchema);
