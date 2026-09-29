const M = require('../models');
const { logActivity } = require('./activity');
const { getLookups } = require('./lookups');
const { normalizePhone, escapeRegex } = require('../utils/text');
const { HttpError } = require('../utils/http');
const { sendMail } = require('./mailer');
const config = require('../config');
const { notify, leadAudience } = require('./notify');

const fmtINR = (n) => (n == null ? '' : `₹${Number(n).toLocaleString('en-IN')}`);

/** Parse a budget typed by a person: 35000, "35,000", "₹35k", "1.5L", "2 lakh", "1cr" → number (₹) or null. */
function parseAmount(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  const s = String(v).toLowerCase().replace(/[,₹\s]|rs\.?|inr|\/-/g, '');
  const m = s.match(/^(\d+(?:\.\d+)?)(k|l|lac|lacs|lakh|lakhs|cr|crore|crores)?$/);
  if (!m) return null;
  const mult = { k: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 }[m[2]] || 1;
  const n = Math.round(parseFloat(m[1]) * mult);
  return n > 0 && n < 1e11 ? n : null;
}

/** Work out the lead source key from UTM params, click ids and referrer. */
function deriveSourceKey({ utm = {}, referrer = '', formUsed = '' }) {
  if (formUsed === 'whatsapp_quick') return 'whatsapp';
  if (formUsed === 'meta_lead_ad') return 'meta_ads';
  const s = (utm.source || '').toLowerCase();
  const m = (utm.medium || '').toLowerCase();
  const paid = /(cpc|ppc|paid|ads?|display|cpm|paid_social|paidsocial|sponsored)/.test(m);
  if (utm.gclid || (/(google|adwords|gads)/.test(s) && paid)) return 'google_ads';
  if (/(facebook|fb|instagram|ig|meta)/.test(s) && paid) return 'meta_ads';
  if (/(instagram|^ig$)/.test(s)) return 'instagram';
  if (/(facebook|^fb$)/.test(s)) return 'facebook';
  if (s === 'whatsapp') return 'whatsapp';
  if (s) return /(google|bing|yahoo|duckduckgo)/.test(s) ? 'website' : 'referral';
  if (utm.fbclid) return 'facebook';
  let host = '';
  try { host = referrer ? new URL(referrer).hostname.toLowerCase() : ''; } catch { host = ''; }
  const own = (() => { try { return new URL(config.siteUrl).hostname.replace(/^www\./, ''); } catch { return ''; } })();
  if (!host || (own && host.endsWith(own))) return 'direct';
  if (/(google|bing|yahoo|duckduckgo|ecosia|baidu)\./.test(host)) return 'website'; // organic search → website
  if (host.includes('instagram')) return 'instagram';
  if (host.includes('facebook') || host === 'fb.com' || host.includes('fb.me')) return 'facebook';
  if (host.includes('whatsapp') || host === 'wa.me') return 'whatsapp';
  return 'referral';
}

async function upsertCampaign(utm = {}) {
  if (!utm.campaign) return null;
  const key = [utm.source, utm.medium, utm.campaign].map((x) => (x || '').toLowerCase().trim()).join('|');
  return M.Campaign.findOneAndUpdate(
    { key },
    { $setOnInsert: { key, name: utm.campaign, utmSource: utm.source || '', utmMedium: utm.medium || '', utmCampaign: utm.campaign } },
    { upsert: true, new: true }
  );
}

async function nextLeadId() {
  const seq = await M.nextSeq('lead');
  return `DG-${String(seq).padStart(6, '0')}`;
}

/** Find non-deleted leads matching phone (last 10 digits) or email. */
async function findDuplicates({ phone, email, excludeId }) {
  const or = [];
  const p = normalizePhone(phone);
  if (p && p.length >= 8) or.push({ phoneNormalized: p });
  if (email) or.push({ email: new RegExp(`^${escapeRegex(email.trim())}$`, 'i') });
  if (!or.length) return [];
  const q = { isDeleted: false, $or: or };
  if (excludeId) q._id = { $ne: excludeId };
  return M.Lead.find(q).sort({ createdAt: 1 }).limit(5).populate('service', 'label').populate('assignedTo', 'name').lean();
}

async function recomputeNextFollowUp(leadId) {
  const next = await M.Followup.findOne({ lead: leadId, status: 'pending' }).sort({ dueAt: 1 }).lean();
  await M.Lead.updateOne({ _id: leadId }, { $set: { nextFollowUpAt: next ? next.dueAt : null } });
}

