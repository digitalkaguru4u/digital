/**
 * Integration tests: lead import, Meta Lead Ads (webhook + sync) and notifications/push.
 * Needs the app running with META_GRAPH_BASE=http://127.0.0.1:4555, SCHEDULER_INTERVAL_MS=3000,
 * META_PAGE_ID=111222333444 and META_PAGE_ACCESS_TOKEN=EAAsystemUserTestToken0001 (mock System User token)
 * (test-only values, see README). A mock Graph API and a mock HTTPS push service are started here:
 *   openssl req -x509 -newkey rsa:2048 -nodes -keyout push-key.pem -out push-cert.pem -days 30 \
 *     -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1"
 *   NODE_EXTRA_CA_CERTS=push-cert.pem npm start      # app trusts the mock push service
 *   PUSH_MOCK_CERT=push-cert.pem PUSH_MOCK_KEY=push-key.pem node tests/e2e-integrations.js
 */
require('dotenv').config({ quiet: true });
const assert = require('assert/strict');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const mockMeta = require('./mock-meta');

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const jar = {};
let csrf = '';
const cookieHeader = () => Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
function saveCookies(res) {
  for (const c of res.headers.getSetCookie?.() || []) { const [k, v] = c.split(';')[0].split('='); jar[k] = v; }
  if (jar.dg_csrf) csrf = jar.dg_csrf;
}
async function call(method, path, body, { raw, headers = {}, rawBody } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', cookie: cookieHeader(), ...(csrf ? { 'x-csrf-token': csrf } : {}), ...headers },
    body: rawBody !== undefined ? rawBody : body ? JSON.stringify(body) : undefined,
  });
  saveCookies(res);
  if (raw) return res;
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : {}; } catch { json = { text }; }
  return { status: res.status, body: json };
}
let passed = 0;
async function step(name, fn) {
  try { await fn(); passed += 1; console.log(`  ✓ ${name}`); }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.stack?.split('\n').slice(0, 2).join('\n    ')}`); throw e; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 12000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await sleep(400); } };

(async () => {
  const graph = await mockMeta.start(4555);
  // mock push service: records encrypted pushes; returns 410 for the "expired" endpoint
  const pushes = [];
  // Web push only talks HTTPS: start the app with NODE_EXTRA_CA_CERTS=<PUSH_MOCK_CERT> so it trusts this mock.
  const tls = { cert: fs.readFileSync(process.env.PUSH_MOCK_CERT), key: fs.readFileSync(process.env.PUSH_MOCK_KEY) };
  const pushServer = https.createServer(tls, (req, res) => {
    let len = 0; req.on('data', (c) => { len += c.length; });
    req.on('end', () => { pushes.push({ url: req.url, encoding: req.headers['content-encoding'], auth: req.headers.authorization || '', len }); res.writeHead(req.url.includes('expired') ? 410 : 201); res.end(); });
  });
  await new Promise((r) => pushServer.listen(4556, r));
  console.log(`Integration tests against ${BASE}`);

  await call('GET', '/api/auth/csrf');
  await step('admin login', async () => {
    const r = await call('POST', '/api/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
    assert.equal(r.status, 200);
  });

  /* ───────── Import ───────── */
  let preview;
  const existing = (await call('GET', '/api/leads?limit=1&q=Demo')).body.items[0];
  const csvText = [
    'Full Name,Mobile Number,E-mail,Company Name,Interested In,Lead Source,Budget,Rating,Remarks,Enquiry Date,Campaign Name',
    'Import One,9000011111,imp1@example.com,One Pvt Ltd,SEO,Google Ads,35k,Hot,"Called, wants quote",21/09/2026,sept-import',
    'Import Two,+91 90000 22222,,Two & Co,Website Development,Referral,"₹10,000 – ₹15,000",Warm,,2026-09-22,',
    `Existing Person,${existing.phone},,,,,,,,,`,
    'Import One Again,9000011111,,,,,,,,,',
    'No Contact,,,,,,,,,,',
    'Bad Email,,not-an-email,,,,,,,,',
    ',,,,,,,,,,',
  ].join('\n');
  await step('template downloads (CSV + Excel)', async () => {
    const c = await call('GET', '/api/leads/import/template', null, { raw: true });
    assert.equal(c.status, 200); assert.ok((await c.text()).includes('Name,Phone,Email'));
    const x = await call('GET', '/api/leads/import/template?format=xlsx', null, { raw: true });
    assert.equal(Buffer.from(await x.arrayBuffer()).slice(0, 2).toString(), 'PK');
  });
  await step('preview parses CSV and auto-maps columns', async () => {
    const r = await call('POST', '/api/leads/import/preview', { fileName: 'leads.csv', data: Buffer.from(csvText).toString('base64') });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    preview = r.body;
    assert.equal(preview.rows.length, 6); // fully blank line dropped
    const m = preview.mapping;
    assert.deepEqual([m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8], m[9], m[10]],
      ['name', 'phone', 'email', 'company', 'service', 'source', 'budget', 'status', 'notes', 'createdAt', 'campaign']);
  });
  await step('import with "skip duplicates": creates 2, skips DB + in-file duplicates, reports bad rows', async () => {
    const r = await call('POST', '/api/leads/import', { rows: preview.rows, mapping: preview.mapping, options: { duplicate: 'skip', fileName: 'leads.csv' } });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.created, 2); assert.equal(r.body.skipped, 2); assert.equal(r.body.failed, 2);
    assert.ok(r.body.errors.some((e) => e.row === 4 && /already exists/.test(e.reason)));
    assert.ok(r.body.errors.some((e) => e.row === 5 && /earlier row/.test(e.reason)));
    assert.ok(r.body.errors.some((e) => e.row === 7 && /Invalid email/.test(e.reason)));
  });
  await step('imported values mapped correctly (service, source, budget amount, Hot rating → stage, date, note, campaign)', async () => {
    const l = (await call('GET', '/api/leads?q=Import One')).body.items[0];
    assert.equal(l.service.label, 'SEO'); assert.equal(l.source.label, 'Google Ads'); assert.equal(l.status, 'HOT');
    assert.equal(l.budget, 35000); assert.equal(l.campaign.name, 'sept-import');
    assert.match(new Date(l.createdAt).toISOString(), /^2026-09-2/);
    const d = (await call('GET', `/api/leads/${l._id}`)).body;
    assert.equal(d.notes[0].text, 'Called, wants quote');
    assert.ok(d.activities.some((a) => /imported/i.test(a.title)));
    const two = (await call('GET', '/api/leads?q=Import Two')).body.items[0];
    assert.equal(two.budget, 12500); assert.equal(two.status, 'WARM'); assert.equal(two.source.label, 'Referral');
  });
  await step('re-import with "update existing" updates instead of duplicating', async () => {
    const r = await call('POST', '/api/leads/import', { rows: preview.rows.slice(0, 2), mapping: preview.mapping, options: { duplicate: 'update', fileName: 'leads.csv' } });
    assert.equal(r.body.created, 0); assert.equal(r.body.updated, 2);
    assert.equal((await call('GET', '/api/leads?q=9000011111')).body.total, 1);
  });
  await step('Excel (.xlsx) import works too', async () => {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('S');
    ws.addRow(['Name', 'Phone', 'Email']); ws.addRow(['Xlsx Person', 9123456789, 'xlsx@example.com']);
    const buf = await wb.xlsx.writeBuffer();
    const p = await call('POST', '/api/leads/import/preview', { fileName: 'l.xlsx', data: Buffer.from(buf).toString('base64') });
    assert.equal(p.body.rows[0][1], '9123456789');
    const r = await call('POST', '/api/leads/import', { rows: p.body.rows, mapping: p.body.mapping, options: { duplicate: 'skip', fileName: 'l.xlsx' } });
    assert.equal(r.body.created, 1);
  });
  await step('import rejects a file without phone/email mapping', async () => {
    const r = await call('POST', '/api/leads/import', { rows: [['a']], mapping: { 0: 'name' }, options: {} });
    assert.equal(r.status, 422);
  });

  /* ───────── Meta Lead Ads ───────── */
  const appSecret = mockMeta.APP_SECRET;
  const secrets = [mockMeta.SYSTEM_TOKEN, mockMeta.PAGE_TOKEN, appSecret];
  const noSecrets = (obj, where) => { const j = JSON.stringify(obj); for (const x of secrets) assert.ok(!j.includes(x), `${where} leaked a secret`); };
  const verifyToken = 'dg-verify-token-xyz';
  await step('Meta settings: token comes only from the env var, cannot be saved via the API, never sent to the browser', async () => {
    const r = await call('PUT', '/api/integrations/meta', { pageAccessToken: 'EAAattemptToStoreInDb999', appSecret, verifyToken, syncMinutes: 0 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    const g = (await call('GET', '/api/integrations/meta')).body;
    assert.equal(g.settings.hasToken, true); assert.equal(g.settings.pageId, mockMeta.PAGE.id); assert.equal(g.settings.fromEnv.pageId, true);
    assert.equal(g.settings.tokenPreview, 'EAAs…');
    noSecrets(g, 'GET /integrations/meta'); assert.ok(!JSON.stringify(g).includes('EAAattemptToStoreInDb999'));
    assert.match(g.webhookUrl, /\/api\/integrations\/meta\/webhook$/);
  });
  await step('connection test: System User token → Page token, lead forms + leads readable', async () => {
    const r = await call('POST', '/api/integrations/meta/test');
    assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.page.name, mockMeta.PAGE.name); assert.equal(r.body.forms.length, 1); assert.equal(r.body.webhookSubscribed, true);
    const rep = r.body.report;
    assert.equal(rep.token.type, 'SYSTEM_USER'); assert.equal(rep.token.expiresAt, 'never'); assert.deepEqual(rep.token.missingScopes, []);
    assert.equal(rep.page.usesPageTokenFromSystemUser, true); assert.equal(rep.leadsReadable, true);
    noSecrets(r.body, 'POST /meta/test');
    // page edges were called with the Page token, never with the system user token
    assert.ok(mockMeta.calls.some((c) => c.path.endsWith('/leadgen_forms') && c.kind === 'page'));
    assert.ok(!mockMeta.calls.some((c) => c.path.endsWith('/leadgen_forms') && c.kind === 'system'));
    assert.equal((await call('POST', '/api/integrations/meta/subscribe')).body.ok, true);
  });
  await step('GET /api/meta/health is admin-only and returns no token', async () => {
    const anon = await fetch(`${BASE}/api/meta/health`);
    assert.equal(anon.status, 401);
    const r = await call('GET', '/api/meta/health');
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.configured, true); assert.equal(r.body.pageConfigured, true); assert.equal(r.body.tokenConfigured, true);
    assert.equal(r.body.metaReachable, true); assert.equal(r.body.authenticated, true);
    noSecrets(r.body, 'GET /api/meta/health');
  });
  await step('webhook verification handshake', async () => {
    const ok = await call('GET', `/api/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=12345`, null, { raw: true });
    assert.equal(await ok.text(), '12345');
    const bad = await call('GET', '/api/integrations/meta/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=1', null, { raw: true });
    assert.equal(bad.status, 403);
  });
  const payload = JSON.stringify({ object: 'page', entry: [{ id: mockMeta.PAGE.id, time: Date.now(), changes: [{ field: 'leadgen', value: { leadgen_id: '7000001', page_id: mockMeta.PAGE.id, form_id: '900001', ad_id: '55', created_time: mockMeta.now } }] }] });
  const sig = 'sha256=' + crypto.createHmac('sha256', appSecret).update(payload).digest('hex');
  await step('unsigned / wrongly signed webhook is rejected', async () => {
    assert.equal((await call('POST', '/api/integrations/meta/webhook', null, { rawBody: payload, headers: { 'x-csrf-token': '' } })).status, 401);
    assert.equal((await call('POST', '/api/integrations/meta/webhook', null, { rawBody: payload, headers: { 'x-hub-signature-256': 'sha256=deadbeef' } })).status, 401);
  });
  await step('signed webhook → lead created in CRM (source Meta Ads, campaign, answers in message)', async () => {
    const r = await call('POST', '/api/integrations/meta/webhook', null, { rawBody: payload, headers: { 'x-hub-signature-256': sig } });
    assert.equal(r.status, 200);
    const lead = await waitFor(async () => (await call('GET', '/api/leads?q=Meta Webhook Person')).body.items[0]);
    assert.ok(lead, 'lead not created');
    assert.equal(lead.source.key, 'meta_ads'); assert.equal(lead.campaign.name, 'SEO Leads Sept'); assert.equal(lead.service.label, 'SEO'); assert.equal(lead.formUsed, 'meta_lead_ad');
    const d = (await call('GET', `/api/leads/${lead._id}`)).body;
    assert.match(d.lead.message, /Which service do you need: SEO for my clinic/); assert.match(d.lead.message, /City: Pune/); assert.match(d.lead.message, /Platform: Instagram/);
  });
  await step('same webhook delivered twice does not duplicate', async () => {
    await call('POST', '/api/integrations/meta/webhook', null, { rawBody: payload, headers: { 'x-hub-signature-256': sig } });
    await sleep(1500);
    assert.equal((await call('GET', '/api/leads?q=Meta Webhook Person')).body.total, 1);
  });
  await step('manual sync pulls the other form lead, skips the known one', async () => {
    const r = await call('POST', '/api/integrations/meta/sync', { days: 7 });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.summary.created, 1); assert.equal(r.body.summary.duplicates, 1);
    assert.equal((await call('GET', '/api/leads?q=Sync Person')).body.items[0].source.key, 'meta_ads');
    const g = (await call('GET', '/api/integrations/meta')).body;
    assert.equal(g.counts.processed, 2);
  });
  await step('expired token: clear error, auto-sync pauses with back-off (no retry every tick), CRM stays up', async () => {
    await fetch('http://127.0.0.1:4555/__mock/mode', { method: 'POST', body: JSON.stringify({ mode: 'expired' }) });
    const t = await call('POST', '/api/integrations/meta/test');
    assert.equal(t.status, 400); assert.match(t.body.error, /Token expired/); assert.equal(t.body.details.problem.kind, 'expired');
    noSecrets(t.body, 'failed /meta/test');
    await call('PUT', '/api/integrations/meta', { syncMinutes: 1 });
    await sleep(7000); // two scheduler ticks
    const before = mockMeta.calls.length;
    await sleep(9000); // three more ticks: a naive scheduler would call Meta again each time
    assert.equal(mockMeta.calls.length, before, 'scheduler kept calling Meta while paused');
    const h = (await call('GET', '/api/meta/health?live=0')).body;
    assert.equal(h.authenticated, false); assert.equal(h.sync.status, 'unavailable'); assert.ok(h.sync.nextRetryAt);
    assert.equal((await call('GET', '/api/leads?limit=1')).status, 200); // CRM unaffected
  });
  await step('after the token works again, “Check again” resumes sync straight away', async () => {
    await fetch('http://127.0.0.1:4555/__mock/mode', { method: 'POST', body: JSON.stringify({ mode: 'ok' }) });
    const t = await call('POST', '/api/integrations/meta/test');
    assert.equal(t.status, 200, JSON.stringify(t.body));
    const before = mockMeta.calls.length;
    const resumed = await waitFor(() => mockMeta.calls.slice(before).some((c) => c.path.endsWith('/900001/leads')), 12000);
    assert.ok(resumed, 'auto-sync did not resume');
    const h = (await call('GET', '/api/meta/health?live=0')).body;
    assert.equal(h.sync.status, 'ok'); assert.equal(h.authenticated, true);
    await call('PUT', '/api/integrations/meta', { syncMinutes: 0 });
  });
  await step('Page not assigned to the system user → “No access to the Page” with the fix', async () => {
    await fetch('http://127.0.0.1:4555/__mock/mode', { method: 'POST', body: JSON.stringify({ mode: 'no_page_access' }) });
    const t = await call('POST', '/api/integrations/meta/test');
    assert.equal(t.status, 400); assert.equal(t.body.details.problem.kind, 'page_access'); assert.match(t.body.error, /Assign assets/);
    await fetch('http://127.0.0.1:4555/__mock/mode', { method: 'POST', body: JSON.stringify({ mode: 'ok' }) });
    assert.equal((await call('POST', '/api/integrations/meta/test')).status, 200);
  });

  /* ───────── Notifications + push ───────── */
  await step('bell has notifications for new leads (website/Meta/import)', async () => {
    const r = (await call('GET', '/api/notifications')).body;
    const types = r.items.map((n) => n.type);
    assert.ok(types.includes('meta_lead') && types.includes('import'), types.join(','));
    assert.ok(r.unread > 0);
  });
  await step('push: VAPID key, subscribe device, test push is delivered (encrypted) to the push service', async () => {
    const k = (await call('GET', '/api/notifications/push/key')).body.publicKey;
    assert.ok(k && k.length > 60);
    // a real browser would create these keys; generate a valid P-256 key pair for the mock device
    const ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys();
    const keys = { p256dh: ecdh.getPublicKey('base64url'), auth: crypto.randomBytes(16).toString('base64url') };
    assert.equal((await call('POST', '/api/notifications/push/subscribe', { endpoint: 'https://127.0.0.1:4556/push/device-1', keys })).status, 200);
    assert.equal((await call('POST', '/api/notifications/push/subscribe', { endpoint: 'https://127.0.0.1:4556/push/expired-2', keys })).status, 200);
    const before = pushes.length;
    const r = await call('POST', '/api/notifications/push/test');
    assert.equal(r.body.devices, 2);
    await waitFor(() => pushes.length >= before + 2, 5000);
    const p = pushes.find((x) => x.url === '/push/device-1');
    assert.equal(p.encoding, 'aes128gcm'); assert.match(p.auth, /^vapid t=/); assert.ok(p.len > 50);
    await sleep(300);
    const prefs = (await call('GET', '/api/notifications/prefs')).body;
    assert.equal(prefs.devices.length, 1, 'expired (410) subscription should be removed');
  });
  await step('new website lead pushes to subscribed admin', async () => {
    const before = pushes.length;
    await call('GET', '/api/public/config');
    const r = await call('POST', '/api/public/leads', { name: 'Push Test Visitor', phone: '+91 9555500001', startedAt: 1, formUsed: 'contact' });
    assert.equal(r.status, 201);
    assert.ok(await waitFor(() => pushes.length > before, 5000), 'no push sent');
  });
  await step('turning a preference off stops that push (in-app history still recorded)', async () => {
    await call('PUT', '/api/notifications/prefs', { newLead: false });
    const before = pushes.length;
    await call('POST', '/api/public/leads', { name: 'Quiet Visitor', phone: '+91 9555500002', startedAt: 1, formUsed: 'contact' });
    await sleep(1500);
    assert.equal(pushes.length, before);
    assert.ok((await call('GET', '/api/notifications')).body.items.some((n) => /Quiet Visitor/.test(n.title)));
    await call('PUT', '/api/notifications/prefs', { newLead: true });
  });
  await step('follow-up reminder fires from the scheduler (push + bell)', async () => {
    const lead = (await call('GET', '/api/leads?q=Import Two')).body.items[0];
    const tz = process.env.TIMEZONE || 'Asia/Kolkata';
    const inFive = new Date(Date.now() + 5 * 60000);
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(inFive);
    const time = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(inFive);
    const me = (await call('GET', '/api/auth/me')).body.user;
    const before = pushes.length;
    await call('POST', '/api/followups', { lead: lead._id, date, time, type: 'call', reminderMinutes: 15, assignedTo: me.id });
    const got = await waitFor(async () => (await call('GET', '/api/notifications')).body.items.find((n) => n.type === 'followup_reminder' && /Import Two/.test(n.title)), 15000);
    assert.ok(got, 'no reminder notification');
    assert.ok(pushes.length > before, 'no reminder push');
  });
  await step('mark all read', async () => {
    await call('POST', '/api/notifications/read-all');
    assert.equal((await call('GET', '/api/notifications')).body.unread, 0);
  });

  console.log(`\n${passed} checks passed.`);
  graph.close(); pushServer.close();
})().catch(() => { console.log(`\nStopped after ${passed} passing checks.`); process.exit(1); });
