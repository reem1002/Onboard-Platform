const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');

const MAX_CHARS = 250000; // whole document; the grader picks the relevant parts per criterion
const TEXT_TYPES = ['txt', 'csv', 'json', 'log', 'md'];

async function pdfText(buf) {
  const mod = require('pdf-parse');
  if (mod.PDFParse) {
    // pdf-parse v2
    const parser = new mod.PDFParse({ data: buf });
    try {
      const r = await parser.getText();
      return { text: r.text.replace(/\n-- \d+ of \d+ --\n/g, '\n'), pages: r.total };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }
  const data = await mod(buf); // pdf-parse v1
  return { text: data.text, pages: data.numpages };
}

/**
 * Extract plain text from an uploaded file so the AI grader (and pre-checks) can read it.
 * Returns a string; problems are reported inline in square brackets so the instructor sees them.
 */
async function extractText(file) {
  const full = path.join(path.resolve(env.UPLOAD_DIR), path.basename(file.storedName));
  const ext = (file.originalName.split('.').pop() || '').toLowerCase();
  try {
    if (ext === 'docx') {
      const mammoth = require('mammoth');
      const { value } = await mammoth.extractRawText({ path: full });
      return value.slice(0, MAX_CHARS);
    }
    if (ext === 'pdf') {
      const { text, pages } = await pdfText(await fs.readFile(full));
      const words = text.split(/\s+/).filter(Boolean).length;
      if (pages && words / pages < 15) {
        return `${text}\n[${file.originalName}: ${pages} page(s) but almost no selectable text — it looks scanned or made of screenshots; review it visually]`.slice(0, MAX_CHARS);
      }
      return text.slice(0, MAX_CHARS);
    }
    if (TEXT_TYPES.includes(ext)) return (await fs.readFile(full, 'utf8')).slice(0, MAX_CHARS);
  } catch (e) {
    return `[Could not extract text from ${file.originalName}: ${e.message}]`;
  }
  return `[${file.originalName}: ${ext} file – not machine-readable, needs human review]`;
}

module.exports = { extractText, pdfText };
