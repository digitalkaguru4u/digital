/**
 * Notifications: every event is stored in the in-app history (CRM bell) and,
 * if the user allows that event type, sent as a browser push to all their devices.
 */
const webpush = require('web-push');
const M = require('../models');
const config = require('../config');

const PREF_FOR_TYPE = {
  new_lead: 'newLead', meta_lead: 'newLead', repeat_enquiry: 'repeatEnquiry', assigned: 'assigned',
  followup_reminder: 'followupReminder', booked: 'booked', payment: 'payment',
  lost: 'lost', import: 'import', daily_digest: 'dailyDigest', integration_error: 'integration', test: null,
};

/* ───────── VAPID keys: env first, else generated once and kept in the DB ───────── */
let vapid = null;
async function getVapid() {
  if (vapid) return vapid;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapid = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
  } else {
    const row = await M.AppSetting.findOne({ key: 'vapid' }).lean();
    if (row?.value?.publicKey) vapid = row.value;
    else {
      const keys = webpush.generateVAPIDKeys();
      // upsert with $setOnInsert so two processes starting together agree on one key pair
      await M.AppSetting.updateOne({ key: 'vapid' }, { $setOnInsert: { value: keys } }, { upsert: true });
      vapid = (await M.AppSetting.findOne({ key: 'vapid' }).lean()).value;
    }
  }
  const subject = process.env.VAPID_SUBJECT || `mailto:${config.business.email}`;
  webpush.setVapidDetails(subject, vapid.publicKey, vapid.privateKey);
  return vapid;
}

async function sendPush(userIds, payload) {
  if (!userIds.length) return { sent: 0 };
  await getVapid();
  const subs = await M.PushSubscription.find({ user: { $in: userIds } }).lean();
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: 'high' });
      sent += 1;
      await M.PushSubscription.updateOne({ _id: s._id }, { $set: { lastSuccessAt: new Date() } });
    } catch (e) {
      // 404/410 = the browser unsubscribed or the subscription expired → forget it
      if (e.statusCode === 404 || e.statusCode === 410) await M.PushSubscription.deleteOne({ _id: s._id });
      else console.error('[push] failed:', e.statusCode || '', e.body || e.message);
    }
  }));
  return { sent };
}

/** Users who should hear about a lead: everyone who sees all leads + the lead owner. */
async function leadAudience(lead) {
  const roles = await M.Role.find({ $or: [{ permissions: '*' }, { permissions: 'leads:view_all' }] }).distinct('_id');
  const users = await M.User.find({ active: true, role: { $in: roles } }).distinct('_id');
  const ids = new Set(users.map(String));
  if (lead?.assignedTo) ids.add(String(lead.assignedTo._id || lead.assignedTo));
  return [...ids];
}

async function admins() {
  const roles = await M.Role.find({ permissions: '*' }).distinct('_id');
  return (await M.User.find({ active: true, role: { $in: roles } }).distinct('_id')).map(String);
}

/**
 * notify({ users, type, title, body, url, lead, exclude })
 * users: array of user ids. exclude: user id who caused the event (no self-notifications).
 */
async function notify({ users, type, title, body = '', url = '', lead = null, exclude = null }) {
  try {
    const ids = [...new Set((users || []).map(String))].filter((id) => !exclude || id !== String(exclude._id || exclude));
    if (!ids.length) return;
    await M.Notification.insertMany(ids.map((user) => ({ user, type, title, body, url, lead: lead?._id || lead || null })));
    const prefKey = PREF_FOR_TYPE[type];
    const allowed = prefKey === null
      ? ids
      : (await M.User.find({ _id: { $in: ids }, active: true }).select('notifyPrefs').lean())
        .filter((u) => u.notifyPrefs?.[prefKey] !== false).map((u) => String(u._id));
    await sendPush(allowed, { title, body, url: `/admin${url || '/'}`, tag: `${type}:${lead?._id || lead || Date.now()}`, type });
  } catch (e) {
    console.error('[notify] failed:', e.message);
  }
}

module.exports = { notify, leadAudience, admins, getVapid, sendPush, PREF_FOR_TYPE };
