const env = require('../config/env');
const Setting = require('../models/Setting');

let cache = null;
let cachedAt = 0;
const TTL = 30_000;

/** Current platform settings (cached briefly), with upload limits clamped to the server's hard ceiling. */
async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cachedAt < TTL) return cache;
  let doc = await Setting.findOne({ key: 'platform' });
  if (!doc) doc = await Setting.create({ key: 'platform' });
  const s = doc.toObject();
  const ceil = env.MAX_UPLOAD_MB;
  s.uploads.submissionFileMB = Math.min(s.uploads.submissionFileMB, ceil);
  s.uploads.attachmentFileMB = Math.min(s.uploads.attachmentFileMB, ceil);
  s.uploads.maxUploadMB = ceil;
  cache = s;
  cachedAt = Date.now();
  return s;
}
const clearSettingsCache = () => { cache = null; };

/** Effective per-file limit (MB) for a submission to this assignment. */
async function submissionLimits(assignment) {
  const s = await getSettings();
  const perFile = Math.min(assignment?.deliverable?.maxFileMB || s.uploads.submissionFileMB, env.MAX_UPLOAD_MB);
  return { fileMB: perFile, totalMB: Math.max(perFile, s.uploads.submissionTotalMB) };
}

module.exports = { getSettings, clearSettingsCache, submissionLimits };
