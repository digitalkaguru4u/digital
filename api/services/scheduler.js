/**
 * Background jobs (run inside the web process, once a minute):
 *  - follow-up reminders (at dueAt − reminderMinutes)
 *  - daily morning digest (09:30 business time)
 *  - Meta Lead Ads auto-sync (see services/meta.js)
 * Each item is claimed with an atomic update, so running two app instances won't double-send.
 */
const { DateTime } = require('luxon');
const M = require('../models');
const { TZ, todayBounds } = require('../utils/dates');
const { notify, admins } = require('./notify');

const fmt = (d) => DateTime.fromJSDate(d).setZone(TZ).toFormat('h:mm a');

async function followupReminders() {
  const now = Date.now();
  const candidates = await M.Followup.find({
    status: 'pending', reminderSentAt: null, reminderMinutes: { $gt: 0 },
    dueAt: { $lte: new Date(now + 7 * 24 * 3600 * 1000), $gte: new Date(now - 24 * 3600 * 1000) },
  }).limit(200).lean();
  const types = Object.fromEntries((await M.FollowupType.find().lean()).map((t) => [t.key, t.label]));
  for (const f of candidates) {
    if (new Date(f.dueAt).getTime() - f.reminderMinutes * 60000 > now) continue;
    const claimed = await M.Followup.findOneAndUpdate({ _id: f._id, reminderSentAt: null }, { $set: { reminderSentAt: new Date() } });
    if (!claimed) continue;
    const lead = await M.Lead.findById(f.lead).select('name leadId phone isDeleted').lean();
    if (!lead || lead.isDeleted) continue;
    const users = f.assignedTo ? [f.assignedTo] : await admins();
    const overdue = new Date(f.dueAt).getTime() < now;
    await notify({
      users, type: 'followup_reminder', lead: f.lead,
      title: `${overdue ? 'Overdue' : 'Follow-up'}: ${types[f.type] || f.type} ${lead.name}`,
      body: `${overdue ? 'Was due' : 'Due'} at ${fmt(f.dueAt)}${lead.phone ? ` · ${lead.phone}` : ''}${f.notes ? ` — ${f.notes.slice(0, 80)}` : ''}`,
      url: `/leads/${f.lead}`,
    });
  }
}

async function dailyDigest() {
  const now = DateTime.now().setZone(TZ);
  if (now.hour < 9 || (now.hour === 9 && now.minute < 30)) return;
  const today = now.toFormat('yyyy-LL-dd');
  const claimed = await M.AppSetting.findOneAndUpdate(
    { key: 'lastDigest', value: { $ne: today } }, { $set: { value: today } }, { upsert: false }
  );
  if (!claimed) {
    // first run ever: create the row (only one process wins because key is unique)
    const exists = await M.AppSetting.exists({ key: 'lastDigest' });
    if (exists) return;
    try { await M.AppSetting.create({ key: 'lastDigest', value: today }); } catch { return; }
  }
  const { start, end } = todayBounds();
  const users = await M.User.find({ active: true }).populate('role').lean();
  const yStart = new Date(start.getTime() - 86400000);
  const newYesterday = await M.Lead.countDocuments({ isDeleted: false, createdAt: { $gte: yStart, $lt: start } });
  for (const u of users) {
    const all = u.role?.permissions?.includes('*') || u.role?.permissions?.includes('leads:view_all');
    const scope = all ? {} : { assignedTo: u._id };
    const [dueToday, overdue] = await Promise.all([
      M.Followup.countDocuments({ ...scope, status: 'pending', dueAt: { $gte: start, $lt: end } }),
      M.Followup.countDocuments({ ...scope, status: 'pending', dueAt: { $lt: start } }),
    ]);
    if (!dueToday && !overdue && !(all && newYesterday)) continue;
    await notify({
      users: [u._id], type: 'daily_digest',
      title: `Good morning ${u.name.split(' ')[0]} — today’s plan`,
      body: [`${dueToday} follow-up${dueToday === 1 ? '' : 's'} today`, overdue && `${overdue} overdue`, all && `${newYesterday} new lead${newYesterday === 1 ? '' : 's'} yesterday`].filter(Boolean).join(' · '),
      url: '/followups?bucket=today',
    });
  }
}

let timer = null;
let running = false;
function startScheduler({ intervalMs = Number(process.env.SCHEDULER_INTERVAL_MS) || 60000 } = {}) {
  if (timer || process.env.DISABLE_SCHEDULER === '1') return;
  const { metaAutoSync } = require('./meta');
  const tick = async () => {
    if (running) return;
    running = true;
    for (const job of [followupReminders, dailyDigest, metaAutoSync]) {
      try { await job(); } catch (e) { console.error(`[scheduler] ${job.name}:`, e.message); }
    }
    running = false;
  };
  timer = setInterval(tick, intervalMs);
  setTimeout(tick, Math.min(5000, intervalMs));
  console.log('[scheduler] started');
}

module.exports = { startScheduler, followupReminders, dailyDigest };
