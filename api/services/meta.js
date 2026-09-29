/**
 * Meta (Facebook/Instagram) Lead Ads → CRM.
 * Two free, direct paths using the Graph API — no Zapier/third party:
 *   1. Webhook (instant): Meta POSTs a leadgen_id → we fetch the lead and create it.
 *   2. Auto-sync (every N minutes): pulls recent leads from every lead form on the Page.
 *      Works even before your Meta app passes App Review, and catches anything a webhook missed.
 * Both paths are idempotent (meta_leads collection keyed by leadgen_id) and use the same
 * dedup as the website (phone/email), so a person is never duplicated.
 */
const crypto = require('crypto');
const M = require('../models');
const { captureWebsiteEnquiry, parseAmount } = require('./leadService');
const { notify, admins } = require('./notify');

// Settings + all Graph API calls go through metaClient (token only from META_PAGE_ACCESS_TOKEN).
const client = require('./metaClient');
const { getMetaSettings, saveMetaSettings, graph } = client;
const { metaEnv } = require('./metaConfig');

/** Verify X-Hub-Signature-256 against the raw request body. */
function verifySignature(rawBody, header, appSecret) {
  if (!appSecret || !header || !header.startsWith('sha256=')) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ───────── field_data → CRM fields ───────── */
const FIELD_ALIASES = {
  name: ['full_name', 'name', 'full name'],
  first: ['first_name', 'first name'],
  last: ['last_name', 'last name'],
  phone: ['phone_number', 'phone', 'mobile', 'mobile_number', 'whatsapp_number', 'contact_number'],
  email: ['email', 'email_address', 'work_email'],
  company: ['company_name', 'company', 'business_name', 'organization'],
  city: ['city'],
  budget: ['budget', 'your_budget', 'monthly_budget', 'what_is_your_budget', 'budget_range', 'approx_budget'],
};
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const pretty = (s) => String(s).replace(/_/g, ' ').replace(/\?$/, '').replace(/^\w/, (c) => c.toUpperCase());

function mapFieldData(fieldData = []) {
  const out = { extras: [] };
  for (const f of fieldData) {
    const key = norm(f.name);
    const val = (f.values || []).join(', ').trim();
    if (!val) continue;
    const hit = Object.entries(FIELD_ALIASES).find(([, al]) => al.map(norm).includes(key));
    if (hit && !out[hit[0]]) out[hit[0]] = val;
    else out.extras.push(`${pretty(f.name)}: ${val}`);
  }
  if (!out.name) out.name = [out.first, out.last].filter(Boolean).join(' ');
  return out;
}

/** Guess a CRM service from free-text answers (e.g. "Which service do you need? – SEO"). */
async function guessService(text) {
  if (!text) return '';
  const services = await M.Service.find({ active: true }).lean();
  const t = text.toLowerCase();
  const hit = services.find((s) => t.includes(s.label.toLowerCase())) || services.find((s) => t.includes(s.slug.replace(/-/g, ' ')));
  return hit?.slug || '';
}

const formNameCache = new Map();
async function formName(formId) {
  if (!formId) return '';
  if (formNameCache.has(formId)) return formNameCache.get(formId);
  try { const f = await graph(formId, { params: { fields: 'name' } }); formNameCache.set(formId, f.name || ''); return f.name || ''; }
  catch { return ''; }
}

/** Fetch one lead (with ad/campaign info when available) */
async function fetchLead(leadgenId) {
  try {
    return await graph(leadgenId, { params: { fields: 'id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform,is_organic' } });
  } catch (e) {
    if (e.code === 100) return graph(leadgenId, { params: { fields: 'id,created_time,field_data,ad_id,form_id' } });
    throw e;
  }
}

/**
 * Create/merge a CRM lead from a Meta lead. `lead` may be pre-fetched (sync) or
 * only an id (webhook). Returns { status, leadId }.
 */
async function processMetaLead({ leadgenId, data, formId, pageId, adId, via }) {
  let rec = await M.MetaLead.findOne({ leadgenId });
  if (rec && ['processed', 'merged'].includes(rec.status)) return { status: 'duplicate', lead: rec.lead };
  if (!rec) {
    try { rec = await M.MetaLead.create({ leadgenId, formId, pageId, adId, via }); }
    catch (e) { if (e.code === 11000) return { status: 'duplicate' }; throw e; }
  }
  rec.attempts += 1;
  try {
    const d = data || (await fetchLead(leadgenId));
    const f = mapFieldData(d.field_data);
    const fName = await formName(d.form_id || formId);
    if (!f.name && !f.phone && !f.email) throw new Error('Lead has no name, phone or email fields');
    const campaign = d.campaign_name || fName || 'Meta Lead Ads';
    const platform = (d.platform || '').toLowerCase(); // 'fb' | 'ig'
    const service = await guessService([fName, d.campaign_name, d.ad_name, ...f.extras].join(' '));
    const message = [
      fName && `Form: ${fName}`, d.ad_name && `Ad: ${d.ad_name}`, d.adset_name && `Ad set: ${d.adset_name}`,
      platform && `Platform: ${platform === 'ig' ? 'Instagram' : platform === 'fb' ? 'Facebook' : platform}`,
      f.city && `City: ${f.city}`, f.budget && !parseAmount(f.budget) && `Budget: ${f.budget}`, ...f.extras,
    ].filter(Boolean).join('\n');

    const { lead, merged } = await captureWebsiteEnquiry({
      name: f.name || f.phone || f.email, phone: f.phone || '', email: (f.email || '').toLowerCase(), company: f.company || '',
      service, budget: parseAmount(f.budget) ? String(parseAmount(f.budget)) : '', message, preferredContact: f.phone ? 'whatsapp' : '', formUsed: 'meta_lead_ad',
      pageUrl: `https://www.facebook.com/${d.form_id || formId || ''}`, landingPage: '', referrer: '',
      utm: { source: platform === 'ig' ? 'instagram' : 'facebook', medium: 'paid_social', campaign, content: d.ad_name || '', term: d.adset_name || '' },
    }, { ip: '', userAgent: `meta-${via}` });

    Object.assign(rec, {
      status: merged ? 'merged' : 'processed', lead: lead._id, error: '', formId: d.form_id || formId, formName: fName,
      adId: d.ad_id || adId, campaignName: d.campaign_name || '', metaCreatedAt: d.created_time ? new Date(d.created_time) : null,
    });
    await rec.save();
    return { status: rec.status, lead: lead._id };
  } catch (e) {
    rec.status = 'error';
    rec.error = e.message.slice(0, 500);
    await rec.save();
    const authProblem = e instanceof client.MetaError && e.fatal; // reported once by metaClient
    if (!authProblem) await saveMetaSettings({ lastError: `${new Date().toISOString()} — ${e.message}` });
    if (rec.attempts === 1 && !authProblem) {
      notify({ users: await admins(), type: 'integration_error', title: 'Meta lead could not be imported', body: e.message.slice(0, 140), url: '/settings?tab=integrations' });
    }
    return { status: 'error', error: e.message };
  }
}

/** Pull leads created since `since` (Date) from every form on the Page. */
async function syncLeads({ since, via = 'sync' } = {}) {
  const s = await getMetaSettings();
  if (!s.pageId || !metaEnv().token) throw new client.MetaError('missing_config', 'Set META_PAGE_ID and META_PAGE_ACCESS_TOKEN in the server environment (Render → Environment)');
  try {
    const summary = await client.inContext('sync', () => pullLeads(s, since, via));
    await client.noteOk(via === 'sync' ? 'sync' : via);
    return summary;
  } catch (e) {
    if (e instanceof client.MetaError) await client.noteFailure(e, 'sync');
    throw e;
  }
}

async function pullLeads(s, since, via) {
  const ts = Math.floor((since || new Date(Date.now() - 24 * 3600 * 1000)).getTime() / 1000);
  const summary = { forms: 0, fetched: 0, created: 0, merged: 0, duplicates: 0, errors: 0 };
  let forms = [];
  let after;
  for (let guard = 0; guard < 20; guard++) {
    const page = await graph(`${s.pageId}/leadgen_forms`, { params: { fields: 'id,name,status', limit: '100', ...(after ? { after } : {}) } });
    forms = forms.concat(page.data || []);
    after = page.paging?.next ? page.paging?.cursors?.after : null;
    if (!after) break;
  }
  summary.forms = forms.length;
  for (const form of forms) {
    formNameCache.set(form.id, form.name || '');
    let cursor;
    for (let guard = 0; guard < 50; guard++) {
      const page = await graph(`${form.id}/leads`, {
        params: {
          fields: 'id,created_time,field_data,ad_id,ad_name,adset_name,campaign_name,form_id,platform',
          filtering: JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: ts }]),
          limit: '100', ...(cursor ? { after: cursor } : {}),
        },
      });
      for (const d of page.data || []) {
        summary.fetched += 1;
        const r = await processMetaLead({ leadgenId: d.id, data: d, formId: form.id, pageId: s.pageId, via });
        if (r.status === 'processed') summary.created += 1;
        else if (r.status === 'merged') summary.merged += 1;
        else if (r.status === 'duplicate') summary.duplicates += 1;
        else summary.errors += 1;
      }
      cursor = page.paging?.cursors?.after;
      if (!page.paging?.next || !cursor) break;
    }
  }
  await saveMetaSettings({ lastSyncAt: new Date(), ...(summary.errors ? {} : { lastError: '' }) });
  return summary;
}

