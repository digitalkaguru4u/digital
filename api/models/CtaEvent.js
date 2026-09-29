const { Schema, model } = require('mongoose');

/**
 * Anonymous click events for CTAs that cannot identify a visitor
 * (tap-to-call, WhatsApp opened without the quick form).
 */
module.exports = model(
  'CtaEvent',
  new Schema(
    {
      cta: { type: String, enum: ['call', 'whatsapp', 'quote_open', 'email'], required: true },
      pageUrl: String,
      utm: { type: Schema.Types.Mixed, default: {} },
      source: String,
    },
    { timestamps: { createdAt: true, updatedAt: false } }
  ),
  'cta_events'
);
