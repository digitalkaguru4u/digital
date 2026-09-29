const { Schema, model } = require('mongoose');

/** In-app notification history (the CRM bell). Push is sent for the same events. */
const NOTIFICATION_TYPES = [
  'new_lead', 'repeat_enquiry', 'meta_lead', 'assigned', 'followup_reminder', 'task_due',
  'booked', 'payment', 'lost', 'import', 'daily_digest', 'test', 'integration_error',
];

const Notification = model(
  'Notification',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      type: { type: String, enum: NOTIFICATION_TYPES, required: true },
      title: { type: String, required: true },
      body: { type: String, default: '' },
      url: { type: String, default: '' }, // path inside the admin, e.g. /leads/<id>
      lead: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
      readAt: { type: Date, default: null },
    },
    { timestamps: { createdAt: true, updatedAt: false } }
  ),
  'notifications'
);

const PushSubscription = model(
  'PushSubscription',
  new Schema(
    {
      user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
      endpoint: { type: String, required: true, unique: true },
      keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
      userAgent: { type: String, default: '' },
      lastSuccessAt: { type: Date, default: null },
    },
    { timestamps: true }
  ),
  'push_subscriptions'
);

/** Every Meta lead we have seen (by leadgen id) — makes webhook + polling idempotent. */
const MetaLead = model(
  'MetaLead',
  new Schema(
    {
      leadgenId: { type: String, required: true, unique: true },
      pageId: String,
      formId: String,
      formName: String,
      adId: String,
      campaignName: String,
      via: { type: String, enum: ['webhook', 'sync', 'test'], default: 'webhook' },
      status: { type: String, enum: ['pending', 'processed', 'merged', 'error'], default: 'pending' },
      error: { type: String, default: '' },
      lead: { type: Schema.Types.ObjectId, ref: 'Lead', default: null },
      metaCreatedAt: Date,
      attempts: { type: Number, default: 0 },
    },
    { timestamps: true }
  ),
  'meta_leads'
);

module.exports = { Notification, PushSubscription, MetaLead, NOTIFICATION_TYPES };
