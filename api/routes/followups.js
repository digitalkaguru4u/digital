const express = require('express');
const mongoose = require('mongoose');
const { z } = require('zod');
const { DateTime } = require('luxon');
const M = require('../models');
const { asyncHandler, HttpError } = require('../utils/http');
const { cleanText } = require('../utils/text');
const { todayBounds, TZ } = require('../utils/dates');
const validate = require('../middleware/validate');
const { can, leadScope, requirePermission } = require('../middleware/auth');
const { logActivity } = require('../services/activity');
const { getLookups } = require('../services/lookups');
const S = require('../services/leadService');

const router = express.Router();
const oid = z.string().regex(/^[a-f0-9]{24}$/i, 'Invalid id');
const optOid = z.union([oid, z.literal(''), z.null()]).optional().transform((v) => v || null);
const txt = (max) => z.preprocess((v) => cleanText(v), z.string().max(max));

/** "2026-09-26" + "15:30" in the business timezone → Date */
function toDue(date, time) {
  const d = DateTime.fromISO(`${date}T${time || '10:00'}`, { zone: TZ });
  if (!d.isValid) throw new HttpError(422, 'Invalid follow-up date/time');
  return d.toJSDate();
}
const fmtDue = (d) => DateTime.fromJSDate(d).setZone(TZ).toFormat("dd LLL yyyy 'at' h:mm a");

const scope = (user) => (can(user, 'leads:view_all') ? {} : { assignedTo: user._id });

function bucketFilter(bucket) {
  const { start, end } = todayBounds();
  switch (bucket) {
    case 'today': return { status: 'pending', dueAt: { $gte: start, $lt: end } };
    case 'overdue': return { status: 'pending', dueAt: { $lt: start } };
    case 'upcoming': return { status: 'pending', dueAt: { $gte: end } };
    case 'completed': return { status: 'completed' };
    case 'cancelled': return { status: 'cancelled' };
    default: return { status: 'pending' };
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const bucket = req.query.bucket || 'today';
  const base = scope(req.user);
  const filter = { ...base, ...bucketFilter(bucket) };
  if (req.query.lead && mongoose.isValidObjectId(req.query.lead)) filter.lead = req.query.lead;
  if (req.query.type) filter.type = { $in: String(req.query.type).split(',') };
  if (req.query.assignedTo && mongoose.isValidObjectId(req.query.assignedTo) && can(req.user, 'leads:view_all')) filter.assignedTo = req.query.assignedTo;
  if (req.query.priority) filter.priority = { $in: String(req.query.priority).split(',') };
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
  const sort = bucket === 'completed' ? { completedAt: -1 } : bucket === 'overdue' ? { dueAt: 1 } : { dueAt: 1 };

  // Hide follow-ups of deleted leads
  const deleted = await M.Lead.find({ isDeleted: true }).distinct('_id');
  if (deleted.length) filter.lead = filter.lead ? filter.lead : { $nin: deleted };

  const [items, total, counts] = await Promise.all([
    M.Followup.find(filter).sort(sort).skip((page - 1) * limit).limit(limit)
      .populate('lead', 'leadId name phone email status budget service')
      .populate('assignedTo', 'name').populate('completedBy', 'name').lean(),
    M.Followup.countDocuments(filter),
    Promise.all(['today', 'upcoming', 'overdue', 'completed'].map((b) =>
      M.Followup.countDocuments({ ...base, ...bucketFilter(b), ...(deleted.length ? { lead: { $nin: deleted } } : {}) }))),
  ]);
  res.json({ items, total, page, pages: Math.max(1, Math.ceil(total / limit)), counts: { today: counts[0], upcoming: counts[1], overdue: counts[2], completed: counts[3] } });
}));

const createBody = z.object({
  lead: oid,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time').default('10:00'),
  type: z.string().min(1).max(40),
  assignedTo: optOid,
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  reminderMinutes: z.coerce.number().int().min(0).max(10080).default(15),
  notes: txt(3000).optional().default(''),
});

async function createFollowup(body, user) {
  const lead = await M.Lead.findOne({ _id: body.lead, isDeleted: false, ...leadScope(user) });
  if (!lead) throw new HttpError(404, 'Lead not found');
  const { followupTypes } = await getLookups();
  const type = followupTypes.find((t) => t.key === body.type && t.active);
  if (!type) throw new HttpError(422, 'Unknown follow-up type');
  const f = await M.Followup.create({
    lead: lead._id, dueAt: toDue(body.date, body.time), type: type.key,
    assignedTo: body.assignedTo || lead.assignedTo || user._id, priority: body.priority,
    reminderMinutes: body.reminderMinutes, notes: body.notes, createdBy: user._id,
  });
  await logActivity(lead._id, 'followup_scheduled', `${type.label} follow-up scheduled for ${fmtDue(f.dueAt)}`, {
    description: body.notes, meta: { followup: f._id, priority: body.priority }, user,
  });
  await S.recomputeNextFollowUp(lead._id);
  return f;
}

router.post('/', requirePermission('followups:manage'), validate(createBody), asyncHandler(async (req, res) => {
  const f = await createFollowup(req.body, req.user);
  res.status(201).json({ followup: f });
}));

