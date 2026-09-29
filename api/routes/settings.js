const express = require('express');
const { z } = require('zod');
const M = require('../models');
const { asyncHandler, HttpError } = require('../utils/http');
const { cleanText, slugify } = require('../utils/text');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { getLookups, invalidateLookups } = require('../services/lookups');
const config = require('../config');
const { mailEnabled } = require('../services/mailer');

const router = express.Router();
const txt = (max) => z.preprocess((v) => cleanText(v), z.string().max(max));
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value like #7040F0');
const common = { label: txt(80).pipe(z.string().min(1, 'Label is required')), order: z.coerce.number().int().optional(), active: z.boolean().optional() };

/** type → model, schema, and how to check whether an entry is still used */
const TYPES = {
  statuses: {
    model: M.PipelineStatus,
    schema: z.object({
      ...common, key: z.string().regex(/^[A-Z0-9_]{2,30}$/, 'Key must be UPPER_CASE').optional(), color: color.optional(),
      showOnBoard: z.boolean().optional(), requiresReason: z.boolean().optional(), isBooked: z.boolean().optional(),
      isWon: z.boolean().optional(), isLost: z.boolean().optional(), needsBudget: z.boolean().optional(),
    }),
    keyFrom: (b) => b.key || slugify(b.label).replace(/-/g, '_').toUpperCase(),
    inUse: (doc) => M.Lead.exists({ status: doc.key }),
    immutableKey: true,
  },
  services: {
    model: M.Service,
    schema: z.object({ ...common, slug: z.string().regex(/^[a-z0-9-]{2,60}$/).optional() }),
    keyField: 'slug', keyFrom: (b) => b.slug || slugify(b.label),
    inUse: (doc) => M.Lead.exists({ service: doc._id }),
  },
  sources: {
    model: M.LeadSource,
    schema: z.object({ ...common, key: z.string().regex(/^[a-z0-9_]{2,30}$/).optional() }),
    keyFrom: (b) => b.key || slugify(b.label).replace(/-/g, '_'),
    inUse: (doc) => M.Lead.exists({ source: doc._id }),
    immutableKey: true,
  },
  'lost-reasons': { model: M.LostReason, schema: z.object(common), inUse: (doc) => M.Lead.exists({ lostReason: doc._id }) },
  'followup-types': {
    model: M.FollowupType,
    schema: z.object({ ...common, key: z.string().regex(/^[a-z0-9_]{2,30}$/).optional() }),
    keyFrom: (b) => b.key || slugify(b.label).replace(/-/g, '_'),
    inUse: (doc) => M.Followup.exists({ type: doc.key }),
    immutableKey: true,
  },
};

function typeDef(req) {
  const def = TYPES[req.params.type];
  if (!def) throw new HttpError(404, 'Unknown settings list');
  return def;
}

// All master data — every signed-in user needs this for dropdowns
router.get('/lookups', asyncHandler(async (_req, res) => {
  const L = await getLookups();
  const campaigns = await M.Campaign.find().sort({ createdAt: -1 }).limit(500).lean();
  res.json({ ...L, campaigns });
}));

router.post('/:type', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  const def = typeDef(req);
  const parsed = def.schema.safeParse(req.body);
  if (!parsed.success) throw new HttpError(422, parsed.error.issues[0].message);
  const b = parsed.data;
  if (b.min != null && b.max != null && b.min > b.max) throw new HttpError(422, 'Minimum cannot exceed maximum');
  const doc = { ...b };
  if (def.keyFrom) doc[def.keyField || 'key'] = def.keyFrom(b);
  if (doc.order === undefined) doc.order = (await def.model.countDocuments()) + 1;
  const created = await def.model.create(doc);
  invalidateLookups();
  res.status(201).json({ item: created });
}));

router.patch('/:type/:id', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  const def = typeDef(req);
  const parsed = def.schema.partial().safeParse(req.body);
  if (!parsed.success) throw new HttpError(422, parsed.error.issues[0].message);
  const doc = await def.model.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'Not found');
  const b = { ...parsed.data };
  if (def.immutableKey) delete b.key; // keys are referenced by leads
  if (req.params.type === 'services') delete b.slug; // slugs are used in website URLs/forms
  if (doc.isSystem && b.active === false) throw new HttpError(422, 'This entry is required by the system and cannot be deactivated');
  Object.assign(doc, b);
  if (doc.min != null && doc.max != null && doc.min > doc.max) throw new HttpError(422, 'Minimum cannot exceed maximum');
  await doc.save();
  invalidateLookups();
  res.json({ item: doc });
}));

router.delete('/:type/:id', requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  const def = typeDef(req);
  const doc = await def.model.findById(req.params.id);
  if (!doc) throw new HttpError(404, 'Not found');
  if (doc.isSystem) throw new HttpError(422, 'This entry is required by the system and cannot be deleted');
  if (await def.inUse(doc)) {
    doc.active = false;
    await doc.save();
    invalidateLookups();
    return res.json({ ok: true, deactivated: true, message: 'Entry is used by existing records, so it was deactivated instead of deleted.' });
  }
  await doc.deleteOne();
  invalidateLookups();
  res.json({ ok: true });
}));

router.post('/:type/reorder', requirePermission('settings:manage'), validate(z.object({ ids: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1) })),
  asyncHandler(async (req, res) => {
    const def = typeDef(req);
    await Promise.all(req.body.ids.map((id, i) => def.model.updateOne({ _id: id }, { $set: { order: i + 1 } })));
    invalidateLookups();
    res.json({ ok: true });
  }));

/* ── App-level settings (key/value) ── */
const APP_DEFAULTS = {
  defaultReminderMinutes: 15,
  defaultFollowupTime: '11:00',
  whatsappTemplate: "Hi {{name}}, this is Digital Guru regarding your enquiry{{service_for}}. We'd love to discuss your requirements. When is a good time to talk?",
  emailSubject: 'Your enquiry with Digital Guru',
  emailTemplate: "Hi {{name}},\n\nThank you for reaching out to Digital Guru{{service_for}}. We'd love to understand your goals and share how we can help.\n\nWhen would be a good time for a quick call?\n\nWarm regards,\n{{user}}\nDigital Guru",
};

async function readAppSettings() {
  const rows = await M.AppSetting.find({ key: { $in: Object.keys(APP_DEFAULTS) } }).lean();
  return { ...APP_DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) };
}

router.get('/app', asyncHandler(async (_req, res) => res.json({
  settings: await readAppSettings(),
  timezone: config.timezone,
  emailConfigured: mailEnabled(),
  siteUrl: config.siteUrl,
})));

router.put('/app', requirePermission('settings:manage'),
  validate(z.object({
    defaultReminderMinutes: z.coerce.number().int().min(0).max(10080),
    defaultFollowupTime: z.string().regex(/^\d{2}:\d{2}$/),
    whatsappTemplate: z.string().max(1000),
    emailSubject: z.string().max(200),
    emailTemplate: z.string().max(4000),
  }).partial()),
  asyncHandler(async (req, res) => {
    await Promise.all(Object.entries(req.body).map(([key, value]) => M.AppSetting.updateOne({ key }, { $set: { value } }, { upsert: true })));
    res.json({ settings: await readAppSettings() });
  }));

module.exports = router;
module.exports.APP_DEFAULTS = APP_DEFAULTS;
