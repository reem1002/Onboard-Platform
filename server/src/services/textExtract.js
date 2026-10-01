const fs = require('fs/promises');
const path = require('path');
const env = require('../config/env');

const MAX_CHARS = 250000; // whole document; the grader picks the relevant parts per criterion
const TEXT_TYPES = ['txt', 'csv', 'json', 'log', 'md'];
const IMAGE_TYPES = ['png', 'jpg', 'jpeg', 'bmp', 'webp'];

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
  const ocr = require('./ocr');
  try {
    if (ext === 'docx') {
      const mammoth = require('mammoth');
      const { value } = await mammoth.extractRawText({ path: full });
      let out = value;
      if (ocr.enabled()) {
        // Lab reports are often mostly screenshots: read the text inside them too
        const shots = await ocr.ocrDocxImages(full).catch((e) => ({ text: '', error: e.message }));
        if (shots.text) out += `\n\n${shots.text}\n[${file.originalName}: text inside ${shots.text.match(/\[Screenshot /g).length} screenshot(s) was read with OCR — check exact values against the file]`;
      }
      return out.slice(0, MAX_CHARS);
    }
    if (ext === 'pdf') {
      const buf = await fs.readFile(full);
      const { text, pages } = await pdfText(buf);
      const words = text.split(/\s+/).filter(Boolean).length;
      if (pages && words / pages < 15) {
        if (ocr.enabled()) {
          const r = await ocr.ocrPdf(buf).catch((e) => ({ text: '', error: e.message }));
          const ocrWords = r.text.split(/\s+/).filter(Boolean).length;
          if (ocrWords >= 30) {
            const partial = r.total > r.pages ? ` (first ${r.pages} of ${r.total} pages)` : '';
            return `${text}\n${r.text}\n[${file.originalName}: scanned PDF — text was read with OCR${partial}; check exact values against the file]`.slice(0, MAX_CHARS);
          }
        }
        return `${text}\n[${file.originalName}: ${pages} page(s) but almost no selectable text — it looks scanned or made of screenshots; review it visually]`.slice(0, MAX_CHARS);
      }
      return text.slice(0, MAX_CHARS);
    }
    if (TEXT_TYPES.includes(ext)) return (await fs.readFile(full, 'utf8')).slice(0, MAX_CHARS);
    if (IMAGE_TYPES.includes(ext) && ocr.enabled()) {
      const { text } = await ocr.ocrImage(await fs.readFile(full));
      const c = ocr.clean(text);
      if (c.split(/\s+/).length >= 4) return `[${file.originalName} — text read from the image with OCR]\n${c}`.slice(0, MAX_CHARS);
      return `[${file.originalName}: image with little readable text — not machine-readable, needs human review]`;
    }
  } catch (e) {
    return `[Could not extract text from ${file.originalName}: ${e.message}]`;
  }
  return `[${file.originalName}: ${ext} file – not machine-readable, needs human review]`;
}

module.exports = { extractText, pdfText };
