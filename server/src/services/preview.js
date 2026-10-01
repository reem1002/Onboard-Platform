const fs = require('fs/promises');
const path = require('path');
const { UPLOAD_DIR } = require('../middleware/upload');

const TEXT = ['txt', 'csv', 'json', 'log', 'md'];
const MAX_TEXT = 400000;

/**
 * Server-side preview for formats a browser can't show by itself.
 *  - docx → HTML (with embedded screenshots as data: images). The client renders it inside a sandboxed
 *    iframe (no scripts, no same-origin), so even a hostile document can't run code in the app.
 *  - text formats → plain text
 *  - pdf / images → the client shows the original file (blob) directly, no conversion needed
 */
async function buildPreview(file) {
  const ext = (file.originalName.split('.').pop() || '').toLowerCase();
  const full = path.join(UPLOAD_DIR, path.basename(file.storedName));
  if (ext === 'docx') {
    const mammoth = require('mammoth');
    const { value, messages } = await mammoth.convertToHtml({ path: full }, {
      convertImage: mammoth.images.imgElement(async (image) => {
        const type = /^image\/(png|jpe?g|gif|webp|bmp)$/.test(image.contentType) ? image.contentType : null;
        if (!type) return { src: '' }; // drop EMF/WMF/SVG etc.
        return { src: `data:${type};base64,${await image.read('base64')}` };
      }),
    });
    const html = value.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/\son\w+="[^"]*"/gi, '').replace(/javascript:/gi, '');
    return { kind: 'html', html, warnings: messages.filter((m) => m.type === 'warning').length };
  }
  if (TEXT.includes(ext)) {
    const text = (await fs.readFile(full, 'utf8')).slice(0, MAX_TEXT);
    return { kind: 'text', text, truncated: text.length >= MAX_TEXT };
  }
  if (ext === 'pdf') return { kind: 'pdf' };
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return { kind: 'image' };
  return { kind: 'none' };
}

module.exports = { buildPreview };
