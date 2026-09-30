const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const env = require('../config/env');
const { AppError } = require('../utils/errors');

const dir = path.resolve(env.UPLOAD_DIR);
fs.mkdirSync(dir, { recursive: true });

// Magic-byte → allowed extensions. Office Open XML files are ZIP containers.
const SIGNATURES = {
  pdf: ['pdf'],
  docx: ['docx', 'zip'],
  xlsx: ['xlsx', 'zip'],
  pptx: ['pptx', 'zip'],
  zip: ['zip'],
  png: ['png'],
  jpg: ['jpg'],
  pcap: ['pcap'],
  pcapng: ['pcapng', 'pcap'],
};
// Plain-text formats: no magic bytes, so we reject binary content instead
const TEXT_TYPES = ['txt', 'csv', 'json', 'log', 'md'];

/** Everything an instructor may attach to an assignment as a resource. */
const ATTACHMENT_TYPES = ['pdf', 'docx', 'xlsx', 'pptx', 'zip', 'png', 'jpg', 'jpeg', 'pcap', 'pcapng', ...TEXT_TYPES];

const MB = 1024 * 1024;
const storage = multer.diskStorage({
  destination: dir,
  filename: (_req, _file, cb) => cb(null, crypto.randomUUID()),
});

/**
 * OWASP A04/A08 – unrestricted file upload defences:
 *  - random server-side filename (no path traversal, no overwrite, no executable extension)
 *  - size + count limits (per request: the route decides the limit, capped by MAX_UPLOAD_MB)
 *  - extension allow-list AND magic-byte verification after upload
 *  - stored outside the web root; served only through an authorized download route
 */
function uploadFiles({ maxFileMB = env.MAX_UPLOAD_MB, maxFiles = 10 } = {}) {
  const limitMB = Math.min(maxFileMB, env.MAX_UPLOAD_MB);
  const m = multer({ storage, limits: { fileSize: limitMB * MB, files: maxFiles, fields: 5 } }).array('files', maxFiles);
  return (req, res, next) =>
    m(req, res, (err) => {
      if (!err) return next();
      // Clean up anything written before the limit was hit
      Promise.all((req.files || []).map((f) => fs.promises.unlink(f.path).catch(() => {}))).finally(() => {
        if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, `Each file must be ${limitMB} MB or smaller`));
        if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') return next(new AppError(400, `Maximum ${maxFiles} files`));
        next(err);
      });
    });
}

// Kept for older call sites
const upload = multer({ storage, limits: { fileSize: env.MAX_UPLOAD_MB * MB, files: 10, fields: 5 } });

const removeFiles = (files) => Promise.all((files || []).map((x) => fs.promises.unlink(x.path).catch(() => {})));

async function verifyFiles(files, allowedExts) {
  const FileType = require('file-type');
  for (const f of files) {
    const ext = (path.extname(f.originalname).slice(1) || '').toLowerCase();
    const bad = async (msg) => {
      await removeFiles(files);
      throw new AppError(400, msg);
    };
    if (!allowedExts.includes(ext) && !(ext === 'jpeg' && allowedExts.includes('jpg'))) await bad(`File type .${ext || '?'} is not accepted here`);

    if (TEXT_TYPES.includes(ext)) {
      const buf = await fs.promises.readFile(f.path);
      if (buf.includes(0)) await bad(`${f.originalname} is not a valid text file`);
      continue;
    }
    const detected = await FileType.fromFile(f.path);
    const ok = detected && (SIGNATURES[ext === 'jpeg' ? 'jpg' : ext] || []).includes(detected.ext);
    if (!ok) await bad(`${f.originalname} content does not match its extension`);
  }
}

/** Send a stored file safely (download only, never rendered inline). */
function sendStored(res, storedName, originalName, mimeType) {
  const safe = path.basename(storedName);
  res.setHeader('Content-Type', mimeType || 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  res.setHeader('Content-Disposition', `attachment; filename="${originalName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '')}"; filename*=UTF-8''${encodeURIComponent(originalName)}`);
  return res.sendFile(safe, { root: dir, dotfiles: 'allow' });
}

module.exports = { upload, uploadFiles, verifyFiles, removeFiles, sendStored, UPLOAD_DIR: dir, ATTACHMENT_TYPES, MB };