async function loadFollowup(req) {
  if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(404, 'Follow-up not found');
  const f = await M.Followup.findOne({ _id: req.params.id, ...scope(req.user) });
  if (!f) throw new HttpError(404, 'Follow-up not found');
  return f;
}

router.patch('/:id', requirePermission('followups:manage'),
  validate(z.object({
    type: z.string().max(40).optional(), assignedTo: optOid, priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    reminderMinutes: z.coerce.number().int().min(0).max(10080).optional(), notes: txt(3000).optional(),
  })),
  asyncHandler(async (req, res) => {
    const f = await loadFollowup(req);
    for (const k of ['type', 'priority', 'reminderMinutes', 'notes']) if (req.body[k] !== undefined) f[k] = req.body[k];
    if ('assignedTo' in req.body) f.assignedTo = req.body.assignedTo;
    await f.save();
    res.json({ followup: f });
  }));

router.post('/:id/reschedule', requirePermission('followups:manage'),
  validate(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/), reason: txt(1000).optional().default('') })),
  asyncHandler(async (req, res) => {
    const f = await loadFollowup(req);
    if (f.status !== 'pending') throw new HttpError(422, 'Only pending follow-ups can be rescheduled');
    const old = f.dueAt;
    f.rescheduledFrom = old;
    f.rescheduleCount += 1;
    f.dueAt = toDue(req.body.date, req.body.time);
    f.reminderSentAt = null; // remind again for the new time
    await f.save();
    await logActivity(f.lead, 'followup_rescheduled', `Follow-up rescheduled from ${fmtDue(old)} to ${fmtDue(f.dueAt)}`, { description: req.body.reason, user: req.user });
    await S.recomputeNextFollowUp(f.lead);
    res.json({ followup: f });
  }));

router.post('/:id/cancel', requirePermission('followups:manage'), validate(z.object({ reason: txt(1000).optional().default('') })),
  asyncHandler(async (req, res) => {
    const f = await loadFollowup(req);
    if (f.status !== 'pending') throw new HttpError(422, 'Follow-up is not pending');
    f.status = 'cancelled';
    await f.save();
    await logActivity(f.lead, 'followup_cancelled', 'Follow-up cancelled', { description: req.body.reason, user: req.user });
    await S.recomputeNextFollowUp(f.lead);
    res.json({ followup: f });
  }));

/**
 * Complete a follow-up and, in the same step, optionally:
 * add a note, change the lead stage / budget, and schedule the next follow-up.
 */
router.post('/:id/complete', requirePermission('followups:manage'),
  validate(z.object({
    outcome: txt(3000).optional().default(''),
    addAsNote: z.boolean().optional().default(false),
    status: z.string().max(40).optional().default(''),
    lostReason: optOid,
    lostReasonText: txt(500).optional().default(''),
    budget: z.union([z.string().max(30), z.number(), z.null()]).optional(),
    next: createBody.omit({ lead: true }).optional().nullable(),
  })),
  asyncHandler(async (req, res) => {
    const f = await loadFollowup(req);
    if (f.status !== 'pending') throw new HttpError(422, 'Follow-up is already ' + f.status);
    const lead = await M.Lead.findOne({ _id: f.lead, isDeleted: false });
    if (!lead) throw new HttpError(404, 'Lead not found');
    const b = req.body;
    // Validate status change first so nothing is half-applied
    if (b.status && b.status !== lead.status) {
      const { statuses } = await getLookups();
      const def = statuses.find((s) => s.key === b.status);
      if (!def) throw new HttpError(422, 'Unknown status');
      if (def.requiresReason && !b.lostReason) throw new HttpError(422, 'Select a reason for ' + def.label);
    }
    const { followupTypes } = await getLookups();
    const typeLabel = followupTypes.find((t) => t.key === f.type)?.label || f.type;
    f.status = 'completed';
    f.completedAt = new Date();
    f.completedBy = req.user._id;
    f.outcome = b.outcome;
    await f.save();
    lead.lastContactedAt = new Date();
    await lead.save();
    await logActivity(lead._id, 'followup_completed', `${typeLabel} follow-up completed`, { description: b.outcome, meta: { followup: f._id }, user: req.user });
    if (b.addAsNote && b.outcome) {
      await M.LeadNote.create({ lead: lead._id, text: b.outcome, createdBy: req.user._id });
      await logActivity(lead._id, 'note_added', 'Note added', { description: b.outcome.slice(0, 500), user: req.user });
    }
    if (b.status && b.status !== lead.status) await S.changeStatus(lead, b.status, { user: req.user, lostReason: b.lostReason, lostReasonText: b.lostReasonText });
    if (b.budget !== undefined && b.budget !== '' && S.parseAmount(b.budget) !== (lead.budget || null)) await S.setBudget(lead, b.budget, { user: req.user });
    let next = null;
    if (b.next) next = await createFollowup({ ...b.next, lead: String(lead._id) }, req.user);
    await S.recomputeNextFollowUp(lead._id);
    res.json({ followup: f, next });
  }));

module.exports = router;
module.exports.createFollowup = createFollowup;
