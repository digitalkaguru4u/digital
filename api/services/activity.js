const { LeadActivity } = require('../models');

/** Append an entry to a lead's timeline. */
function logActivity(leadId, type, title, { description = '', meta = {}, user = null } = {}) {
  return LeadActivity.create({ lead: leadId, type, title, description, meta, user: user?._id || user || null });
}

module.exports = { logActivity };
