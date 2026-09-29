const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const ExcelJS = require('exceljs');
const M = require('../models');
const { asyncHandler, HttpError } = require('../utils/http');
const { cleanText, normalizePhone, escapeRegex } = require('../utils/text');
const { todayBounds, TZ } = require('../utils/dates');
const validate = require('../middleware/validate');
const { requirePermission, leadScope, can } = require('../middleware/auth');
const { logActivity } = require('../services/activity');
const { getLookups } = require('../services/lookups');
const S = require('../services/leadService');
const { notify, leadAudience } = require('../services/notify');
const { DateTime } = require('luxon');

const router = express.Router();
const oid = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const optOid = z.union([oid, z.literal(''), z.null()]).optional().transform((v) => v || null);
const txt = (max) => z.preprocess((v) => cleanText(v), z.string().max(max));
const csv = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

/* ───────────────────────── helpers ───────────────────────── */

async function loadLead(req, { includeDeleted = false } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Lead not found');
  const q = { _id: req.params.id, ...leadScope(req.user) };
  if (!includeDeleted) q.isDeleted = false;
  const lead = await M.Lead.findOne(q);
  if (!lead) throw new HttpError(404, 'Lead not found');
  return lead;
}

const populateLead = (q) =>
  q.populate('service', 'label slug').populate('source', 'label key').populate('campaign', 'name')
    .populate('assignedTo', 'name email').populate('lostReason', 'label')
    .populate('booking.serviceBooked', 'label').populate('booking.assignedTo', 'name');

/** Translate query-string filters into a Mongo query. Supports multiple filters at once. */
async function buildFilter(query, user) {
  const f = { ...leadScope(user), isDeleted: query.deleted === '1' };
  const and = [];
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q.trim()), 'i');
    const digits = normalizePhone(query.q);
    and.push({ $or: [{ name: rx }, { email: rx }, { company: rx }, { leadId: rx }, { phone: rx }, ...(digits.length >= 4 ? [{ phoneNormalized: new RegExp(escapeRegex(digits)) }] : [])] });
  }
  const multi = (field, values, cast = (x) => x) => { if (values.length) f[field] = { $in: values.map(cast) }; };
  const toId = (x) => new mongoose.Types.ObjectId(x);
  const validIds = (arr) => arr.filter((x) => mongoose.isValidObjectId(x));
  multi('status', csv(query.status));
  multi('service', validIds(csv(query.service)), toId);
  multi('source', validIds(csv(query.source)), toId);
  multi('campaign', validIds(csv(query.campaign)), toId);
  if (query.budget === 'has') f.budget = { $gt: 0 };
  if (query.budget === 'none') f.budget = { $not: { $gt: 0 } };
  multi('booking.paymentStatus', csv(query.paymentStatus));
  const assigned = csv(query.assignedTo);
  if (assigned.length) {
    const ids = validIds(assigned).map(toId);
    const or = [];
    if (ids.length) or.push({ assignedTo: { $in: ids } });
    if (assigned.includes('unassigned')) or.push({ assignedTo: null });
    and.push({ $or: or });
  }
  const range = (fromStr, toStr) => {
    const r = {};
    if (fromStr) { const d = DateTime.fromISO(fromStr, { zone: TZ }); if (d.isValid) r.$gte = d.startOf('day').toJSDate(); }
    if (toStr) { const d = DateTime.fromISO(toStr, { zone: TZ }); if (d.isValid) r.$lt = d.startOf('day').plus({ days: 1 }).toJSDate(); }
    return Object.keys(r).length ? r : null;
  };
  const created = range(query.from, query.to);
  if (created) f.createdAt = created;
  const { start, end } = todayBounds();
  switch (query.followup) {
    case 'today': f.nextFollowUpAt = { $gte: start, $lt: end }; break;
    case 'overdue': f.nextFollowUpAt = { $lt: start }; break;
    case 'upcoming': f.nextFollowUpAt = { $gte: end }; break;
    case 'none': f.nextFollowUpAt = null; break;
    default: {
      const fr = range(query.followFrom, query.followTo);
      if (fr) f.nextFollowUpAt = fr;
    }
  }
  if (and.length) f.$and = and;
  return f;
}

