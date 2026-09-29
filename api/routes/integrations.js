const express = require('express');
const { z } = require('zod');
const M = require('../models');
const config = require('../config');
const { asyncHandler, HttpError } = require('../utils/http');
const validate = require('../middleware/validate');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { csrfProtect } = require('../middleware/csrf');
const meta = require('../services/meta');

/* ───────── Public webhook (Meta calls this) ───────── */
const webhook = express.Router();

// Verification handshake when you add the callback URL in the Meta app dashboard
webhook.get('/meta/webhook', asyncHandler(async (req, res) => {
  const s = await meta.getMetaSettings();
  if (req.query['hub.mode'] === 'subscribe' && s.verifyToken && req.query['hub.verify_token'] === s.verifyToken) {
    return res.status(200).type('text/plain').send(String(req.query['hub.challenge'] || ''));
  }
  res.sendStatus(403);
}));

// Lead notifications. Raw body is needed to check Meta's HMAC signature.
webhook.post('/meta/webhook', express.raw({ type: '*/*', limit: '1mb' }), asyncHandler(async (req, res) => {
  const s = await meta.getMetaSettings();
  if (!meta.verifySignature(req.body, req.get('x-hub-signature-256'), s.appSecret)) return res.sendStatus(401);
  let payload;
  try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
  res.sendStatus(200); // acknowledge fast; Meta retries if we are slow
  await meta.saveMetaSettings({ lastWebhookAt: new Date() });
  for (const entry of payload.entry || []) {
    for (const ch of entry.changes || []) {
      if (ch.field !== 'leadgen' || !ch.value?.leadgen_id) continue;
      const v = ch.value;
      meta.processMetaLead({ leadgenId: String(v.leadgen_id), formId: String(v.form_id || ''), pageId: String(v.page_id || entry.id || ''), adId: String(v.ad_id || ''), via: 'webhook' })
        .catch((e) => console.error('[meta] webhook processing failed:', e.message));
    }
  }
}));

/* ───────── Admin settings for the integration ───────── */
const admin = express.Router();
admin.use(express.json({ limit: '100kb' }), requireAuth, csrfProtect, requirePermission('settings:manage'));

const { metaEnv, tokenPrefix } = require('../services/metaConfig');

admin.get('/meta', asyncHandler(async (_req, res) => {
  const s = await meta.getMetaSettings();
  const [recent, counts] = await Promise.all([
    M.MetaLead.find().sort({ createdAt: -1 }).limit(25).populate('lead', 'leadId name').lean(),
    M.MetaLead.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
  ]);
  res.json({
    settings: {
      pageId: s.pageId, pageName: s.pageName, graphVersion: s.graphVersion, syncMinutes: s.syncMinutes, enabled: s.enabled,
      // the token lives only in the server environment — the browser gets a yes/no and a 4-char prefix
      hasToken: s.hasToken, tokenPreview: tokenPrefix(metaEnv().token), tokenSource: 'META_PAGE_ACCESS_TOKEN (server environment)',
      hasAppSecret: !!s.appSecret, verifyToken: s.verifyToken, fromEnv: s.fromEnv,
      lastSyncAt: s.lastSyncAt, lastWebhookAt: s.lastWebhookAt, lastError: s.lastError,
      auth: { ...meta.authState(), persisted: s.auth },
    },
    webhookUrl: `${config.siteUrl}/api/integrations/meta/webhook`,
    counts: Object.fromEntries(counts.map((c) => [c._id, c.n])),
    recent,
  });
}));

// Non-secret settings only. The access token cannot be saved here (env var only).
admin.put('/meta', validate(z.object({
  pageId: z.string().regex(/^\d{5,25}$/, 'Page ID is the numeric ID of your Facebook Page').or(z.literal('')).optional(),
  appSecret: z.string().max(100).optional(),
  verifyToken: z.string().min(8, 'Use at least 8 characters').max(100).optional(),
  graphVersion: z.string().regex(/^v\d{1,2}\.\d$/).optional(),
  syncMinutes: z.coerce.number().int().min(0).max(1440).optional(),
  enabled: z.boolean().optional(),
})), asyncHandler(async (req, res) => {
  const patch = { ...req.body };
  delete patch.pageAccessToken;
  if (!patch.appSecret) delete patch.appSecret; // empty = keep the existing value
  await meta.saveMetaSettings(patch);
  res.json({ ok: true });
}));

// Full check: token → Page → lead forms → leads. Never returns the token.
admin.post('/meta/test', asyncHandler(async (_req, res) => {
  const r = await meta.validateAuth();
  if (!r.ok) {
    const err = new HttpError(r.problem.kind === 'missing_config' ? 422 : 400, `${r.problem.label}: ${r.problem.message} — ${r.problem.hint}`);
    err.details = r;
    throw err;
  }
  res.json({ ok: true, page: { id: r.page.id, name: r.page.name }, forms: r.leadForms.forms, webhookSubscribed: r.webhookSubscribed, report: r });
}));

// Subscribe this app to the Page's leadgen events (needed for the instant webhook)
admin.post('/meta/subscribe', asyncHandler(async (_req, res) => {
  const s = await meta.getMetaSettings();
  try {
    const r = await meta.graph(`${s.pageId}/subscribed_apps`, { method: 'POST', params: { subscribed_fields: 'leadgen' } });
    res.json({ ok: !!r.success });
  } catch (e) { throw new HttpError(400, `Meta says: ${e.message}`); }
}));

// Pull leads now (backfill up to 90 days — Meta keeps leads for 90 days)
admin.post('/meta/sync', validate(z.object({ days: z.coerce.number().int().min(1).max(90).default(7) })), asyncHandler(async (req, res) => {
  try {
    const summary = await meta.syncLeads({ since: new Date(Date.now() - req.body.days * 86400000), via: 'sync' });
    res.json({ ok: true, summary });
  } catch (e) { throw new HttpError(400, e.message); }
}));

// Retry leads that failed
admin.post('/meta/retry', asyncHandler(async (_req, res) => {
  const failed = await M.MetaLead.find({ status: 'error' }).limit(100).lean();
  const results = [];
  for (const f of failed) results.push(await meta.processMetaLead({ leadgenId: f.leadgenId, formId: f.formId, pageId: f.pageId, via: f.via }));
  res.json({ ok: true, retried: failed.length, fixed: results.filter((r) => r.status !== 'error').length });
}));

/* ───────── GET /api/meta/health — admin only, safe diagnostics (no token) ───────── */
const health = express.Router();
health.get('/health', requireAuth, requirePermission('settings:manage'), asyncHandler(async (req, res) => {
  const s = await meta.getMetaSettings();
  const r = req.query.live === '0' ? null : await meta.validateAuth();
  const a = meta.authState();
  res.json({
    configured: !!(s.pageId && s.hasToken),
    pageConfigured: !!s.pageId,
    tokenConfigured: s.hasToken,
    metaReachable: r ? r.metaReachable : null,
    authenticated: r ? r.ok : a.status === 'ok',
    sync: { enabled: s.enabled, everyMinutes: s.syncMinutes, status: a.status, lastSyncAt: s.lastSyncAt, lastWebhookAt: s.lastWebhookAt, lastError: s.lastError, nextRetryAt: a.nextRetryAt },
    ...(r ? { check: r } : {}),
  });
}));

module.exports = { webhook, admin, health };
