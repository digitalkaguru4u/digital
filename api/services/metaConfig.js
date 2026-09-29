/**
 * Meta configuration — server side only.
 *
 * META_PAGE_ACCESS_TOKEN (Render environment variable) is the ONLY source of the Meta token.
 * It is read from process.env at call time (never captured at import), is never stored in
 * MongoDB, never sent to the browser and never logged — only a 4-character prefix and a
 * one-way fingerprint are used for diagnostics.
 *
 * Page ID / app secret / verify token / Graph version: environment variable first; a value
 * saved in CRM → Settings → Integrations is used only when the variable is not set.
 */
const crypto = require('crypto');

const clean = (v) => String(v ?? '').trim();

function metaEnv() {
  const e = process.env;
  return {
    pageId: clean(e.META_PAGE_ID),
    token: clean(e.META_PAGE_ACCESS_TOKEN),
    appSecret: clean(e.META_APP_SECRET),
    verifyToken: clean(e.META_VERIFY_TOKEN),
    graphVersion: clean(e.META_GRAPH_VERSION),
    syncMinutes: clean(e.META_SYNC_MINUTES),
  };
}

/** First 4 characters only, e.g. "EAAG…" */
const tokenPrefix = (t) => (t ? `${t.slice(0, 4)}…` : '');

/** One-way fingerprint: lets us notice that the token changed without keeping it anywhere. */
const tokenFingerprint = (t) => (t ? crypto.createHash('sha256').update(t).digest('hex').slice(0, 12) : '');

/** Remove anything that could be a token from text before it is logged, stored or returned. */
function redact(text) {
  let s = String(text ?? '');
  const t = metaEnv().token;
  if (t && t.length > 8) s = s.split(t).join('[redacted]');
  return s
    .replace(/(access_token|input_token|appsecret_proof)=[^&\s"']+/gi, '$1=[redacted]')
    .replace(/\bEAA[A-Za-z0-9]{12,}/g, 'EAA…[redacted]');
}

/** Safe startup summary — booleans and a short prefix only. */
function logMetaStartup(log = console.log) {
  const c = metaEnv();
  log(`[META] PAGE_ID configured: ${!!c.pageId}`);
  log(`[META] ACCESS_TOKEN configured: ${!!c.token}${c.token ? ` (prefix ${tokenPrefix(c.token)}, length ${c.token.length})` : ''}`);
  if (c.token && /\s/.test(process.env.META_PAGE_ACCESS_TOKEN.trim())) log('[META] warning: META_PAGE_ACCESS_TOKEN contains spaces/line breaks — paste it again as one line');
  if (!c.pageId || !c.token) log('[META] Lead Ads sync is off until META_PAGE_ID and META_PAGE_ACCESS_TOKEN are set in the environment');
}

module.exports = { metaEnv, tokenPrefix, tokenFingerprint, redact, logMetaStartup };
