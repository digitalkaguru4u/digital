/**
 * End-to-end API test against a running server (with seeded data).
 *   BASE_URL=http://localhost:4000 ADMIN_EMAIL=... ADMIN_PASSWORD=... node tests/e2e.js
 * Walks the full flow: website enquiry → dedup → login → lead workflow →
 * follow-ups → booking/payments → bulk → export → settings → dashboard → pipeline value.
 */
require('dotenv').config({ quiet: true });
const assert = require('assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:4000';
const jar = {};
let csrf = '';
function cookieHeader() { return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; '); }
function saveCookies(res) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(';');
    const [k, v] = pair.split('=');
    if (v === '' || /Expires=Thu, 01 Jan 1970/.test(c)) delete jar[k]; else jar[k] = v;
  }
  if (jar.dg_csrf) csrf = jar.dg_csrf;
}
async function call(method, path, body, { raw = false } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', cookie: cookieHeader(), ...(csrf ? { 'x-csrf-token': csrf } : {}) },
    body: body ? JSON.stringify(body) : undefined,
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
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1; throw e; }
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TIMEZONE || 'Asia/Kolkata' }).format(new Date());
const plusDays = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: process.env.TIMEZONE || 'Asia/Kolkata' }).format(new Date(Date.now() + n * 86400000));

