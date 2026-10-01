const router = require('express').Router();
const Notification = require('../models/Notification');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { asyncHandler } = require('../utils/errors');
const { z, objectId } = require('../utils/schemas');

router.use(requireAuth);

router.get(
  '/',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20), unread: z.enum(['1', '0']).optional(), lang: z.enum(['en', 'ar']).optional() }) }),
  asyncHandler(async (req, res) => {
    const filter = { user: req.user._id };
    if (req.validatedQuery.unread === '1') filter.readAt = null;
    const [items, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).limit(req.validatedQuery.limit),
      Notification.countDocuments({ user: req.user._id, readAt: null }),
    ]);
    const lang = req.validatedQuery.lang || req.user.preferences?.language || 'en';
    const { tr } = require('../services/i18n');
    res.json({ items: items.map((n) => ({ ...n.toJSON(), title: tr(n.title, lang), body: tr(n.body, lang) })), unread });
  })
);

router.post(
  '/read',
  validate({ body: z.object({ ids: z.array(objectId).max(100).optional() }) }),
  asyncHandler(async (req, res) => {
    const filter = { user: req.user._id, readAt: null }; // always scoped to the caller
    if (req.body.ids) filter._id = { $in: req.body.ids };
    const r = await Notification.updateMany(filter, { readAt: new Date() });
    res.json({ updated: r.modifiedCount });
  })
);

module.exports = router;
