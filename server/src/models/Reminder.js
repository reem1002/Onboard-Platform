const { Schema, model } = require('mongoose');

/** One row per reminder already sent, so the hourly job never repeats itself. */
const reminderSchema = new Schema({ key: { type: String, required: true, unique: true }, sentAt: { type: Date, default: Date.now } });
reminderSchema.index({ sentAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

module.exports = model('Reminder', reminderSchema);
