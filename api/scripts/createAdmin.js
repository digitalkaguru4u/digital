/** Create or reset an admin: node api/scripts/createAdmin.js email@x.com "StrongPass1" "Full Name" */
const bcrypt = require('bcryptjs');
const { connectDB, mongoose } = require('../db');
const M = require('../models');

(async () => {
  const [email, password, name = 'Admin'] = process.argv.slice(2);
  if (!email || !password || password.length < 8) {
    console.log('Usage: npm run create-admin -- <email> <password(min 8)> [name]');
    process.exit(1);
  }
  await connectDB();
  const role = await M.Role.findOne({ key: 'admin' });
  if (!role) throw new Error('Run `npm run seed` first');
  const passwordHash = await bcrypt.hash(password, 12);
  await M.User.updateOne(
    { email: email.toLowerCase() },
    { $set: { passwordHash, role: role._id, active: true, name }, $inc: { tokenVersion: 1 } },
    { upsert: true }
  );
  console.log(`Admin ready: ${email}`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
