/**
 * In-house OCR (free, offline): reads text from screenshots, images inside Word files and scanned PDF pages
 * so the AI grader isn't blind to them. Uses tesseract.js (WebAssembly) with the English + Arabic models
 * shipped in node_modules — nothing is sent anywhere.
 *
 * One worker is shared and jobs run one at a time (OCR is CPU-heavy). The worker is closed after 5 idle minutes.
 */
const fs = require('fs');
const path = require('path');
const env = require('../config/env');

const LANGS = (process.env.OCR_LANGS || 'eng+ara').split('+').filter((l) => ['eng', 'ara'].includes(l));
const MAX_PDF_PAGES = Number(process.env.OCR_MAX_PAGES || 15);
const MAX_IMAGES = Number(process.env.OCR_MAX_IMAGES || 20);
const enabled = () => process.env.OCR_ENABLED !== 'false' && env.NODE_ENV !== 'test';

let workerP = null;
let queue = Promise.resolve();
let idleTimer = null;

function langDir() {
  // tesseract.js wants one folder holding <lang>.traineddata.gz — copy them out of node_modules once
  const dir = path.resolve(env.UPLOAD_DIR, '..', '.ocr-cache');
  fs.mkdirSync(dir, { recursive: true });
  for (const l of LANGS) {
    const dst = path.join(dir, `${l}.traineddata.gz`);
    if (!fs.existsSync(dst)) {
      const pkg = path.dirname(require.resolve(`@tesseract.js-data/${l}/package.json`));
      fs.copyFileSync(path.join(pkg, '4.0.0_best_int', `${l}.traineddata.gz`), dst);
    }
  }
  return dir;
}

function getWorker() {
  if (!workerP) {
    const { createWorker } = require('tesseract.js');
    const dir = langDir();
    workerP = createWorker(LANGS.join('+'), 1, { langPath: dir, cachePath: dir, gzip: true, logger: () => {}, errorHandler: () => {} })
      .catch((e) => { workerP = null; throw e; });
  }
  clearTimeout(idleTimer);
  idleTimer = setTimeout(async () => {
    const w = workerP;
    workerP = null;
    if (w) (await w.catch(() => null))?.terminate().catch(() => {});
  }, 5 * 60 * 1000);
  idleTimer.unref?.();
  return workerP;
}

/** OCR one image buffer (png/jpg/bmp/webp). Returns { text, confidence 0-100 }. */
function ocrImage(buf) {
  const job = queue.then(async () => {
    const w = await getWorker();
    const { data } = await w.recognize(Buffer.from(buf));
    return { text: (data.text || '').replace(/[ \t]+\n/g, '\n').trim(), confidence: Math.round(data.confidence || 0) };
  });
  queue = job.catch(() => {});
  return job;
}

/** Keep only lines that look like words — OCR of icons and charts produces noise like "|| =. ~". */
function clean(text) {
  return text
    .split('\n')
    .filter((l) => (l.match(/[A-Za-z؀-ۿ]{2,}/g) || []).length >= 1)
    .join('\n')
    .trim();
}

/** Render the first pages of a PDF and OCR them. */
async function ocrPdf(buf) {
  const { PDFParse } = require('pdf-parse');
  const parser = new PDFParse({ data: buf });
  try {
    const shot = await parser.getScreenshot({ first: MAX_PDF_PAGES, desiredWidth: 1600, imageBuffer: true, imageDataUrl: false });
    const out = [];
    for (const p of shot.pages) {
      const { text } = await ocrImage(p.data);
      const c = clean(text);
      if (c) out.push(`[Page ${p.pageNumber} — text read from the page image]\n${c}`);
    }
    return { text: out.join('\n\n'), pages: shot.pages.length, total: shot.total };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/** OCR images embedded in a .docx (lab reports are often mostly screenshots). */
async function ocrDocxImages(fullPath) {
  const mammoth = require('mammoth');
  const images = [];
  await mammoth.convertToHtml({ path: fullPath }, {
    convertImage: mammoth.images.imgElement(async (img) => {
      if (images.length < MAX_IMAGES && /png|jpe?g|bmp|webp/.test(img.contentType || '')) images.push(await img.read());
      return { src: '' };
    }),
  });
  const out = [];
  for (let i = 0; i < images.length; i += 1) {
    if (images[i].length < 8 * 1024) continue; // icons, logos
    const c = clean((await ocrImage(images[i])).text);
    if (c.split(/\s+/).length >= 4) out.push(`[Screenshot ${i + 1} — text read from the image]\n${c}`);
  }
  return { text: out.join('\n\n'), images: images.length };
}

module.exports = { ocrImage, ocrPdf, ocrDocxImages, clean, enabled };
