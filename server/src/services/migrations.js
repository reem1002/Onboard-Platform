const mongoose = require('mongoose');

/**
 * One-time, idempotent data migrations run at server start.
 * v2 feedback: strengths/improvements used to be plain strings and the
 * overall comment lived in ai.summary / final.feedback. Convert them to
 * the structured feedback shape so old submissions keep loading.
 */
async function migrateLegacyFeedback() {
  const col = mongoose.connection.collection('submissions');
  const legacy = await col
    .find({
      $or: [
        { 'ai.strengths': { $type: 'string' } },
        { 'ai.improvements': { $type: 'string' } },
        { 'ai.summary': { $exists: true } },
        { 'final.feedback': { $exists: true } },
      ],
    })
    .toArray();

  for (const d of legacy) {
    const set = {};
    const unset = {};
    if (d.ai) {
      set['ai.strengths'] = (d.ai.strengths || []).map((x) => (typeof x === 'string' ? { task: 'General', detail: x } : x));
      set['ai.improvements'] = (d.ai.improvements || []).map((x) =>
        typeof x === 'string' ? { task: 'General', issue: x, suggestion: '' } : x
      );
      if (d.ai.summary !== undefined) {
        if (!d.ai.overview) set['ai.overview'] = d.ai.summary;
        unset['ai.summary'] = '';
      }
    }
    if (d.final && d.final.feedback !== undefined) {
      if (!d.final.overview) set['final.overview'] = d.final.feedback;
      unset['final.feedback'] = '';
    }
    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    if (Object.keys(update).length) await col.updateOne({ _id: d._id }, update);
  }
  if (legacy.length) console.log(`↻ Migrated ${legacy.length} submission(s) to the structured feedback format`);
}

/**
 * v3 roles: instructors are now scoped to the courses the admin assigns.
 * On first run (no course has any instructor yet) keep previous behaviour by
 * assigning every existing platform instructor to every existing course.
 */
async function migrateInstructorAssignments() {
  const courses = mongoose.connection.collection('courses');
  const users = mongoose.connection.collection('users');
  const anyAssigned = await courses.findOne({ 'instructors.0': { $exists: true } });
  const done = await mongoose.connection.collection('migrations').findOne({ _id: 'v3-instructors' });
  if (anyAssigned || done) return;
  const instructors = await users.find({ role: 'instructor' }).project({ _id: 1 }).toArray();
  if (instructors.length) {
    await courses.updateMany({}, { $addToSet: { instructors: { $each: instructors.map((u) => u._id) } } });
    console.log(`↻ Assigned ${instructors.length} existing instructor(s) to all existing courses (change this under Instructors)`);
  }
  await mongoose.connection.collection('migrations').insertOne({ _id: 'v3-instructors', at: new Date() });
}

async function runMigrations() {
  await migrateLegacyFeedback();
  await migrateInstructorAssignments();
}

module.exports = { runMigrations };
