/**
 * Admin-manageable master data. Each list lives in its own collection so
 * values can be changed from Settings without touching source code.
 */
const { Schema, model } = require('mongoose');

const base = {
  label: { type: String, required: true, trim: true, maxlength: 80 },
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
};
const opts = { timestamps: true };

const PipelineStatus = model(
  'PipelineStatus',
  new Schema(
    {
      ...base,
      key: { type: String, required: true, unique: true, uppercase: true, trim: true },
      color: { type: String, default: '#807CB0' },
      showOnBoard: { type: Boolean, default: true },
      // behaviour flags (drive workflow logic, not the label)
      requiresReason: { type: Boolean, default: false }, // NOT INTERESTED / LOST
      isBooked: { type: Boolean, default: false }, // opens booking details
      isWon: { type: Boolean, default: false }, // counts as converted
      isLost: { type: Boolean, default: false },
      needsBudget: { type: Boolean, default: false }, // listed in “needs budget” when no amount is set
      isSystem: { type: Boolean, default: false }, // cannot be deleted (NEW)
    },
    opts
  ),
  'pipeline_statuses'
);

const Service = model(
  'Service',
  new Schema({ ...base, slug: { type: String, required: true, unique: true, lowercase: true, trim: true } }, opts),
  'services'
);

const LeadSource = model(
  'LeadSource',
  new Schema(
    { ...base, key: { type: String, required: true, unique: true, lowercase: true, trim: true } },
    opts
  ),
  'lead_sources'
);

const LostReason = model('LostReason', new Schema({ ...base }, opts), 'lost_reasons');

const FollowupType = model(
  'FollowupType',
  new Schema(
    { ...base, key: { type: String, required: true, unique: true, lowercase: true, trim: true } },
    opts
  ),
  'followup_types'
);

const Campaign = model(
  'Campaign',
  new Schema(
    {
      name: { type: String, required: true, trim: true },
      key: { type: String, required: true, unique: true }, // source|medium|campaign (lowercased)
      utmSource: { type: String, default: '' },
      utmMedium: { type: String, default: '' },
      utmCampaign: { type: String, default: '' },
      active: { type: Boolean, default: true },
    },
    opts
  ),
  'campaigns'
);

// Key/value app settings (reminder defaults, WhatsApp template…)
const AppSetting = model(
  'AppSetting',
  new Schema({ key: { type: String, required: true, unique: true }, value: Schema.Types.Mixed }, opts),
  'app_settings'
);

module.exports = {
  PipelineStatus,
  Service,
  LeadSource,
  LostReason,
  FollowupType,
  Campaign,
  AppSetting,
};