async function notifyNewLead(lead, { repeat = false } = {}) {
  if (!config.newLeadNotify.length) return;
  const url = `${config.siteUrl}/admin/leads/${lead._id}`;
  await sendMail({
    to: config.newLeadNotify.join(','),
    subject: `${repeat ? 'Repeat enquiry' : 'New lead'}: ${lead.name} (${lead.leadId})`,
    text: `${repeat ? 'An existing lead submitted another enquiry.' : 'A new lead just came in.'}\n\nName: ${lead.name}\nPhone: ${lead.phone}\nEmail: ${lead.email}\nForm: ${lead.formUsed}\n\nOpen in CRM: ${url}`,
  });
}

/**
 * Website intake. Creates a lead, or — if the phone/email already exists —
 * attaches the enquiry to the existing lead instead of duplicating it.
 */
async function captureWebsiteEnquiry(input, reqMeta) {
  const lookups = await getLookups();
  const service = input.service ? lookups.services.find((s) => s.slug === input.service || String(s._id) === input.service) : null;
  const sourceKey = deriveSourceKey(input);
  const source = lookups.sources.find((s) => s.key === sourceKey) || lookups.sources.find((s) => s.key === 'other');
  const budget = parseAmount(input.budget);
  const campaign = await upsertCampaign(input.utm);

  const enquiryBase = {
    name: input.name, phone: input.phone, email: input.email, company: input.company,
    service: service?._id || null, budgetLabel: budget ? fmtINR(budget) : '', message: input.message,
    preferredContact: input.preferredContact, formUsed: input.formUsed, pageUrl: input.pageUrl,
    landingPage: input.landingPage, referrer: input.referrer, source: source?._id || null,
    utm: input.utm, ip: reqMeta.ip, userAgent: reqMeta.userAgent,
  };

  const [existing] = await findDuplicates({ phone: input.phone, email: input.email });
  if (existing) {
    const lead = await M.Lead.findById(existing._id);
    const set = { lastEnquiryAt: new Date() };
    if (!lead.email && input.email) set.email = input.email;
    if (!lead.phone && input.phone) { set.phone = input.phone; set.phoneNormalized = normalizePhone(input.phone); }
    if (!lead.company && input.company) set.company = input.company;
    if (!lead.service && service) set.service = service._id;
    if (!lead.budget && budget) set.budget = budget;
    const statusDef = lookups.statuses.find((s) => s.key === lead.status);
    const reopen = statusDef && statusDef.isLost;
    if (reopen) Object.assign(set, { status: 'NEW', statusChangedAt: new Date() });
    await M.Lead.updateOne({ _id: lead._id }, { $set: set, $inc: { enquiryCount: 1 } });
    await M.Enquiry.create({ ...enquiryBase, lead: lead._id, merged: true });
    await logActivity(lead._id, 'enquiry', 'Repeat enquiry received', {
      description: [service ? `Service: ${service.label}` : '', input.message].filter(Boolean).join(' — '),
      meta: { formUsed: input.formUsed, pageUrl: input.pageUrl, source: source?.label },
    });
    if (reopen) {
      await logActivity(lead._id, 'status_changed', `Status changed from ${lead.status} to NEW`, {
        description: 'Re-opened automatically because the lead enquired again', meta: { from: lead.status, to: 'NEW' },
      });
    }
    notifyNewLead({ ...lead.toObject(), formUsed: input.formUsed }, { repeat: true }).catch(() => {});
    if (!input.silent) {
      notify({
        users: await leadAudience(lead), type: 'repeat_enquiry', lead,
        title: `Repeat enquiry: ${lead.name}`,
        body: [input.formUsed === 'meta_lead_ad' ? 'Meta Lead Ad' : 'Website', service?.label, input.phone].filter(Boolean).join(' · ') + (reopen ? ' — re-opened' : ''),
        url: `/leads/${lead._id}`,
      });
    }
    return { lead, merged: true };
  }

  const lead = await M.Lead.create({
    leadId: await nextLeadId(),
    name: input.name,
    phone: input.phone,
    phoneNormalized: normalizePhone(input.phone),
    email: input.email,
    company: input.company,
    service: service?._id || null,
    source: source?._id || null,
    campaign: campaign?._id || null,
    utm: input.utm,
    landingPage: input.landingPage || input.pageUrl,
    referrer: input.referrer,
    formUsed: input.formUsed,
    message: input.message,
    preferredContact: input.preferredContact,
    budget,
    status: 'NEW',
  });
  await M.Enquiry.create({ ...enquiryBase, lead: lead._id });
  await logActivity(lead._id, 'lead_created', input.formUsed === 'meta_lead_ad' ? 'Lead created from Meta Lead Ad' : 'Lead created from website', {
    description: `Form: ${input.formUsed}${service ? ` · Service: ${service.label}` : ''}`,
    meta: { source: source?.label, campaign: input.utm?.campaign, pageUrl: input.pageUrl },
  });
  notifyNewLead(lead).catch(() => {});
  if (!input.silent) {
    const isMeta = input.formUsed === 'meta_lead_ad';
    notify({
      users: await leadAudience(lead), type: isMeta ? 'meta_lead' : 'new_lead', lead,
      title: `${isMeta ? 'New Meta lead' : 'New lead'}: ${lead.name}`,
      body: [service?.label, budget && fmtINR(budget), input.phone, source?.label].filter(Boolean).join(' · '),
      url: `/leads/${lead._id}`,
    });
  }
  return { lead, merged: false };
}

