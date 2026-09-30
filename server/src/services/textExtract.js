const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');

const MAX_CHARS = 60000;

/** Extract plain text from an uploaded file so the AI grader can read it. */
async function extractText(file) {
  const full = path.join(path.resolve(env.UPLOAD_DIR), file.storedName);
  const ext = (file.originalName.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'docx') {
      const mammoth = require('mammoth');
      const { value } = await mammoth.extractRawText({ path: full });
      return value.slice(0, MAX_CHARS);
    }
    if (ext === 'pdf') {
      const pdf = require('pdf-parse');
      const data = await pdf(await fs.readFile(full));
      return data.text.slice(0, MAX_CHARS);
    }
    if (ext === 'txt') return (await fs.readFile(full, 'utf8')).slice(0, MAX_CHARS);
  } catch (e) {
    return `[Could not extract text from ${file.originalName}: ${e.message}]`;
  }
  return `[${file.originalName}: binary file (${ext}) – not machine-readable, needs human review]`;
}

module.exports = { extractText };
