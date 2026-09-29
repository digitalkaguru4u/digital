/**
 * Safe Meta diagnostics — run in Render → Shell:  npm run meta:check
 * Checks META_PAGE_ID / META_PAGE_ACCESS_TOKEN against Meta (token → Page → lead forms → leads)
 * and prints the result. Never prints the token (only a 4-character prefix).
 */
require('../config'); // loads .env locally; on Render the env vars are already set
const { connectDB, mongoose } = require('../db');
const { logMetaStartup } = require('../services/metaConfig');
const client = require('../services/metaClient');

(async () => {
  logMetaStartup();
  await connectDB();
  const r = await client.validateAuth({ record: false });
  console.log(client.summarize(r));
  if (r.problem) console.log(`  → fix: ${r.problem.hint}`);
  console.log(JSON.stringify(r, null, 2));
  await mongoose.disconnect();
  process.exit(r.ok ? 0 : 2);
})().catch(async (e) => { console.error('[META] check failed:', require('../services/metaConfig').redact(e.message)); process.exit(1); });
