/**
 * Idempotent seed: roles, master data and the first admin user.
 *   npm run seed            → master data + admin
 *   npm run seed -- --demo  → also inserts sample leads (clearly tagged "[Demo]")
 */
const bcrypt = require('bcryptjs');
const config = require('./config');
const { connectDB, mongoose } = require('./db');
const M = require('./models');
const D = require('./seed-data');

async function upsertAll(model, rows, keyField) {
  let i = 0;
  for (const row of rows) {
    i += 1;
    const filter = keyField ? { [keyField]: row[keyField] } : { label: row.label };
    await model.updateOne(filter, { $setOnInsert: { order: i, active: true, ...row } }, { upsert: true });
  }
}

async function seedBase() {
  for (const r of D.roles) await M.Role.updateOne({ key: r.key }, { $setOnInsert: r }, { upsert: true });
  await upsertAll(M.PipelineStatus, D.statuses, 'key');
  await upsertAll(M.Service, D.services, 'slug');
  await upsertAll(M.LeadSource, D.sources, 'key');
  await upsertAll(M.LostReason, D.lostReasons);
  await upsertAll(M.FollowupType, D.followupTypes, 'key');

  const email = (process.env.ADMIN_EMAIL || 'admin@digitalguru.in').toLowerCase();
  if (!(await M.User.exists({ email }))) {
    const password = process.env.ADMIN_PASSWORD;
    if (!password && config.isProd) throw new Error('Set ADMIN_PASSWORD before seeding in production');
    const role = await M.Role.findOne({ key: 'admin' });
    await M.User.create({ name: process.env.ADMIN_NAME || 'Admin', email, role: role._id, passwordHash: await bcrypt.hash(password || 'ChangeMe@123', 12) });
    console.log(`[seed] admin user created: ${email}`);
  } else {
    console.log(`[seed] admin user exists: ${email}`);
  }
}

async function seedDemo() {
  const { captureWebsiteEnquiry, changeStatus } = require('./services/leadService');
  const { getLookups, invalidateLookups } = require('./services/lookups');
  invalidateLookups();
  const L = await getLookups(true);
  const admin = await M.User.findOne().sort({ createdAt: 1 });
  const names = ['Aarav Mehta', 'Priya Sharma', 'Rohan Iyer', 'Sneha Kulkarni', 'Vikram Rao', 'Ananya Gupta', 'Kabir Singh', 'Isha Patel', 'Arjun Nair', 'Meera Joshi', 'Dev Malhotra', 'Tanya Kapoor', 'Nikhil Verma', 'Riya Desai', 'Aditya Bose', 'Pooja Reddy', 'Siddharth Jain', 'Kavya Menon'];
  const utms = [{}, { source: 'google', medium: 'cpc', campaign: 'seo-services-mumbai' }, { source: 'facebook', medium: 'paid_social', campaign: 'website-offer-sept' }, { source: 'instagram', medium: 'social' }, {}, { source: 'google', medium: 'cpc', campaign: 'google-ads-management' }];
  const forms = ['hero', 'contact', 'popup', 'service', 'whatsapp_quick'];
  const stages = ['CONTACTED', 'RINGING', 'WARM', 'HOT', 'PROPOSAL_SENT', 'BOOKED', 'LOST', 'COLD', 'NEW', 'WARM', 'HOT', 'COLD'];
  const amounts = [null, 15000, 25000, null, 45000, 60000, 12000, null, 30000, null, 80000, 20000];
  let n = 0;
  for (const name of names) {
    n += 1;
    const svc = L.services[n % L.services.length];
    const { lead } = await captureWebsiteEnquiry({
      name: `[Demo] ${name}`, phone: `+91 90000 ${String(10000 + n * 137).slice(-5)}`, email: `demo${n}@example.com`,
      company: `${name.split(' ')[1]} Enterprises`, service: svc.slug, budget: amounts[n % amounts.length] ? String(amounts[n % amounts.length]) : '',
      message: `Looking for help with ${svc.label.toLowerCase()}.`,
      preferredContact: ['call', 'whatsapp', 'email'][n % 3], formUsed: forms[n % forms.length], pageUrl: `${config.siteUrl}/services/${svc.slug}`,
      landingPage: `${config.siteUrl}/`, referrer: n % 4 === 0 ? 'https://www.google.com/' : '', utm: utms[n % utms.length], silent: true,
    }, { ip: '127.0.0.1', userAgent: 'seed' });
    // backdate to spread across the last 30 days (createdAt is immutable in Mongoose → raw driver)
    const created = new Date(Date.now() - ((n * 37) % 30) * 86400000 - n * 3600000);
    await M.Lead.collection.updateOne({ _id: lead._id }, { $set: { createdAt: created, lastEnquiryAt: created, assignedTo: admin._id } });
    await M.LeadActivity.collection.updateMany({ lead: lead._id }, { $set: { createdAt: created } });
    await M.Enquiry.collection.updateMany({ lead: lead._id }, { $set: { createdAt: created } });
    const status = stages[n % stages.length];
    const doc = await M.Lead.findById(lead._id);
    if (status !== 'NEW') await changeStatus(doc, status, { user: admin, lostReason: L.lostReasons[n % L.lostReasons.length]._id, silent: true });
    if (status === 'BOOKED') {
      doc.booking.finalBudget = doc.budget || 40000;
      doc.booking.paymentStatus = 'advance_received';
      await doc.save();
    }
    if (['CONTACTED', 'HOT', 'WARM', 'PROPOSAL_SENT', 'RINGING', 'COLD'].includes(status)) {
      const offsetDays = [-2, 0, 0, 1, 3, -1][n % 6];
      const due = new Date(Date.now() + offsetDays * 86400000);
      due.setUTCHours(6 + (n % 6), 0, 0, 0);
      await M.Followup.create({ lead: doc._id, dueAt: due, type: ['call', 'whatsapp', 'email', 'meeting', 'proposal', 'task'][n % 6], assignedTo: admin._id, priority: ['medium', 'high', 'low'][n % 3], notes: 'Discuss requirements and share proposal', createdBy: admin._id, reminderSentAt: new Date() });
      await M.Lead.updateOne({ _id: doc._id }, { $set: { nextFollowUpAt: due } });
    }
  }
  console.log(`[seed] ${names.length} demo leads inserted`);
}

(async () => {
  await connectDB();
  await seedBase();
  await require('./migrate').migrate();
  if (process.argv.includes('--demo')) {
    if (await M.Lead.exists({ name: /^\[Demo\]/ })) console.log('[seed] demo leads already present — skipped');
    else await seedDemo();
  }
  await mongoose.disconnect();
  console.log('[seed] done');
})().catch(async (e) => {
  console.error(e);
  await mongoose.disconnect();
  process.exit(1);
});
