const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const M = require('../models');
const { asyncHandler, HttpError } = require('../utils/http');
const validate = require('../middleware/validate');
const { getVapid, notify } = require('../services/notify');

const router = express.Router();

// Bell: latest notifications + unread count
router.get('/', asyncHandler(async (req, res) => {
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 30);
  const q = { user: req.user._id };
  if (req.query.unread === '1') q.readAt = null;
  const [items, unread] = await Promise.all([
    M.Notification.find(q).sort({ createdAt: -1 }).limit(limit).lean(),
    M.Notification.countDocuments({ user: req.user._id, readAt: null }),
  ]);
  res.json({ items, unread });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await M.Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Not found');
  await M.Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { readAt: new Date() } });
  res.json({ ok: true });
}));

/* ── Preferences ── */
const PREF_KEYS = ['newLead', 'repeatEnquiry', 'assigned', 'followupReminder', 'booked', 'payment', 'lost', 'import', 'dailyDigest', 'integration'];
router.get('/prefs', asyncHandler(async (req, res) => {
  const u = await M.User.findById(req.user._id).select('notifyPrefs').lean();
  const devices = await M.PushSubscription.find({ user: req.user._id }).select('userAgent createdAt lastSuccessAt endpoint').lean();
  res.json({ prefs: u.notifyPrefs || {}, devices: devices.map((d) => ({ ...d, endpoint: d.endpoint.slice(0, 40) + '…', fullEndpoint: d.endpoint })) });
}));
router.put('/prefs', validate(z.object(Object.fromEntries(PREF_KEYS.map((k) => [k, z.boolean()]))).partial()), asyncHandler(async (req, res) => {
  const set = Object.fromEntries(Object.entries(req.body).map(([k, v]) => [`notifyPrefs.${k}`, v]));
  await M.User.updateOne({ _id: req.user._id }, { $set: set });
  const u = await M.User.findById(req.user._id).select('notifyPrefs').lean();
  res.json({ prefs: u.notifyPrefs });
}));

/* ── Web push subscriptions ── */
router.get('/push/key', asyncHandler(async (_req, res) => {
  const { publicKey } = await getVapid();
  res.json({ publicKey });
}));

router.post('/push/subscribe', validate(z.object({
  endpoint: z.string().url().max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(300), auth: z.string().min(4).max(100) }),
})), asyncHandler(async (req, res) => {
  const { endpoint, keys } = req.body;
  await M.PushSubscription.findOneAndUpdate(
    { endpoint },
    { $set: { user: req.user._id, keys, userAgent: (req.get('user-agent') || '').slice(0, 250) } },
    { upsert: true }
  );
  res.json({ ok: true });
}));

router.post('/push/unsubscribe', validate(z.object({ endpoint: z.string().max(1000) })), asyncHandler(async (req, res) => {
  await M.PushSubscription.deleteOne({ endpoint: req.body.endpoint, user: req.user._id });
  res.json({ ok: true });
}));

router.post('/push/test', asyncHandler(async (req, res) => {
  const devices = await M.PushSubscription.countDocuments({ user: req.user._id });
  await notify({ users: [req.user._id], type: 'test', title: 'Notifications are working ✅', body: 'You will get alerts for new leads, reminders and more on this device.', url: '/' });
  res.json({ ok: true, devices });
}));

module.exports = router;
