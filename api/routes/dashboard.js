const express = require('express');
const M = require('../models');
const { asyncHandler } = require('../utils/http');
const { todayBounds } = require('../utils/dates');
const { can, leadScope } = require('../middleware/auth');
const { getLookups } = require('../services/lookups');

const router = express.Router();

/** One accumulator per $group — identical results on MongoDB and Mongo-compatible engines. */
async function countBy(match, field) {
  return M.Lead.aggregate([{ $match: match }, { $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
}
async function sumBy(match, field, sumField) {
  return M.Lead.aggregate([{ $match: match }, { $group: { _id: field ? `$${field}` : null, value: { $sum: `$${sumField}` } } }]);
}

function stageSets(L) {
  const won = L.statuses.filter((s) => s.isWon).map((s) => s.key);
  const lost = L.statuses.filter((s) => s.isLost).map((s) => s.key);
  return { won, lost, closed: [...won, ...lost] };
}

/**
 * Simple, all-time dashboard (no date filter):
 * stage counts · total / untouched / unassigned / no reminder · today's leads, returning, follow-ups
 * · pipeline value · leads needing a budget · sources · services · lost reasons.
 */
router.get('/', asyncHandler(async (req, res) => {
  const L = await getLookups();
  const scope = { ...leadScope(req.user), isDeleted: false };
  const fuScope = can(req.user, 'leads:view_all') ? {} : { assignedTo: req.user._id };
  const { start, end } = todayBounds();
  const { won, lost, closed } = stageSets(L);
  const open = { ...scope, status: { $nin: closed } };
  const needKeys = L.statuses.filter((s) => s.needsBudget && s.active).map((s) => s.key);
  const deleted = await M.Lead.find({ isDeleted: true }).distinct('_id');
  const liveFu = deleted.length ? { lead: { $nin: deleted } } : {};
  const scopedLeadIds = can(req.user, 'leads:view_all') ? null : await M.Lead.find(scope).distinct('_id');

  const [
    total, byStatus, untouched, unassigned, noReminder, todays, returning, fuToday, fuOverdue, fuUpcoming,
    pipeline, openCount, needBudget, bookedValue, bySource, bySourceWon, byService, byLost, todayList, overdueList, recent,
  ] = await Promise.all([
    M.Lead.countDocuments(scope),
    countBy(scope, 'status'),
    M.Lead.countDocuments({ ...scope, status: 'NEW' }),
    M.Lead.countDocuments({ ...open, assignedTo: null }),
    M.Lead.countDocuments({ ...open, nextFollowUpAt: null }),
    M.Lead.countDocuments({ ...scope, createdAt: { $gte: start, $lt: end } }),
    M.Enquiry.countDocuments({ merged: true, createdAt: { $gte: start, $lt: end }, ...(scopedLeadIds ? { lead: { $in: scopedLeadIds } } : {}) }),
    M.Followup.countDocuments({ ...fuScope, ...liveFu, status: 'pending', dueAt: { $gte: start, $lt: end } }),
    M.Followup.countDocuments({ ...fuScope, ...liveFu, status: 'pending', dueAt: { $lt: start } }),
    M.Followup.countDocuments({ ...fuScope, ...liveFu, status: 'pending', dueAt: { $gte: end } }),
    sumBy({ ...open, budget: { $gt: 0 } }, null, 'budget'),
    M.Lead.countDocuments({ ...open, budget: { $gt: 0 } }),
    countBy({ ...scope, status: { $in: needKeys }, budget: { $not: { $gt: 0 } } }, 'status'),
    sumBy({ ...scope, status: { $in: won } }, null, 'booking.finalBudget'),
    countBy(scope, 'source'),
    countBy({ ...scope, status: { $in: won } }, 'source'),
    countBy(scope, 'service'),
    countBy({ ...scope, status: { $in: lost } }, 'lostReason'),
    M.Followup.find({ ...fuScope, ...liveFu, status: 'pending', dueAt: { $gte: start, $lt: end } }).sort({ dueAt: 1 }).limit(8).populate('lead', 'leadId name phone status budget').lean(),
    M.Followup.find({ ...fuScope, ...liveFu, status: 'pending', dueAt: { $lt: start } }).sort({ dueAt: 1 }).limit(8).populate('lead', 'leadId name phone status budget').lean(),
    M.Lead.find(scope).sort({ createdAt: -1 }).limit(6).populate('service', 'label').populate('source', 'label').lean(),
  ]);

  const cnt = (rows, key) => rows.find((r) => String(r._id) === String(key))?.count || 0;
  const label = (list, id) => list.find((x) => String(x._id) === String(id))?.label;
  const wonCount = won.reduce((a, k) => a + cnt(byStatus, k), 0);

  res.json({
    stages: L.statuses.filter((s) => s.active).map((s) => ({ key: s.key, label: s.label, color: s.color, count: cnt(byStatus, s.key), needsBudget: !!s.needsBudget, noBudget: s.needsBudget ? cnt(needBudget, s.key) : 0 })),
    kpis: {
      total, untouched, unassigned, noReminder, todaysLeads: todays, returningToday: returning,
      followupsToday: fuToday, followupsOverdue: fuOverdue, followupsUpcoming: fuUpcoming,
      pipelineValue: pipeline[0]?.value || 0, pipelineLeads: openCount, needBudget: needBudget.reduce((a, r) => a + r.count, 0),
      booked: wonCount, bookedValue: bookedValue[0]?.value || 0,
      lost: lost.reduce((a, k) => a + cnt(byStatus, k), 0),
      conversionRate: total ? Math.round((wonCount / total) * 1000) / 10 : 0,
    },
    bySource: bySource.map((r) => ({ name: label(L.sources, r._id) || 'Unknown', count: r.count, booked: cnt(bySourceWon, r._id) })).sort((a, b) => b.count - a.count),
    byService: byService.map((r) => ({ name: label(L.services, r._id) || 'Not specified', count: r.count })).sort((a, b) => b.count - a.count),
    lostReasons: byLost.map((r) => ({ name: label(L.lostReasons, r._id) || 'Not recorded', count: r.count })).sort((a, b) => b.count - a.count),
    lists: { todayFollowups: todayList, overdueFollowups: overdueList, recent },
  });
}));

/**
 * Pipeline value drill-down: every open lead with a budget (biggest first, subtotal per stage)
 * + leads in Hot / Warm / Cold (stages flagged “needs budget”) that have no budget yet.
 */
router.get('/pipeline-value', asyncHandler(async (req, res) => {
  const L = await getLookups();
  const scope = { ...leadScope(req.user), isDeleted: false };
  const { closed } = stageSets(L);
  const needKeys = L.statuses.filter((s) => s.needsBudget && s.active).map((s) => s.key);
  const pick = 'leadId name phone company status budget service source assignedTo nextFollowUpAt createdAt';
  const [withValue, missing] = await Promise.all([
    M.Lead.find({ ...scope, status: { $nin: closed }, budget: { $gt: 0 } }).select(pick).sort({ budget: -1 }).limit(1000)
      .populate('service', 'label').populate('source', 'label').populate('assignedTo', 'name').lean(),
    M.Lead.find({ ...scope, status: { $in: needKeys }, budget: { $not: { $gt: 0 } } }).select(pick).sort({ updatedAt: -1 }).limit(1000)
      .populate('service', 'label').populate('source', 'label').populate('assignedTo', 'name').lean(),
  ]);
  const byStage = {};
  for (const l of withValue) {
    byStage[l.status] = byStage[l.status] || { count: 0, value: 0 };
    byStage[l.status].count += 1;
    byStage[l.status].value += l.budget;
  }
  res.json({
    total: withValue.reduce((a, l) => a + l.budget, 0),
    leads: withValue,
    byStage: L.statuses.filter((s) => byStage[s.key]).map((s) => ({ key: s.key, label: s.label, color: s.color, ...byStage[s.key] })),
    needBudget: missing,
    needBudgetStages: L.statuses.filter((s) => s.needsBudget && s.active).map((s) => ({ key: s.key, label: s.label, color: s.color, count: missing.filter((m) => m.status === s.key).length })),
  });
}));

module.exports = router;
