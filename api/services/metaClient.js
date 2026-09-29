/**
 * Meta Graph API client (server side only).
 *
 *  - The token comes only from META_PAGE_ACCESS_TOKEN (see metaConfig.js), read at call time.
 *  - A Business System User token is a *user-type* token. Page endpoints such as
 *    /{page-id}/leadgen_forms must be called with a *Page* token, so we ask Meta for the Page's
 *    token once (GET /{page-id}?fields=access_token — Meta's documented way for system users)
 *    and keep it in process memory only. If META_PAGE_ACCESS_TOKEN is already a Page token,
 *    it is used as is. Nothing is refreshed, written to MongoDB or logged.
 *  - Meta errors are classified (expired / invalid / permission / page access / app secret /
 *    rate limit / Meta error / network) and auth problems pause auto-sync with a back-off
 *    instead of failing every minute.
 */
const crypto = require('crypto');
const M = require('../models');
const { metaEnv, tokenPrefix, tokenFingerprint, redact } = require('./metaConfig');

const DEFAULTS = { graphVersion: 'v25.0', syncMinutes: 5 };
const REQUIRED_SCOPES = ['leads_retrieval', 'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'pages_manage_ads'];
const RECOMMENDED_SCOPES = ['ads_management', 'business_management'];

/* ───────── settings (non-secret values may come from the admin panel) ───────── */
async function getMetaSettings() {
  const row = await M.AppSetting.findOne({ key: 'meta' }).lean();
  const v = row?.value || {};
  const env = metaEnv();
  return {
    pageId: env.pageId || v.pageId || '',
    appSecret: env.appSecret || v.appSecret || '',
    verifyToken: env.verifyToken || v.verifyToken || '',
    graphVersion: env.graphVersion || v.graphVersion || DEFAULTS.graphVersion,
    syncMinutes: v.syncMinutes ?? (env.syncMinutes !== '' ? Number(env.syncMinutes) : DEFAULTS.syncMinutes),
    hasToken: !!env.token, // the token itself is never part of settings
    fromEnv: { pageId: !!env.pageId, appSecret: !!env.appSecret, verifyToken: !!env.verifyToken, graphVersion: !!env.graphVersion },
    enabled: v.enabled !== false,
    lastSyncAt: v.lastSyncAt || null,
    lastWebhookAt: v.lastWebhookAt || null,
    lastError: v.lastError || '',
    pageName: v.pageName || '',
    auth: v.auth || null,
  };
}

async function saveMetaSettings(patch) {
  const set = {};
  for (const [k, val] of Object.entries(patch)) if (k !== 'pageAccessToken') set[`value.${k}`] = val;
  if (Object.keys(set).length) await M.AppSetting.updateOne({ key: 'meta' }, { $set: set }, { upsert: true });
}

/* ───────── errors ───────── */
const KIND = {
  missing_config: { label: 'Not configured', fatal: true, hint: 'Set META_PAGE_ID and META_PAGE_ACCESS_TOKEN in Render → Environment, then redeploy.' },
  expired: { label: 'Token expired', fatal: true, hint: 'Generate a new System User token with Token expiration “Never” and replace META_PAGE_ACCESS_TOKEN on Render.' },
  invalid: { label: 'Token invalid', fatal: true, hint: 'Meta rejects this token (revoked, mistyped, or from another app). Generate a new System User token and replace META_PAGE_ACCESS_TOKEN on Render.' },
  permission: { label: 'Missing permission', fatal: true, hint: `Regenerate the System User token with: ${REQUIRED_SCOPES.join(', ')} (plus ${RECOMMENDED_SCOPES.join(', ')}).` },
  page_access: { label: 'No access to the Page', fatal: true, hint: 'Business Settings → Users → System users → your system user → Assign assets → Pages → this Page (full control, or at least Leads/Ads access), then generate a new token. Also check Business Settings → Integrations → Leads access allows your app.' },
  app_secret: { label: 'App secret mismatch', fatal: true, hint: 'META_APP_SECRET (or App secret in Settings) must belong to the same Meta app the System User token was generated for. Fix it or clear it.' },
  rate_limit: { label: 'Meta rate limit', fatal: false, hint: 'Meta is throttling requests; sync retries automatically.' },
  meta_api: { label: 'Meta API error', fatal: false, hint: 'Temporary Meta error; sync retries automatically.' },
  network: { label: 'Meta not reachable', fatal: false, hint: 'Network error or timeout reaching graph.facebook.com; sync retries automatically.' },
};

class MetaError extends Error {
  constructor(kind, message, extra = {}) {
    super(redact(message));
    this.name = 'MetaError';
    this.kind = kind;
    Object.assign(this, extra);
  }
  get fatal() { return !!KIND[this.kind]?.fatal; }
}

function classify(httpStatus, e = {}) {
  const code = Number(e.code);
  const sub = Number(e.error_subcode);
  const msg = String(e.message || '').toLowerCase();
  if (msg.includes('appsecret_proof')) return 'app_secret';
  if (msg.includes('must be called with a page access token') || msg.includes('page access token is required')) return 'page_access';
  if (code === 190 || code === 102 || (e.type === 'OAuthException' && msg.includes('access token'))) {
    if (sub === 463 || msg.includes('has expired')) return 'expired';
    if (sub === 492) return 'page_access';
    return 'invalid';
  }
  if (code === 100 && (sub === 33 || msg.includes('missing permissions') || msg.includes('does not exist, cannot be loaded'))) return 'page_access';
  if (code === 10 || code === 283 || code === 294 || (code >= 200 && code <= 299)) return 'permission';
  if ([4, 17, 32, 613].includes(code) || (code >= 80000 && code <= 80014)) return 'rate_limit';
  return 'meta_api';
}

/* ───────── low-level request ───────── */
const graphBase = () => (process.env.META_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/$/, '');

async function request(path, { params = {}, method = 'GET', token, appSecret, version, proof = true } = {}) {
  if (!token) throw new MetaError('missing_config', 'META_PAGE_ACCESS_TOKEN is not set');
  const url = new URL(`${graphBase()}/${version || DEFAULTS.graphVersion}/${String(path).replace(/^\//, '')}`);
  const body = new URLSearchParams({ ...params, access_token: token });
  if (proof && appSecret) body.set('appsecret_proof', crypto.createHmac('sha256', appSecret).update(token).digest('hex'));
  let res;
  try {
    if (method === 'GET') {
      body.forEach((v, k) => url.searchParams.set(k, v));
      res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    } else {
      res = await fetch(url, { method, body, signal: AbortSignal.timeout(15000) });
    }
  } catch (err) {
    throw new MetaError('network', `Could not reach Meta: ${err.name === 'TimeoutError' ? 'timeout after 15s' : err.cause?.code || err.message}`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    const kind = res.status >= 500 && !e.code ? 'meta_api' : classify(res.status, e);
    throw new MetaError(kind, e.message || `Graph API error ${res.status}`, {
      code: e.code, subcode: e.error_subcode, type: e.type, httpStatus: res.status, fbtraceId: e.fbtrace_id,
    });
  }
  return data;
}

/* ───────── Page token (memory only) ───────── */
let pageTokenCache = null; // { fp, pageId, token, derived, name, at }
const PAGE_TOKEN_TTL = 6 * 3600 * 1000;

async function resolvePageToken(s, { force = false } = {}) {
  const { token } = metaEnv();
  if (!token || !s.pageId) throw new MetaError('missing_config', `${!s.pageId ? 'META_PAGE_ID' : 'META_PAGE_ACCESS_TOKEN'} is not set`);
  const fp = tokenFingerprint(token);
  const c = pageTokenCache;
  if (!force && c && c.fp === fp && c.pageId === s.pageId && Date.now() - c.at < PAGE_TOKEN_TTL) return c;
  const page = await request(s.pageId, { params: { fields: 'id,name,access_token' }, token, appSecret: s.appSecret, version: s.graphVersion });
  pageTokenCache = {
    fp, pageId: s.pageId, at: Date.now(), name: page.name || '',
    token: page.access_token || token,
    derived: !!page.access_token && page.access_token !== token,
  };
  return pageTokenCache;
}

let context = 'call'; // 'sync' while the scheduler/manual sync runs (sets the back-off step)
async function inContext(where, fn) {
  const prev = context; context = where;
  try { return await fn(); } finally { context = prev; }
}

/** Page-scoped Graph call used by the whole Meta integration. */
async function graph(path, { params = {}, method = 'GET', version } = {}) {
  const s = await getMetaSettings();
  try {
    const pt = await resolvePageToken(s);
    return await request(path, { params, method, token: pt.token, appSecret: s.appSecret, version: version || s.graphVersion });
  } catch (e) {
    if (e instanceof MetaError && e.fatal) {
      pageTokenCache = null;
      await noteFailure(e, context); // no-op if already recorded
    }
    throw e;
  }
}

/* ───────── auth state + back-off ───────── */
const auth = { status: 'unknown', kind: '', message: '', since: null, failures: 0, nextRetryAt: 0, fp: '', lastOkAt: null, notified: false };
const retryBaseMin = () => Math.max(1, Number(process.env.META_AUTH_RETRY_MINUTES) || 15);
const backoffMs = (n) => Math.min(retryBaseMin() * 2 ** Math.max(0, n - 1), 360) * 60000; // 15m → 30m → 1h … max 6h
const at = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

async function persistAuth() {
  await saveMetaSettings({ auth: { status: auth.status, kind: auth.kind, message: auth.message, since: auth.since, nextRetryAt: auth.nextRetryAt ? new Date(auth.nextRetryAt) : null, checkedAt: new Date() } }).catch(() => {});
}

async function notifyAdmins(title, body) {
  try {
    const { notify, admins } = require('./notify');
    await notify({ users: await admins(), type: 'integration_error', title, body: body.slice(0, 160), url: '/settings?tab=integrations' });
  } catch { /* notifications are best-effort */ }
}

/** Record a failure. Logs only on a change of state or at a scheduled retry — never every tick. */
async function noteFailure(err, where = 'sync') {
  if (err && err.noted && where !== 'check') return;
  if (err) err.noted = true;
  const e = err instanceof MetaError ? err : new MetaError('meta_api', err?.message || 'Unknown error');
  const k = KIND[e.kind] || KIND.meta_api;
  const fp = tokenFingerprint(metaEnv().token);
  if (k.fatal) {
    const changed = auth.status !== 'unavailable' || auth.kind !== e.kind || auth.fp !== fp;
    if (changed) { auth.failures = 0; auth.since = new Date(); auth.notified = false; }
    if (changed || where === 'sync') {
      auth.failures += 1;
      auth.nextRetryAt = Date.now() + backoffMs(auth.failures);
    }
    Object.assign(auth, { status: 'unavailable', kind: e.kind, message: e.message, fp });
    if (changed) console.error(`[META] sync unavailable — ${k.label}${e.code ? ` (Meta code ${e.code}${e.subcode ? `/${e.subcode}` : ''})` : ''}: ${e.message} → ${k.hint} Next check ${at(auth.nextRetryAt)}.`);
    else if (where === 'sync') console.error(`[META] still unavailable (${k.label}); next check ${at(auth.nextRetryAt)}`);
    if (!auth.notified) { auth.notified = true; await notifyAdmins(`Meta lead sync paused: ${k.label}`, `${e.message} — ${k.hint}`); }
    await saveMetaSettings({ lastError: `${new Date().toISOString()} — ${k.label}: ${e.message}` }).catch(() => {});
    await persistAuth();
    return;
  }
  // transient (network / rate limit / Meta 5xx): keep status, retry sooner
  if (where !== 'sync') return;
  auth.failures = auth.status === 'unavailable' ? auth.failures : auth.failures + 1;
  const mins = Math.min(2 ** Math.max(0, auth.failures - 1), 30);
  auth.nextRetryAt = Date.now() + mins * 60000;
  if (auth.status !== 'unavailable') auth.status = 'degraded';
  Object.assign(auth, { kind: e.kind, message: e.message });
  console.warn(`[META] sync failed — ${k.label}: ${e.message}. Retrying in ${mins} min.`);
  await saveMetaSettings({ lastError: `${new Date().toISOString()} — ${k.label}: ${e.message}` }).catch(() => {});
  await persistAuth();
}

let resumePending = false;
const consumeResume = () => { const r = resumePending; resumePending = false; return r; };

async function noteOk(where = 'sync') {
  if (auth.status === 'ok') { auth.lastOkAt = new Date(); return; }
  const was = auth.status;
  Object.assign(auth, { status: 'ok', kind: '', message: '', since: new Date(), failures: 0, nextRetryAt: 0, lastOkAt: new Date(), notified: false, fp: tokenFingerprint(metaEnv().token) });
  if (was === 'unavailable' || was === 'degraded') {
    if (where !== 'sync') resumePending = true; // e.g. “Check again now” → sync straight away
    console.log(`[META] authentication OK — lead sync resumed (${where})`);
    if (was === 'unavailable') await notifyAdmins('Meta lead sync resumed', 'Meta accepted the token again; missed leads are pulled on the next sync.');
  }
  if (was === 'unavailable' || was === 'degraded') await saveMetaSettings({ lastError: '' }).catch(() => {});
  await persistAuth();
}

/** Should the scheduler try now? Silent while backing off; a new token resets the back-off. */
function syncGate() {
  if (auth.status !== 'unavailable' && auth.status !== 'degraded') return { allowed: true, retrying: false };
  if (auth.fp && auth.fp !== tokenFingerprint(metaEnv().token)) { auth.nextRetryAt = 0; return { allowed: true, retrying: true }; }
  if (Date.now() < auth.nextRetryAt) return { allowed: false };
  return { allowed: true, retrying: true };
}

let missingLogged = false;
async function noteMissingConfig() {
  if (auth.status === 'not_configured') return;
  auth.status = 'not_configured';
  if (!missingLogged) { missingLogged = true; console.warn(`[META] auto-sync off — ${KIND.missing_config.hint}`); }
  await persistAuth();
}

function authState() {
  return { status: auth.status, kind: auth.kind, label: KIND[auth.kind]?.label || '', message: auth.message, hint: KIND[auth.kind]?.hint || '', since: auth.since, nextRetryAt: auth.nextRetryAt ? new Date(auth.nextRetryAt) : null, lastOkAt: auth.lastOkAt };
}

/* ───────── full check: token → page → lead forms → leads ───────── */
async function inspectToken(s, token) {
  const read = (d) => {
    const x = d?.data || {};
    const scopes = x.scopes || [];
    return {
      valid: x.is_valid !== false, type: x.type || '', appId: x.app_id || '', application: x.application || '',
      expiresAt: x.expires_at === 0 ? 'never' : x.expires_at ? new Date(x.expires_at * 1000).toISOString() : null,
      dataAccessExpiresAt: x.data_access_expires_at ? new Date(x.data_access_expires_at * 1000).toISOString() : null,
      scopes, missingScopes: scopes.length ? REQUIRED_SCOPES.filter((sc) => !scopes.includes(sc)) : [],
      error: x.error || null,
    };
  };
  try {
    return read(await request('debug_token', { params: { input_token: token }, token, appSecret: s.appSecret, version: s.graphVersion }));
  } catch (e) {
    if (e.fatal && e.kind !== 'permission') throw e;
  }
  // some tokens may not inspect themselves — use the app token when the app secret is known
  if (!s.appSecret) return null;
  try {
    const app = await request('app', { params: { fields: 'id' }, token, appSecret: s.appSecret, version: s.graphVersion });
    return read(await request('debug_token', { params: { input_token: token }, token: `${app.id}|${s.appSecret}`, proof: false, version: s.graphVersion }));
  } catch (e) {
    if (e.fatal && e.kind !== 'permission' && e.kind !== 'app_secret') throw e;
    return null;
  }
}

async function validateAuth({ record = true } = {}) {
  const s = await getMetaSettings();
  const { token } = metaEnv();
  const report = {
    ok: false, checkedAt: new Date().toISOString(),
    config: { pageConfigured: !!s.pageId, tokenConfigured: !!token, tokenSource: 'env:META_PAGE_ACCESS_TOKEN', tokenPrefix: tokenPrefix(token), appSecretConfigured: !!s.appSecret, graphVersion: s.graphVersion },
    metaReachable: null, token: null, page: null, leadForms: null, leadsReadable: null, webhookSubscribed: null, problem: null, warnings: [],
  };
  const fail = async (e) => {
    const k = KIND[e.kind] || KIND.meta_api;
    report.problem = { kind: e.kind, label: k.label, message: e.message, hint: k.hint, code: e.code || null, subcode: e.subcode || null };
    if (e.kind !== 'network') report.metaReachable = e.kind !== 'missing_config' ? true : null;
    else report.metaReachable = false;
    if (record) { if (e.kind === 'missing_config') await noteMissingConfig(); else await noteFailure(e, 'check'); }
    return report;
  };
  try {
    if (!s.pageId || !token) throw new MetaError('missing_config', `${[!s.pageId && 'META_PAGE_ID', !token && 'META_PAGE_ACCESS_TOKEN'].filter(Boolean).join(' and ')} not set`);

    const info = await inspectToken(s, token);
    report.metaReachable = true;
    if (info) {
      report.token = info;
      if (!info.valid && info.error) throw new MetaError(classify(400, info.error), info.error.message || 'Token is not valid', { code: info.error.code, subcode: info.error.subcode });
      if (info.missingScopes.length) report.warnings.push(`Token is missing: ${info.missingScopes.join(', ')}`);
      if (info.expiresAt && info.expiresAt !== 'never') report.warnings.push(`Token expires ${info.expiresAt} — a System User token can be generated with expiry “Never”.`);
    } else {
      report.warnings.push('Token details (type, expiry, scopes) could not be read — set META_APP_SECRET to enable this check.');
    }

    const pt = await resolvePageToken(s, { force: true });
    report.page = { id: s.pageId, name: pt.name, usesPageTokenFromSystemUser: pt.derived };
    if (pt.name) await saveMetaSettings({ pageName: pt.name });
    if (!pt.derived && report.token?.type && report.token.type !== 'PAGE') {
      report.warnings.push(`Meta did not return a Page token for Page ${s.pageId}; the ${report.token.type} token is used directly.`);
    }

    const forms = await request(`${s.pageId}/leadgen_forms`, { params: { fields: 'id,name,status', limit: '100' }, token: pt.token, appSecret: s.appSecret, version: s.graphVersion });
    const list = forms.data || [];
    report.leadForms = { count: list.length, active: list.filter((f) => f.status === 'ACTIVE').length, forms: list.slice(0, 20).map((f) => ({ id: f.id, name: f.name, status: f.status })) };

    const probe = list.find((f) => f.status === 'ACTIVE') || list[0];
    if (probe) {
      await request(`${probe.id}/leads`, { params: { fields: 'id', limit: '1' }, token: pt.token, appSecret: s.appSecret, version: s.graphVersion });
      report.leadsReadable = true;
    } else {
      report.warnings.push('No lead forms found on this Page yet.');
    }

    try {
      const subs = await request(`${s.pageId}/subscribed_apps`, { token: pt.token, appSecret: s.appSecret, version: s.graphVersion });
      report.webhookSubscribed = (subs.data || []).some((a) => (a.subscribed_fields || []).includes('leadgen'));
    } catch { report.webhookSubscribed = null; }

    report.ok = true;
    if (record) await noteOk('check');
    return report;
  } catch (e) {
    if (!(e instanceof MetaError)) throw e;
    if (e.kind !== 'missing_config') pageTokenCache = null;
    return fail(e);
  }
}

/** One-line summary for the startup log (no secrets). */
function summarize(r) {
  if (r.ok) {
    const t = r.token ? `, token type ${r.token.type || '?'}, expires ${r.token.expiresAt || '?'}` : '';
    return `[META] auth check OK — Page "${r.page?.name || r.page?.id}"${t}, ${r.leadForms?.count ?? 0} lead form(s)${r.page?.usesPageTokenFromSystemUser ? ', using Page token from System User' : ''}${r.warnings.length ? ` | warnings: ${r.warnings.join(' | ')}` : ''}`;
  }
  return `[META] auth check failed — ${r.problem.label}: ${r.problem.message}`;
}

module.exports = {
  DEFAULTS, REQUIRED_SCOPES, KIND, MetaError, classify,
  getMetaSettings, saveMetaSettings, request, graph, resolvePageToken,
  noteFailure, noteOk, inContext, consumeResume, noteMissingConfig, syncGate, authState, validateAuth, summarize,
  _reset() { pageTokenCache = null; Object.assign(auth, { status: 'unknown', kind: '', message: '', since: null, failures: 0, nextRetryAt: 0, fp: '', lastOkAt: null, notified: false }); },
};
