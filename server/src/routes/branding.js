const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const Company = require('../models/Company');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { uploadFiles, verifyFiles, removeFiles, UPLOAD_DIR } = require('../middleware/upload');
const { asyncHandler, AppError } = require('../utils/errors');
const { z, objectId } = require('../utils/schemas');
const { audit } = require('../models/AuditLog');

const view = (c) => (c ? {
  companyId: c._id, name: c.name, accentColor: c.accentColor || null,
  logoUrl: c.logo?.storedName ? `/api/branding/logo/${c._id}?v=${new Date(c.logo.updatedAt || 0).getTime()}` : null,
} : null);

/* Public: the logo image (logos aren't secret; <img> tags can't send our Bearer token) */
router.get(
  '/logo/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const c = await Company.findById(req.params.id).select('logo');
    if (!c?.logo?.storedName) throw new AppError(404, 'Not found');
    res.setHeader('Content-Type', c.logo.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.sendFile(path.basename(c.logo.storedName), { root: UPLOAD_DIR, dotfiles: 'allow' });
  })
);

router.use(requireAuth);

/* Branding for the signed-in user (customer side only — platform staff see the platform look) */
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    if (!req.user.company) return res.json({ branding: null });
    res.json({ branding: view(await Company.findById(req.user.company).select('name accentColor logo')) });
  })
);

async function loadEditable(req) {
  const c = await Company.findById(req.params.id);
  if (!c) throw new AppError(404, 'Not found');
  const u = req.user;
  if (u.role === 'super_admin') return c;
  if (u.role === 'company_admin' && String(u.company) === String(c._id)) return c;
  throw new AppError(404, 'Not found');
}

router.get(
  '/:id',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => res.json({ branding: view(await loadEditable(req)) }))
);

router.put(
  '/:id',
  validate({ params: z.object({ id: objectId }), body: z.object({ accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable() }) }),
  asyncHandler(async (req, res) => {
    const c = await loadEditable(req);
    c.accentColor = req.body.accentColor || undefined;
    await c.save();
    await audit(req, 'company.branding', { target: String(c._id), meta: { accentColor: c.accentColor } });
    res.json({ branding: view(c) });
  })
);

router.post(
  '/:id/logo',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res, next) => { req.company = await loadEditable(req); next(); }),
  uploadFiles({ maxFileMB: 1, maxFiles: 1 }),
  asyncHandler(async (req, res) => {
    const f = req.files?.[0];
    if (!f) throw new AppError(400, 'Choose a PNG or JPG image');
    await verifyFiles([f], ['png', 'jpg', 'jpeg']); // no SVG: it can carry script
    const c = req.company;
    const old = c.logo?.storedName;
    c.logo = { storedName: f.filename, mimeType: f.mimetype === 'image/png' ? 'image/png' : 'image/jpeg', updatedAt: new Date() };
    await c.save();
    if (old) await removeFiles([{ path: path.join(UPLOAD_DIR, old) }]);
    await audit(req, 'company.logo', { target: String(c._id) });
    res.status(201).json({ branding: view(c) });
  })
);

router.delete(
  '/:id/logo',
  validate({ params: z.object({ id: objectId }) }),
  asyncHandler(async (req, res) => {
    const c = await loadEditable(req);
    const old = c.logo?.storedName;
    c.logo = undefined;
    await c.save();
    if (old) await removeFiles([{ path: path.join(UPLOAD_DIR, old) }]);
    res.json({ branding: view(c) });
  })
);

/** Logo as a data URL for PDFs (certificates), or null */
async function logoDataUrl(companyId) {
  const c = companyId && (await Company.findById(companyId).select('logo'));
  if (!c?.logo?.storedName) return null;
  try {
    const buf = await fs.promises.readFile(path.join(UPLOAD_DIR, path.basename(c.logo.storedName)));
    return `data:${c.logo.mimeType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

module.exports = router;
module.exports.logoDataUrl = logoDataUrl;