(async () => {
  const phone = `+91 7${String(Date.now()).slice(-9)}`;
  const email = `e2e${Date.now()}@example.com`;
  let leadId, ref, L;
  console.log(`E2E against ${BASE}`);

  await step('public config issues CSRF token', async () => {
    const r = await call('GET', '/api/public/config');
    assert.equal(r.status, 200); assert.ok(r.body.csrfToken); assert.ok(r.body.services.length >= 9);
  });
  await step('public lead without CSRF is rejected', async () => {
    const saved = csrf; csrf = '';
    const r = await call('POST', '/api/public/leads', { name: 'X', phone });
    csrf = saved; assert.equal(r.status, 403);
  });
  await step('invalid public lead fails validation', async () => {
    const r = await call('POST', '/api/public/leads', { name: 'A', phone: '12' });
    assert.equal(r.status, 422);
  });
  await step('honeypot submission is silently dropped', async () => {
    const r = await call('POST', '/api/public/leads', { name: 'Bot', phone: '+91 9000000001', website: 'spam.com', startedAt: 1 });
    assert.equal(r.status, 201); assert.equal(r.body.reference, undefined);
  });
  await step('website enquiry creates a lead with UTM attribution', async () => {
    const r = await call('POST', '/api/public/leads', {
      name: 'E2E Visitor', phone, email, service: 'seo', formUsed: 'service', startedAt: 1,
      pageUrl: `${BASE}/services/seo`, landingPage: `${BASE}/?utm_source=google`, utm: { source: 'google', medium: 'cpc', campaign: 'e2e-campaign' },
    });
    assert.equal(r.status, 201); assert.equal(r.body.merged, false); ref = r.body.reference; assert.match(ref, /^DG-\d{6}$/);
  });
  await step('second enquiry from same phone is merged, not duplicated', async () => {
    const r = await call('POST', '/api/public/leads', { name: 'E2E Visitor', phone: phone.replace(/\s/g, ''), service: 'google-ads', formUsed: 'popup', startedAt: 1 });
    assert.equal(r.status, 201); assert.equal(r.body.merged, true); assert.equal(r.body.reference, ref);
  });
  await step('CTA click event is recorded', async () => {
    const r = await call('POST', '/api/public/events', { cta: 'call', pageUrl: BASE });
    assert.equal(r.status, 204);
  });
  await step('admin API requires login', async () => {
    const r = await call('GET', '/api/leads'); assert.equal(r.status, 401);
  });
  await step('wrong password is rejected', async () => {
    const r = await call('POST', '/api/auth/login', { email: process.env.ADMIN_EMAIL, password: 'nope-nope' }); assert.equal(r.status, 401);
  });
  await step('admin login', async () => {
    const r = await call('POST', '/api/auth/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD });
    assert.equal(r.status, 200); assert.ok(r.body.user.role.permissions.includes('*'));
    L = (await call('GET', '/api/settings/lookups')).body;
  });
  await step('lead is searchable, with source + campaign + 2 enquiries', async () => {
    const r = await call('GET', `/api/leads?q=${encodeURIComponent(ref)}`);
    assert.equal(r.body.total, 1);
    const l = r.body.items[0]; leadId = l._id;
    assert.equal(l.source.key, 'google_ads'); assert.equal(l.campaign.name, 'e2e-campaign'); assert.equal(l.enquiryCount, 2);
  });
  await step('admin create with same email returns "Existing lead found"', async () => {
    const r = await call('POST', '/api/leads', { name: 'Dup Person', email });
    assert.equal(r.status, 409); assert.equal(r.body.duplicates[0]._id, leadId);
  });
  await step('add enquiry to existing lead from duplicate dialog', async () => {
    const r = await call('POST', `/api/leads/${leadId}/enquiries`, { message: 'Called in, wants branding too', service: L.services.find((s) => s.slug === 'branding')._id });
    assert.equal(r.status, 201);
  });
  await step('LOST without a reason is refused', async () => {
    const r = await call('POST', `/api/leads/${leadId}/status`, { status: 'LOST' }); assert.equal(r.status, 422);
  });
  await step('stage (Hot/Warm/Cold are stages), budget amount, assignment', async () => {
    assert.equal((await call('POST', `/api/leads/${leadId}/status`, { status: 'CONTACTED' })).body.lead.status, 'CONTACTED');
    assert.equal((await call('POST', `/api/leads/${leadId}/status`, { status: 'WARM' })).body.lead.status, 'WARM');
    assert.equal((await call('POST', `/api/leads/${leadId}/temperature`, { temperature: 'HOT' })).status, 404); // temperature removed
    const pv0 = (await call('GET', '/api/dashboard/pipeline-value')).body;
    assert.ok(pv0.needBudget.some((l) => l._id === leadId), 'warm lead without budget should be listed');
    assert.equal((await call('POST', `/api/leads/${leadId}/budget`, { amount: 'abc' })).status, 422);
    assert.equal((await call('POST', `/api/leads/${leadId}/budget`, { amount: '42k' })).body.lead.budget, 42000);
    assert.equal((await call('POST', `/api/leads/${leadId}/budget`, { amount: '1.5L' })).body.lead.budget, 150000);
    assert.equal((await call('POST', `/api/leads/${leadId}/budget`, { amount: '₹42,000' })).body.lead.budget, 42000);
    const team = (await call('GET', '/api/users/team')).body.items;
    assert.equal((await call('POST', `/api/leads/${leadId}/assign`, { assignedTo: team[0]._id })).body.lead.assignedTo._id, team[0]._id);
  });
  await step('pipeline value lists the lead with its amount; needs-budget list no longer does', async () => {
    const pv = (await call('GET', '/api/dashboard/pipeline-value')).body;
    const row = pv.leads.find((l) => l._id === leadId);
    assert.equal(row.budget, 42000); assert.ok(pv.total >= 42000);
    assert.ok(!pv.needBudget.some((l) => l._id === leadId));
    assert.equal(pv.byStage.find((b) => b.key === 'WARM').value >= 42000, true);
  });
  await step('notes are sanitised and stored', async () => {
    const r = await call('POST', `/api/leads/${leadId}/notes`, { text: 'Budget <script>x</script>discussed' });
    assert.equal(r.status, 201); assert.equal(r.body.note.text, 'Budget xdiscussed');
  });
  await step('communication (WhatsApp) logged and lastContactedAt set', async () => {
    const r = await call('POST', `/api/leads/${leadId}/communications`, { channel: 'whatsapp', message: 'Hi E2E', outcome: 'sent' });
    assert.equal(r.status, 201);
  });
  let fuId;
  await step('follow-up scheduled for today appears in Today bucket', async () => {
    const r = await call('POST', '/api/followups', { lead: leadId, date: today(), time: '23:30', type: 'call', priority: 'high', notes: 'Call back' });
    assert.equal(r.status, 201); fuId = r.body.followup._id;
    const t = await call('GET', `/api/followups?bucket=today&lead=${leadId}`);
    assert.ok(t.body.items.some((f) => f._id === fuId));
  });
  await step('complete follow-up → note + stage + budget + next follow-up', async () => {
    const r = await call('POST', `/api/followups/${fuId}/complete`, {
      outcome: 'Wants a proposal', addAsNote: true, status: 'PROPOSAL_SENT', budget: '45000',
      next: { date: plusDays(2), time: '11:00', type: 'proposal', priority: 'medium' },
    });
    assert.equal(r.status, 200); assert.ok(r.body.next);
    const up = await call('GET', `/api/followups?bucket=upcoming&lead=${leadId}`);
    assert.equal(up.body.items.length, 1);
  });
  await step('reschedule follow-up', async () => {
    const up = await call('GET', `/api/followups?bucket=upcoming&lead=${leadId}`);
    const r = await call('POST', `/api/followups/${up.body.items[0]._id}/reschedule`, { date: plusDays(3), time: '12:00', reason: 'Client travelling' });
    assert.equal(r.status, 200); assert.equal(r.body.followup.rescheduleCount, 1);
  });
  await step('BOOKED initialises booking; payments update payment status', async () => {
    const r = await call('POST', `/api/leads/${leadId}/status`, { status: 'BOOKED' });
    assert.ok(r.body.lead.booking); assert.equal(r.body.lead.booking.paymentStatus, 'pending');
    await call('PATCH', `/api/leads/${leadId}/booking`, { finalBudget: 45000, projectStartDate: plusDays(5) });
    await call('POST', `/api/leads/${leadId}/payments`, { amount: 15000, method: 'upi' });
    let d = await call('GET', `/api/leads/${leadId}`);
    assert.equal(d.body.lead.booking.paymentStatus, 'advance_received');
    await call('POST', `/api/leads/${leadId}/payments`, { amount: 30000, method: 'bank_transfer' });
    d = await call('GET', `/api/leads/${leadId}`);
    assert.equal(d.body.lead.booking.paymentStatus, 'fully_paid');
  });
  await step('tasks are gone — a to-do is a follow-up of type "task"', async () => {
    assert.equal((await call('GET', '/api/tasks')).status, 404);
    const r = await call('POST', '/api/followups', { lead: leadId, date: plusDays(-1), time: '10:00', type: 'task', priority: 'high', notes: 'Send onboarding form' });
    assert.equal(r.status, 201);
    const o = await call('GET', `/api/followups?bucket=overdue&lead=${leadId}`);
    assert.ok(o.body.items.some((x) => x._id === r.body.followup._id));
    assert.equal((await call('POST', `/api/followups/${r.body.followup._id}/complete`, { outcome: 'Sent' })).status, 200);
  });
  await step('timeline keeps full history in order', async () => {
    const d = await call('GET', `/api/leads/${leadId}`);
    const types = d.body.activities.map((a) => a.type).reverse();
    ['lead_created', 'enquiry', 'status_changed', 'budget_changed', 'assigned', 'note_added', 'whatsapp',
      'followup_scheduled', 'followup_completed', 'followup_rescheduled', 'booking_updated', 'payment_added']
      .forEach((t) => assert.ok(types.includes(t), `missing ${t}`));
    assert.equal(d.body.enquiries.length, 3);
  });
  await step('bulk status update to LOST requires a reason', async () => {
    const list = await call('GET', '/api/leads?status=NEW&limit=2');
    const ids = list.body.items.map((l) => l._id);
    if (!ids.length) return;
    assert.equal((await call('POST', '/api/leads/bulk', { ids, action: 'status', value: 'LOST' })).status, 422);
    const r = await call('POST', '/api/leads/bulk', { ids, action: 'status', value: 'LOST', lostReason: L.lostReasons[0]._id });
    assert.equal(r.body.updated, ids.length);
  });
  await step('filters combine (stage + source + has budget) and stage counts', async () => {
    const gads = L.sources.find((s) => s.key === 'google_ads')._id;
    const r = await call('GET', `/api/leads?status=BOOKED&source=${gads}&budget=has`);
    assert.ok(r.body.items.every((l) => l.status === 'BOOKED' && l.source.key === 'google_ads' && l.budget > 0));
    const c = (await call('GET', '/api/leads/stage-counts')).body;
    assert.ok(c.total > 0 && c.counts.BOOKED >= 1);
    assert.ok(!('CLOSED' in c.counts) && !('NOT_INTERESTED' in c.counts));
    assert.ok(r.body.items.some((l) => l._id === leadId));
  });
  await step('CSV and Excel export', async () => {
    const c = await call('GET', '/api/leads/export?format=csv', null, { raw: true });
    assert.equal(c.status, 200); assert.match(c.headers.get('content-type'), /text\/csv/);
    assert.ok((await c.text()).includes(ref));
    const x = await call('GET', '/api/leads/export?format=xlsx', null, { raw: true });
    assert.equal(x.status, 200); const buf = Buffer.from(await x.arrayBuffer()); assert.equal(buf.slice(0, 2).toString(), 'PK');
  });
  await step('settings: add, rename and remove a lead source', async () => {
    const c = await call('POST', '/api/settings/sources', { label: 'LinkedIn E2E' }); assert.equal(c.status, 201);
    const u = await call('PATCH', `/api/settings/sources/${c.body.item._id}`, { label: 'LinkedIn (E2E)' }); assert.equal(u.body.item.label, 'LinkedIn (E2E)');
    const d = await call('DELETE', `/api/settings/sources/${c.body.item._id}`); assert.equal(d.body.ok, true);
  });
  await step('settings: in-use status cannot be hard-deleted (deactivated instead)', async () => {
    const booked = L.statuses.find((s) => s.key === 'CONTACTED');
    const r = await call('DELETE', `/api/settings/statuses/${booked._id}`);
    assert.equal(r.body.deactivated, true);
    await call('PATCH', `/api/settings/statuses/${booked._id}`, { active: true });
  });
  await step('dashboard (no date filter): stages, analysis, today, value', async () => {
    const r = (await call('GET', '/api/dashboard')).body;
    const keys = r.stages.map((x) => x.key);
    assert.deepEqual(keys.filter((k) => ['NEW', 'HOT', 'WARM', 'COLD', 'RINGING', 'BOOKED', 'LOST'].includes(k)).length, 7);
    assert.ok(!keys.includes('CLOSED') && !keys.includes('NOT_INTERESTED'));
    const k = r.kpis;
    ['total', 'untouched', 'unassigned', 'noReminder', 'todaysLeads', 'returningToday', 'followupsToday', 'pipelineValue', 'needBudget', 'booked', 'lost'].forEach((f) => assert.ok(f in k, f));
    assert.ok(k.todaysLeads >= 1 && k.returningToday >= 1);
    assert.ok(r.bySource.find((s) => s.name === 'Google Ads').booked >= 1);
  });
  await step('soft delete hides lead; restore brings it back with history', async () => {
    await call('DELETE', `/api/leads/${leadId}`);
    assert.equal((await call('GET', `/api/leads?q=${ref}`)).body.total, 0);
    assert.equal((await call('GET', `/api/leads?q=${ref}&deleted=1`)).body.total, 1);
    await call('POST', `/api/leads/${leadId}/restore`);
    assert.equal((await call('GET', `/api/leads?q=${ref}`)).body.total, 1);
  });
  await step('logout ends the session', async () => {
    await call('POST', '/api/auth/logout');
    assert.equal((await call('GET', '/api/auth/me')).status, 401);
  });
  console.log(`\n${passed} checks passed.`);
})().catch(() => { console.log(`\nStopped after ${passed} passing checks.`); process.exit(1); });