const SORTABLE = { createdAt: 'createdAt', name: 'name', leadId: 'leadId', status: 'status', nextFollowUpAt: 'nextFollowUpAt', budget: 'budget', updatedAt: 'updatedAt', lastEnquiryAt: 'lastEnquiryAt' };

/* ───────────────────────── list / export ───────────────────────── */

router.get('/', asyncHandler(async (req, res) => {
  const filter = await buildFilter(req.query, req.user);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(5, parseInt(req.query.limit, 10) || 25));
  const sortField = SORTABLE[req.query.sort] || 'createdAt';
  const dir = req.query.order === 'asc' ? 1 : -1;
  const [items, total] = await Promise.all([
    populateLead(M.Lead.find(filter).sort({ [sortField]: dir, _id: dir }).skip((page - 1) * limit).limit(limit)).lean(),
    M.Lead.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) });
}));

const fmtDate = (d) => (d ? DateTime.fromJSDate(new Date(d)).setZone(TZ).toFormat('dd LLL yyyy, HH:mm') : '');
const PAY = { pending: 'Pending', advance_received: 'Advance Received', partially_paid: 'Partially Paid', fully_paid: 'Fully Paid' };

router.get('/export', requirePermission('leads:export'), asyncHandler(async (req, res) => {
  const filter = await buildFilter(req.query, req.user);
  if (req.query.ids) filter._id = { $in: csv(req.query.ids).filter(mongoose.isValidObjectId) };
  const leads = await populateLead(M.Lead.find(filter).sort({ createdAt: -1 }).limit(20000)).lean();
  const cols = [
    ['Lead ID', (l) => l.leadId], ['Name', (l) => l.name], ['Phone', (l) => l.phone], ['Email', (l) => l.email],
    ['Company', (l) => l.company], ['Service', (l) => l.service?.label || ''], ['Budget (INR)', (l) => l.budget || ''],
    ['Source', (l) => l.source?.label || ''],
    ['Campaign', (l) => l.campaign?.name || l.utm?.campaign || ''], ['UTM source', (l) => l.utm?.source || ''],
    ['UTM medium', (l) => l.utm?.medium || ''], ['Landing page', (l) => l.landingPage], ['Form', (l) => l.formUsed],
    ['Stage', (l) => l.status], ['Assigned to', (l) => l.assignedTo?.name || ''],
    ['Next follow-up', (l) => fmtDate(l.nextFollowUpAt)], ['Last contacted', (l) => fmtDate(l.lastContactedAt)],
    ['Lost reason', (l) => [l.lostReason?.label, l.lostReasonText].filter(Boolean).join(' — ')],
    ['Final budget (INR)', (l) => l.booking?.finalBudget || ''], ['Payment status', (l) => (l.booking ? PAY[l.booking.paymentStatus] : '')],
    ['Enquiries', (l) => l.enquiryCount], ['Message', (l) => l.message], ['Created', (l) => fmtDate(l.createdAt)],
  ];
  const stamp = DateTime.now().setZone(TZ).toFormat('yyyyLLdd-HHmm');
  if (req.query.format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Digital Guru CRM';
    const ws = wb.addWorksheet('Leads', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = cols.map(([h]) => ({ header: h, key: h, width: Math.min(40, Math.max(12, h.length + 4)) }));
    leads.forEach((l) => ws.addRow(Object.fromEntries(cols.map(([h, fn]) => [h, fn(l)]))));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF302060' } };
    ws.autoFilter = { from: 'A1', to: { row: 1, column: cols.length } };
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="digital-guru-leads-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }
  const esc = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // CSV formula-injection guard
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const body = [cols.map(([h]) => esc(h)).join(','), ...leads.map((l) => cols.map(([, fn]) => esc(fn(l))).join(','))].join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="digital-guru-leads-${stamp}.csv"`);
  res.send('﻿' + body);
}));

// Counts per stage for the chips above the list (same filters, ignoring the stage filter)
router.get('/stage-counts', asyncHandler(async (req, res) => {
  const filter = await buildFilter({ ...req.query, status: '' }, req.user);
  const rows = await M.Lead.aggregate([{ $match: filter }, { $group: { _id: '$status', n: { $sum: 1 } } }]);
  const counts = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  res.json({ counts, total: rows.reduce((a, r) => a + r.n, 0) });
}));

router.get('/duplicates', asyncHandler(async (req, res) => {
  const items = await S.findDuplicates({ phone: req.query.phone, email: req.query.email, excludeId: mongoose.isValidObjectId(req.query.excludeId) ? req.query.excludeId : undefined });
  res.json({ items });
}));

/* ───────────────────────── create / update ───────────────────────── */

const leadBody = z.object({
  name: txt(120).pipe(z.string().min(2, 'Name is required')),
  phone: txt(20).default(''),
  email: z.preprocess((v) => cleanText(v).toLowerCase(), z.union([z.literal(''), z.string().email('Invalid email')])).default(''),
  company: txt(160).default(''),
  service: optOid,
  source: optOid,
  campaign: optOid,
  message: txt(5000).default(''),
  preferredContact: z.enum(['', 'call', 'whatsapp', 'email']).default(''),
  budget: z.union([z.string().max(30), z.number(), z.null()]).optional(),
  status: z.string().max(40).optional().default(''),
  assignedTo: optOid,
  utm: z.object({ source: txt(120), medium: txt(120), campaign: txt(200), content: txt(200), term: txt(200) }).partial().optional(),
  landingPage: txt(500).optional().default(''),
  force: z.boolean().optional().default(false),
}).refine((b) => b.phone || b.email, { message: 'Phone or email is required', path: ['phone'] });

router.post('/', requirePermission('leads:create'), validate(leadBody), asyncHandler(async (req, res) => {
  const b = req.body;
  if (!b.force) {
    const dups = await S.findDuplicates({ phone: b.phone, email: b.email });
    if (dups.length) return res.status(409).json({ error: 'Existing lead found', duplicates: dups });
  }
  const budget = S.parseAmount(b.budget);
  if (b.budget && budget === null) throw new HttpError(422, 'Enter the budget as an amount, e.g. 25000 or 1.5L');
  const { statuses } = await getLookups();
  const stage = b.status ? statuses.find((x) => x.key === b.status && x.active && !x.requiresReason) : null;
  if (b.status && !stage) throw new HttpError(422, 'Pick a valid stage');
  const campaign = b.campaign ? b.campaign : (await S.upsertCampaign(b.utm || {}))?._id || null;
  const lead = await M.Lead.create({
    leadId: await S.nextLeadId(),
    name: b.name, phone: b.phone, phoneNormalized: normalizePhone(b.phone), email: b.email, company: b.company,
    service: b.service, source: b.source, campaign, utm: b.utm || {}, landingPage: b.landingPage,
    message: b.message, preferredContact: b.preferredContact, formUsed: 'admin',
    budget, status: stage?.key || 'NEW', assignedTo: can(req.user, 'leads:assign') ? b.assignedTo : req.user._id,
    createdBy: req.user._id,
  });
  await logActivity(lead._id, 'lead_created', 'Lead created manually', {
    description: [b.force && 'Created as a separate lead despite a matching phone/email', lead.status !== 'NEW' && `Stage: ${stage.label}`, budget && `Budget: ${S.fmtINR(budget)}`].filter(Boolean).join(' · '),
    user: req.user,
  });
  if (lead.assignedTo) {
    const u = await M.User.findById(lead.assignedTo).lean();
    await logActivity(lead._id, 'assigned', `Assigned to ${u?.name || 'user'}`, { user: req.user });
    S.notifyAssigned(lead, lead.assignedTo, req.user);
  }
  res.status(201).json({ lead: await populateLead(M.Lead.findById(lead._id)).lean() });
}));

const updateBody = z.object({
  name: txt(120).pipe(z.string().min(2)).optional(),
  phone: txt(20).optional(),
  email: z.preprocess((v) => cleanText(v).toLowerCase(), z.union([z.literal(''), z.string().email('Invalid email')])).optional(),
  company: txt(160).optional(),
  service: optOid,
  source: optOid,
  campaign: optOid,
  message: txt(5000).optional(),
  preferredContact: z.enum(['', 'call', 'whatsapp', 'email']).optional(),
  force: z.boolean().optional().default(false),
});

router.patch('/:id', requirePermission('leads:edit'), validate(updateBody), asyncHandler(async (req, res) => {
  const lead = await loadLead(req);
  const b = req.body;
  const phoneChanged = b.phone !== undefined && normalizePhone(b.phone) !== lead.phoneNormalized;
  const emailChanged = b.email !== undefined && b.email !== lead.email;
  if ((phoneChanged || emailChanged) && !b.force) {
    const dups = await S.findDuplicates({ phone: phoneChanged ? b.phone : '', email: emailChanged ? b.email : '', excludeId: lead._id });
    if (dups.length) return res.status(409).json({ error: 'Another lead already uses this phone/email', duplicates: dups });
  }
  const changes = [];
  for (const k of ['name', 'phone', 'email', 'company', 'message', 'preferredContact']) {
    if (b[k] !== undefined && b[k] !== lead[k]) { changes.push(k); lead[k] = b[k]; }
  }
  for (const k of ['service', 'source', 'campaign']) {
    if (k in req.body && String(b[k] || '') !== String(lead[k] || '')) { changes.push(k); lead[k] = b[k]; }
  }
  if (b.phone !== undefined) lead.phoneNormalized = normalizePhone(b.phone);
  if (!lead.phone && !lead.email) throw new HttpError(422, 'Phone or email is required');
  await lead.save();
  if (changes.length) await logActivity(lead._id, 'lead_updated', 'Lead details updated', { description: `Changed: ${changes.join(', ')}`, user: req.user });
  res.json({ lead: await populateLead(M.Lead.findById(lead._id)).lean() });
}));

/* ───────────────────────── detail ───────────────────────── */

router.get('/:id', asyncHandler(async (req, res) => {
  const base = await loadLead(req, { includeDeleted: true });
  const [lead, activities, notes, followups, communications, enquiries, payments] = await Promise.all([
    populateLead(M.Lead.findById(base._id)).lean(),
    M.LeadActivity.find({ lead: base._id }).sort({ createdAt: -1, _id: -1 }).populate('user', 'name').lean(),
    M.LeadNote.find({ lead: base._id }).sort({ createdAt: -1 }).populate('createdBy', 'name').lean(),
    M.Followup.find({ lead: base._id }).sort({ dueAt: -1 }).populate('assignedTo', 'name').lean(),
    M.Communication.find({ lead: base._id }).sort({ createdAt: -1 }).populate('user', 'name').lean(),
    M.Enquiry.find({ lead: base._id }).sort({ createdAt: -1 }).populate('service', 'label').populate('source', 'label').lean(),
    M.Payment.find({ lead: base._id }).sort({ paidAt: -1 }).populate('recordedBy', 'name').lean(),
  ]);
  res.json({ lead, activities, notes, followups, communications, enquiries, payments });
}));

/* ───────────────────────── workflow actions ───────────────────────── */

router.post('/:id/status', requirePermission('leads:edit'),
  validate(z.object({ status: z.string().min(1).max(40), lostReason: optOid, lostReasonText: txt(500).optional().default(''), note: txt(2000).optional().default('') })),
  asyncHandler(async (req, res) => {
    const lead = await loadLead(req);
    await S.changeStatus(lead, req.body.status, { ...req.body, user: req.user });
    res.json({ lead: await populateLead(M.Lead.findById(lead._id)).lean() });
  }));

router.post('/:id/budget', requirePermission('leads:edit'),
  validate(z.object({ amount: z.union([z.string().max(30), z.number(), z.null()]) })),
  asyncHandler(async (req, res) => {
    const lead = await loadLead(req);
    await S.setBudget(lead, req.body.amount, { user: req.user });
    res.json({ lead: await populateLead(M.Lead.findById(lead._id)).lean() });
  }));

router.post('/:id/assign', requirePermission('leads:assign'), validate(z.object({ assignedTo: optOid })),
  asyncHandler(async (req, res) => {
    const lead = await loadLead(req);
    const user = req.body.assignedTo ? await M.User.findOne({ _id: req.body.assignedTo, active: true }).lean() : null;
    if (req.body.assignedTo && !user) throw new HttpError(422, 'User not found');
    lead.assignedTo = user?._id || null;
    await lead.save();
    await logActivity(lead._id, 'assigned', user ? `Assigned to ${user.name}` : 'Unassigned', { user: req.user });
    if (user) S.notifyAssigned(lead, user._id, req.user);
    res.json({ lead: await populateLead(M.Lead.findById(lead._id)).lean() });
  }));

router.delete('/:id', requirePermission('leads:delete'), asyncHandler(async (req, res) => {
  const lead = await loadLead(req);
  lead.isDeleted = true;
  lead.deletedAt = new Date();
  await lead.save();
  await logActivity(lead._id, 'lead_deleted', 'Lead moved to trash', { user: req.user });
  res.json({ ok: true });
}));

router.post('/:id/restore', requirePermission('leads:delete'), asyncHandler(async (req, res) => {
  const lead = await loadLead(req, { includeDeleted: true });
  lead.isDeleted = false;
  lead.deletedAt = null;
  await lead.save();
  await logActivity(lead._id, 'lead_restored', 'Lead restored from trash', { user: req.user });
  res.json({ ok: true });
}));

/* notes */
router.post('/:id/notes', validate(z.object({ text: txt(5000).pipe(z.string().min(1, 'Note cannot be empty')) })),
  asyncHandler(async (req, res) => {
    const lead = await loadLead(req);
    const note = await M.LeadNote.create({ lead: lead._id, text: req.body.text, createdBy: req.user._id });
    await logActivity(lead._id, 'note_added', 'Note added', { description: req.body.text.slice(0, 500), user: req.user });
    res.status(201).json({ note: await M.LeadNote.findById(note._id).populate('createdBy', 'name').lean() });
  }));

/* communications: call / whatsapp / email log */
const OUTCOMES = ['', 'connected', 'no_answer', 'busy', 'switched_off', 'wrong_number', 'callback_requested', 'sent', 'replied', 'interested', 'not_interested'];
router.post('/:id/communications',
  validate(z.object({
    channel: z.enum(['call', 'whatsapp', 'email', 'sms', 'meeting']),
    direction: z.enum(['outbound', 'inbound']).default('outbound'),
    subject: txt(300).optional().default(''),
    message: txt(5000).optional().default(''),
    outcome: z.enum(OUTCOMES).optional().default(''),
  })),
  asyncHandler(async (req, res) => {
    const lead = await loadLead(req);
    const b = req.body;
    const comm = await M.Communication.create({ ...b, lead: lead._id, user: req.user._id });
    const label = { call: 'Call', whatsapp: 'WhatsApp message', email: 'Email', sms: 'SMS', meeting: 'Meeting' }[b.channel];
    const outcome = b.outcome ? ` — ${b.outcome.replace(/_/g, ' ')}` : '';
    const title = b.direction === 'inbound' ? `${label} received${outcome}` : `${b.channel === 'call' ? 'Called' : `${label} sent`}${outcome}`;
    await logActivity(lead._id, ['call', 'whatsapp', 'email'].includes(b.channel) ? b.channel : 'call', title, {
      description: [b.subject, b.message].filter(Boolean).join('\n').slice(0, 1000), meta: { channel: b.channel, outcome: b.outcome }, user: req.user,
    });
    if (b.direction === 'outbound') { lead.lastContactedAt = new Date(); await lead.save(); }
    res.status(201).json({ communication: comm });
  }));

/* add enquiry manually to existing lead (used by duplicate-detection flow) */
router.post('/:id/enquiries', requirePermission('leads:edit'),
  validate(z.object({ service: optOid, message: txt(5000).optional().default(''), source: optOid, budget: z.union([z.string().max(30), z.number(), z.null()]).optional() })),
  asyncHandler(async (req, res) => {
    const lead = await loadLead(req);
    const b = req.body;
    const [svc, src] = await Promise.all([
      b.service ? M.Service.findById(b.service).lean() : null,
      b.source ? M.LeadSource.findById(b.source).lean() : null,
    ]);
    const amount = S.parseAmount(b.budget);
    await M.Enquiry.create({ lead: lead._id, service: svc?._id, source: src?._id, message: b.message, budgetLabel: amount ? S.fmtINR(amount) : '', formUsed: 'admin', merged: true, name: lead.name, phone: lead.phone, email: lead.email });
    lead.enquiryCount += 1;
    lead.lastEnquiryAt = new Date();
    if (!lead.service && svc) lead.service = svc._id;
    if (!lead.budget && amount) lead.budget = amount;
    await lead.save();
    await logActivity(lead._id, 'enquiry', 'New enquiry added to existing lead', {
      description: [svc && `Service: ${svc.label}`, src && `Source: ${src.label}`, b.message].filter(Boolean).join(' — '), user: req.user,
    });
    res.status(201).json({ ok: true });
  }));

/* booking + payments */
router.patch('/:id/booking', requirePermission('leads:edit'),
  validate(z.object({
    serviceBooked: optOid,
    finalBudget: z.coerce.number().min(0).nullable().optional(),
    bookingDate: z.coerce.date().nullable().optional(),
    paymentStatus: z.enum(['pending', 'advance_received', 'partially_paid', 'fully_paid']).optional(),
    projectStartDate: z.union([z.coerce.date(), z.null()]).optional(),
    assignedTo: optOid,
    notes: txt(3000).optional(),
  })),
  asyncHandler(async (req, res) => {
    const lead = await loadLead(req);
    const cur = lead.booking ? lead.booking.toObject() : { paymentStatus: 'pending', bookingDate: new Date() };
    const next = { ...cur };
    for (const k of Object.keys(req.body)) if (req.body[k] !== undefined) next[k] = req.body[k];
    lead.booking = next;
    await lead.save();
    const changed = Object.keys(req.body).filter((k) => String(req.body[k] ?? '') !== String(cur[k] ?? ''));
    if (changed.length) {
      await logActivity(lead._id, 'booking_updated', 'Booking details updated', {
        description: changed.map((k) => `${k}: ${k === 'finalBudget' ? S.fmtINR(next[k]) : k.endsWith('Date') && next[k] ? new Date(next[k]).toDateString() : next[k] ?? '—'}`).join(' · '),
        user: req.user,
      });
    }
    res.json({ lead: await populateLead(M.Lead.findById(lead._id)).lean() });
  }));

router.post('/:id/payments', requirePermission('leads:edit'),
  validate(z.object({
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    paidAt: z.coerce.date().optional(),
    method: z.enum(['upi', 'bank_transfer', 'cash', 'card', 'cheque', 'other']).default('upi'),
    reference: txt(120).optional().default(''),
    note: txt(500).optional().default(''),
  })),
  asyncHandler(async (req, res) => {
    const lead = await loadLead(req);
    const p = await M.Payment.create({ ...req.body, lead: lead._id, recordedBy: req.user._id });
    await logActivity(lead._id, 'payment_added', `Payment received: ${S.fmtINR(p.amount)}`, { description: [p.method.replace('_', ' '), p.reference, p.note].filter(Boolean).join(' · '), user: req.user });
    notify({ users: await leadAudience(lead), exclude: req.user, type: 'payment', lead, title: `Payment ${S.fmtINR(p.amount)} — ${lead.name}`, body: `${p.method.replace('_', ' ')} · recorded by ${req.user.name}`, url: `/leads/${lead._id}` });
    // Keep payment status in sync with the amounts received
    if (lead.booking) {
      const agg = await M.Payment.aggregate([{ $match: { lead: lead._id } }, { $group: { _id: null, total: { $sum: '$amount' } } }]);
      const total = agg[0]?.total || 0;
      const final = lead.booking.finalBudget || 0;
      let status = lead.booking.paymentStatus;
      if (final && total >= final) status = 'fully_paid';
      else if (status === 'pending') status = 'advance_received';
      else if (status === 'advance_received' && (await M.Payment.countDocuments({ lead: lead._id })) > 1) status = 'partially_paid';
      if (status !== lead.booking.paymentStatus) {
        lead.booking.paymentStatus = status;
        await lead.save();
        await logActivity(lead._id, 'booking_updated', `Payment status set to ${PAY[status]}`, { user: req.user });
      }
    }
    res.status(201).json({ payment: p });
  }));

/* ───────────────────────── bulk actions ───────────────────────── */

router.post('/bulk', validate(z.object({
  ids: z.array(oid).min(1).max(500),
  action: z.enum(['status', 'assign', 'delete']),
  value: z.string().max(40).optional().nullable(),
  lostReason: optOid,
})), asyncHandler(async (req, res) => {
  const { ids, action, value, lostReason } = req.body;
  const need = { status: 'leads:edit', assign: 'leads:assign', delete: 'leads:delete' }[action];
  if (!can(req.user, need)) throw new HttpError(403, 'You do not have permission to do this');
  const leads = await M.Lead.find({ _id: { $in: ids }, isDeleted: false, ...leadScope(req.user) });
  let assignee = null;
  if (action === 'assign' && value) {
    assignee = await M.User.findOne({ _id: value, active: true }).lean();
    if (!assignee) throw new HttpError(422, 'User not found');
  }
  const errors = [];
  if (action === 'assign' && assignee && leads.length > 5 && String(assignee._id) !== String(req.user._id)) {
    notify({ users: [assignee._id], type: 'assigned', title: `${leads.length} leads assigned to you`, body: `by ${req.user.name}`, url: '/leads?assignedTo=' + assignee._id });
  }
  for (const lead of leads) {
    try {
      if (action === 'status') await S.changeStatus(lead, value, { user: req.user, lostReason, lostReasonText: 'Bulk update' });
      else if (action === 'assign') {
        lead.assignedTo = assignee?._id || null;
        await lead.save();
        await logActivity(lead._id, 'assigned', assignee ? `Assigned to ${assignee.name}` : 'Unassigned', { description: 'Bulk assignment', user: req.user });
        if (assignee && leads.length <= 5) S.notifyAssigned(lead, assignee._id, req.user);
      } else if (action === 'delete') {
        lead.isDeleted = true; lead.deletedAt = new Date(); await lead.save();
        await logActivity(lead._id, 'lead_deleted', 'Lead moved to trash', { description: 'Bulk delete', user: req.user });
      }
    } catch (e) {
      errors.push({ id: lead._id, leadId: lead.leadId, error: e.message });
    }
  }
  if (errors.length && errors.length === leads.length) throw new HttpError(422, errors[0].error);
  res.json({ updated: leads.length - errors.length, errors });
}));

module.exports = router;