let lastAutoSync = 0;
/**
 * Called by the scheduler every minute; syncs every `syncMinutes`.
 * Never throws: auth problems pause the sync with a back-off (see metaClient.syncGate) and are
 * logged once, instead of the same Meta error every run.
 */
async function metaAutoSync() {
  const s = await getMetaSettings();
  if (!s.enabled || !s.syncMinutes) return;
  if (!s.pageId || !metaEnv().token) { await client.noteMissingConfig(); return; }
  const gate = client.syncGate();
  if (!gate.allowed) return; // backing off after an auth/network problem
  const resumed = client.consumeResume(); // auth just recovered → catch up now
  if (!gate.retrying && !resumed && Date.now() - lastAutoSync < s.syncMinutes * 60000) return;
  lastAutoSync = Date.now();
  // overlap 10 min with the previous successful run; the leadgen_id index prevents duplicates.
  // lastSyncAt only moves on success, so leads created during an outage are picked up afterwards.
  const since = s.lastSyncAt ? new Date(new Date(s.lastSyncAt).getTime() - 10 * 60000) : new Date(Date.now() - 24 * 3600 * 1000);
  try { await syncLeads({ since, via: 'sync' }); }
  catch (e) { if (!(e instanceof client.MetaError)) console.error('[META] auto-sync error:', e.message); }
}

module.exports = { getMetaSettings, saveMetaSettings, graph, verifySignature, processMetaLead, syncLeads, metaAutoSync, mapFieldData, validateAuth: client.validateAuth, authState: client.authState, summarize: client.summarize };
