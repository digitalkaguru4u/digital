/**
 * v2 simplification migration — safe to run many times (`npm run migrate`, also run by `npm run seed`).
 *  - Stages: NOT_INTERESTED + CLOSED → LOST, FOLLOW_UP → CONTACTED; those stage records removed; NEW labelled “Open”
 *  - Temperature removed (a lead with a temperature and an early stage moves to that Hot/Warm/Cold stage)
 *  - Budget ranges removed → budget is a single ₹ amount
 *  - Tasks folded into follow-ups (type “Task / to-do”)
 *  - Role permission tasks:manage removed
 *  - Meta access token removed from the database (env var META_PAGE_ACCESS_TOKEN only)
 */
const { mongoose } = require('./db');

async function migrate({ log = console.log } = {}) {
  const db = mongoose.connection.db;
  const col = (n) => db.collection(n);
  const done = [];

  // 1) stages
  const lostReason = await col('lost_reasons').findOne({ label: /other/i });
  const moveToLost = await col('leads').updateMany({ status: { $in: ['NOT_INTERESTED', 'CLOSED'] } }, { $set: { status: 'LOST' } });
  await col('leads').updateMany({ status: 'LOST', lostReason: null }, { $set: { lostReason: lostReason?._id || null, lostReasonText: 'Migrated' } });
  const fu = await col('leads').updateMany({ status: 'FOLLOW_UP' }, { $set: { status: 'CONTACTED' } });
  if (moveToLost.modifiedCount || fu.modifiedCount) done.push(`${moveToLost.modifiedCount} lead(s) → Lost, ${fu.modifiedCount} Follow-up → Contacted`);
  await col('pipeline_statuses').deleteMany({ key: { $in: ['NOT_INTERESTED', 'CLOSED', 'FOLLOW_UP'] } });
  await col('pipeline_statuses').updateOne({ key: 'NEW', label: 'New' }, { $set: { label: 'Open' } });
  // only when the flag has never been set, so unticking it in Settings sticks
  await col('pipeline_statuses').updateMany({ key: { $in: ['HOT', 'WARM', 'COLD'] }, needsBudget: { $exists: false } }, { $set: { needsBudget: true } });
  await col('pipeline_statuses').updateMany({ key: 'RINGING', label: 'Ring / No Response' }, { $set: { label: 'Ringing' } });
  await col('pipeline_statuses').updateMany({}, { $unset: { isClosed: '' } });

  // 2) temperature → stage (only for leads still at an early stage), then drop the field
  const temps = await col('leads').find({ temperature: { $in: ['HOT', 'WARM', 'COLD'] } }).project({ _id: 1, status: 1, temperature: 1 }).toArray();
  let tMoved = 0;
  for (const l of temps) {
    if (['NEW', 'CONTACTED', 'RINGING'].includes(l.status)) { await col('leads').updateOne({ _id: l._id }, { $set: { status: l.temperature } }); tMoved += 1; }
  }
  const tUnset = await col('leads').updateMany({ temperature: { $exists: true } }, { $unset: { temperature: '' } });
  if (tUnset.modifiedCount) done.push(`temperature removed from ${tUnset.modifiedCount} lead(s) (${tMoved} moved to Hot/Warm/Cold stage)`);

  // 3) budget object → amount
  const withObj = await col('leads').find({ 'budget.type': { $exists: true } }).project({ _id: 1, budget: 1 }).toArray();
  for (const l of withObj) {
    const b = l.budget || {};
    const amount = b.customAmount || b.estimate || b.max || b.min || null;
    await col('leads').updateOne({ _id: l._id }, { $set: { budget: amount || null } });
  }
  if (withObj.length) done.push(`${withObj.length} budget(s) converted to amounts`);

  // 4) tasks → follow-ups
  const hasTasks = (await db.listCollections({ name: 'tasks' }).toArray()).length > 0;
  if (hasTasks) {
    const tasks = await col('tasks').find({ migratedToFollowup: { $ne: true }, lead: { $ne: null }, status: { $ne: 'cancelled' } }).toArray();
    for (const t of tasks) {
      await col('followups').insertOne({
        lead: t.lead, dueAt: t.dueAt || t.createdAt || new Date(), type: 'task', assignedTo: t.assignedTo || null, priority: t.priority || 'medium',
        reminderMinutes: 15, notes: [t.title, t.description].filter(Boolean).join(' — '),
        status: t.status === 'completed' ? 'completed' : 'pending', completedAt: t.completedAt || null, outcome: t.status === 'completed' ? 'Done' : '',
        rescheduleCount: 0, createdBy: t.createdBy || null, reminderSentAt: t.reminderSentAt || null, createdAt: t.createdAt || new Date(), updatedAt: new Date(),
      });
      await col('tasks').updateOne({ _id: t._id }, { $set: { migratedToFollowup: true } });
    }
    if (tasks.length) done.push(`${tasks.length} task(s) moved into follow-ups`);
    // refresh next follow-up on affected leads
    for (const leadId of [...new Set(tasks.map((t) => String(t.lead)))]) {
      const next = await col('followups').find({ lead: new mongoose.Types.ObjectId(leadId), status: 'pending' }).sort({ dueAt: 1 }).limit(1).toArray();
      await col('leads').updateOne({ _id: new mongoose.Types.ObjectId(leadId) }, { $set: { nextFollowUpAt: next[0]?.dueAt || null } });
    }
  }
  if (!(await col('followup_types').findOne({ key: 'task' }))) {
    const n = await col('followup_types').countDocuments();
    await col('followup_types').insertOne({ key: 'task', label: 'Task / to-do', order: n + 1, active: true, createdAt: new Date(), updatedAt: new Date() });
  }

  // 5) permissions + prefs
  await col('roles').updateMany({ permissions: 'tasks:manage' }, { $pull: { permissions: 'tasks:manage' } });
  await col('users').updateMany({ 'notifyPrefs.taskDue': { $exists: true } }, { $unset: { 'notifyPrefs.taskDue': '' } });

  // 6) Meta token lives only in META_PAGE_ACCESS_TOKEN (env). An older build let admins save it in
  //    the database, where it overrode the env var — remove it (the value is never printed).
  const metaTok = await col('app_settings').updateOne(
    { key: 'meta', 'value.pageAccessToken': { $exists: true } },
    { $unset: { 'value.pageAccessToken': '' } },
  );
  if (metaTok.modifiedCount) done.push('removed the Meta access token stored in the database — META_PAGE_ACCESS_TOKEN (env) is now the only source');

  log(done.length ? `[migrate] ${done.join('; ')}` : '[migrate] nothing to change');
  return done;
}

module.exports = { migrate };

if (require.main === module) {
  const { connectDB } = require('./db');
  connectDB().then(() => migrate()).then(() => mongoose.disconnect()).catch(async (e) => { console.error(e); await mongoose.disconnect(); process.exit(1); });
}
