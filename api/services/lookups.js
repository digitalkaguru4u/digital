const M = require('../models');

/** Small in-process cache of master data; invalidated whenever Settings change. */
let cache = null;
let cachedAt = 0;
const TTL = 60 * 1000;

async function getLookups(force = false) {
  if (!force && cache && Date.now() - cachedAt < TTL) return cache;
  const [statuses, services, sources, lostReasons, followupTypes] = await Promise.all([
    M.PipelineStatus.find().sort({ order: 1 }).lean(),
    M.Service.find().sort({ order: 1 }).lean(),
    M.LeadSource.find().sort({ order: 1 }).lean(),
    M.LostReason.find().sort({ order: 1 }).lean(),
    M.FollowupType.find().sort({ order: 1 }).lean(),
  ]);
  cache = { statuses, services, sources, lostReasons, followupTypes };
  cachedAt = Date.now();
  return cache;
}

function invalidateLookups() {
  cache = null;
}

async function getSetting(key, fallback) {
  const s = await M.AppSetting.findOne({ key }).lean();
  return s ? s.value : fallback;
}

module.exports = { getLookups, invalidateLookups, getSetting };
