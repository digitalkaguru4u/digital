/**
 * Tiny stand-in for graph.facebook.com used by tests/e2e-integrations.js.
 * Start the app with META_GRAPH_BASE=http://127.0.0.1:4555 to use it.
 *
 * Models how Meta treats a Business System User token:
 *  - SYSTEM_TOKEN is a user-type token: GET /{page}?fields=access_token returns the Page token;
 *    Page edges (leadgen_forms, subscribed_apps, form leads) refuse anything but PAGE_TOKEN.
 *  - OLD_TOKEN behaves like an expired Graph API Explorer token (OAuthException 190/463).
 *  - appsecret_proof, when sent, must be HMAC-SHA256(APP_SECRET, access_token).
 *  - POST /__mock/mode {mode}: 'ok' | 'expired' (every token expired) | 'no_page_access'.
 */
const http = require('http');
const crypto = require('crypto');

const PAGE = { id: '111222333444', name: 'Digital Guru Test Page' };
const FORMS = [{ id: '900001', name: 'SEO Enquiry Form', status: 'ACTIVE', leads_count: 2 }];
const SYSTEM_TOKEN = 'EAAsystemUserTestToken0001';
const PAGE_TOKEN = 'EAApageTokenFromSystemUser0002';
const OLD_TOKEN = 'EAAoldGraphExplorerToken0003';
const APP_SECRET = 'test-app-secret-123';
const SCOPES = ['leads_retrieval', 'pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'pages_manage_ads', 'ads_management', 'business_management'];
const now = Math.floor(Date.now() / 1000);
const LEADS = {
  '7000001': { id: '7000001', created_time: new Date().toISOString(), form_id: '900001', ad_id: '55', ad_name: 'SEO Reel 1', adset_name: 'Mumbai 25-45', campaign_name: 'SEO Leads Sept', platform: 'ig',
    field_data: [{ name: 'full_name', values: ['Meta Webhook Person'] }, { name: 'phone_number', values: ['+919876500001'] }, { name: 'email', values: ['metawh@example.com'] }, { name: 'which_service_do_you_need?', values: ['SEO for my clinic'] }, { name: 'city', values: ['Pune'] }] },
  '7000002': { id: '7000002', created_time: new Date().toISOString(), form_id: '900001', ad_id: '56', ad_name: 'SEO Carousel', campaign_name: 'SEO Leads Sept', platform: 'fb',
    field_data: [{ name: 'first_name', values: ['Sync'] }, { name: 'last_name', values: ['Person'] }, { name: 'phone_number', values: ['+919876500002'] }] },
};
const calls = [];
const state = { mode: 'ok' };

const EXPIRED = { message: 'Error validating access token: Session has expired on Sunday, 27-Sep-26 12:00:00 PDT. The current time is Sunday, 27-Sep-26 23:36:02 PDT.', type: 'OAuthException', code: 190, error_subcode: 463 };
const INVALID = { message: 'Invalid OAuth access token - Cannot parse access token', type: 'OAuthException', code: 190 };
const NEED_PAGE = { message: '(#190) This method must be called with a Page Access Token', type: 'OAuthException', code: 190 };

function start(port = 4555) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (code, body) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
    let raw = '';
    for await (const c of req) raw += c;
    if (url.pathname === '/__mock/mode') { state.mode = JSON.parse(raw || '{}').mode || 'ok'; return send(200, { mode: state.mode }); }
    const q = req.method === 'GET' ? url.searchParams : new URLSearchParams(raw);
    const parts = url.pathname.split('/').filter(Boolean); // [version, ...]
    const [, a, b] = parts;
    const token = q.get('access_token');
    const kind = token === PAGE_TOKEN ? 'page' : token === SYSTEM_TOKEN ? 'system' : token === OLD_TOKEN ? 'old' : token?.startsWith('1234|') ? 'app' : 'bad';
    calls.push({ at: Date.now(), method: req.method, path: url.pathname, kind });
    if (!token) return send(400, { error: { message: 'An access token is required to request this resource.', type: 'OAuthException', code: 104 } });
    const proof = q.get('appsecret_proof');
    if (proof && proof !== crypto.createHmac('sha256', APP_SECRET).update(token).digest('hex')) {
      return send(400, { error: { message: 'Invalid appsecret_proof provided in the API argument', type: 'GraphMethodException', code: 100 } });
    }
    if (a === 'debug_token') {
      const input = q.get('input_token');
      if (input === OLD_TOKEN || state.mode === 'expired') return send(200, { data: { is_valid: false, type: 'USER', app_id: '1234', expires_at: 1790535600, scopes: [], error: { code: 190, subcode: 463, message: 'Session has expired on Sunday, 27-Sep-26 12:00:00 PDT.' } } });
      if (input === SYSTEM_TOKEN) return send(200, { data: { is_valid: true, type: 'SYSTEM_USER', app_id: '1234', application: 'DG CRM', expires_at: 0, data_access_expires_at: 0, scopes: SCOPES } });
      if (input === PAGE_TOKEN) return send(200, { data: { is_valid: true, type: 'PAGE', app_id: '1234', application: 'DG CRM', expires_at: 0, profile_id: PAGE.id, scopes: SCOPES } });
      return send(400, { error: INVALID });
    }
    if (state.mode === 'expired' || kind === 'old') return send(400, { error: EXPIRED });
    if (kind === 'bad') return send(400, { error: INVALID });
    if (a === 'app') return send(200, { id: '1234', name: 'DG CRM' });

    if (a === PAGE.id && !b) {
      if (state.mode === 'no_page_access') return send(400, { error: { message: `Unsupported get request. Object with ID '${PAGE.id}' does not exist, cannot be loaded due to missing permissions, or does not support this operation.`, type: 'GraphMethodException', code: 100, error_subcode: 33 } });
      const fields = (q.get('fields') || '').split(',');
      return send(200, { ...PAGE, ...(fields.includes('access_token') ? { access_token: PAGE_TOKEN } : {}) });
    }
    const pageEdge = (a === PAGE.id && ['leadgen_forms', 'subscribed_apps'].includes(b)) || (FORMS.some((f) => f.id === a) && b === 'leads');
    if (pageEdge && kind !== 'page') return send(400, { error: NEED_PAGE });
    if (a === PAGE.id && b === 'leadgen_forms') return send(200, { data: FORMS });
    if (a === PAGE.id && b === 'subscribed_apps') return send(200, req.method === 'POST' ? { success: true } : { data: [{ id: '1', subscribed_fields: ['leadgen'] }] });
    if (FORMS.some((f) => f.id === a) && b === 'leads') return send(200, { data: Object.values(LEADS).filter((l) => l.form_id === a), paging: { cursors: { after: 'x' } } });
    if (FORMS.some((f) => f.id === a)) return send(200, FORMS.find((f) => f.id === a));
    if (LEADS[a]) return send(200, LEADS[a]);
    return send(404, { error: { message: `Unknown object ${a}`, code: 100 } });
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}

module.exports = { start, PAGE, FORMS, LEADS, calls, state, now, SYSTEM_TOKEN, PAGE_TOKEN, OLD_TOKEN, APP_SECRET };
if (require.main === module) start().then(() => console.log('mock graph on :4555'));