/**
 * Change a lead's pipeline status with workflow rules:
 *  - statuses flagged requiresReason need a lost reason
 *  - booked statuses initialise booking details
 *  - every change is written to the timeline
 */
async function changeStatus(lead, newKey, { user, lostReason, lostReasonText, note, silent = false } = {}) {
  const { statuses, lostReasons } = await getLookups();
  const def = statuses.find((s) => s.key === newKey && s.active);
  if (!def) throw new HttpError(422, `Unknown status: ${newKey}`);
  if (lead.status === newKey) return lead;
  const from = lead.status;

  let reasonLabel = '';
  if (def.requiresReason) {
    const r = lostReason ? lostReasons.find((x) => String(x._id) === String(lostReason)) : null;
    if (!r) throw new HttpError(422, 'Select a reason for marking this lead as ' + def.label);
    reasonLabel = r.label + (lostReasonText ? ` — ${lostReasonText}` : '');
    lead.lostReason = r._id;
    lead.lostReasonText = lostReasonText || '';
    lead.lostAt = new Date();
  }
  if (def.isBooked && !lead.booking) {
    lead.booking = {
      serviceBooked: lead.service || null,
      finalBudget: lead.budget || null,
      bookingDate: new Date(),
      paymentStatus: 'pending',
      assignedTo: lead.assignedTo || null,
    };
  }
  lead.status = newKey;
  lead.statusChangedAt = new Date();
  await lead.save();

  await logActivity(lead._id, def.requiresReason ? 'lost' : 'status_changed', `Status changed from ${from} to ${newKey}`, {
    description: [reasonLabel && `Reason: ${reasonLabel}`, note].filter(Boolean).join('\n'),
    meta: { from, to: newKey, reason: reasonLabel || undefined },
    user,
  });

  const prevDef = statuses.find((x) => x.key === from);
  if (silent) { /* no notifications (seed / import) */ } else if (def.isWon && !prevDef?.isWon) {
    notify({ users: await leadAudience(lead), exclude: user, type: 'booked', lead, title: `🎉 Booked: ${lead.name}`, body: `${user?.name || 'Someone'} moved ${lead.leadId} to ${def.label}`, url: `/leads/${lead._id}` });
  } else if (def.isLost) {
    notify({ users: await leadAudience(lead), exclude: user, type: 'lost', lead, title: `Lost: ${lead.name}`, body: reasonLabel ? `Reason: ${reasonLabel}` : def.label, url: `/leads/${lead._id}` });
  }

  if (def.isLost) {
    const pending = await M.Followup.find({ lead: lead._id, status: 'pending' });
    if (pending.length) {
      await M.Followup.updateMany({ lead: lead._id, status: 'pending' }, { $set: { status: 'cancelled' } });
      await logActivity(lead._id, 'followup_cancelled', `${pending.length} pending follow-up(s) cancelled`, {
        description: `Lead marked ${def.label}`, user,
      });
      await recomputeNextFollowUp(lead._id);
    }
  }
  return lead;
}

/** Set / clear a lead's budget amount and log it. */
async function setBudget(lead, amount, { user } = {}) {
  const next = amount === null || amount === '' ? null : parseAmount(amount);
  if (amount !== null && amount !== '' && next === null) throw new HttpError(422, 'Enter the budget as an amount, e.g. 25000 or 1.5L');
  if ((lead.budget || null) === next) return lead;
  const before = lead.budget ? fmtINR(lead.budget) : 'not set';
  lead.budget = next;
  await lead.save();
  await logActivity(lead._id, 'budget_changed', `Budget changed from ${before} to ${next ? fmtINR(next) : 'not set'}`, { meta: { to: next }, user });
  return lead;
}

/** Tell a user a lead was assigned to them (not when they assigned it to themselves). */
function notifyAssigned(lead, assigneeId, actor) {
  if (!assigneeId) return;
  notify({ users: [assigneeId], exclude: actor, type: 'assigned', lead, title: `Lead assigned to you: ${lead.name}`, body: `${lead.leadId}${actor?.name ? ` · by ${actor.name}` : ''}`, url: `/leads/${lead._id}` });
}

module.exports = {
  notifyAssigned,
  parseAmount, setBudget, deriveSourceKey, upsertCampaign, nextLeadId, findDuplicates, recomputeNextFollowUp,
  captureWebsiteEnquiry, changeStatus, fmtINR,
};
