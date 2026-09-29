const { Schema, model } = require('mongoose');

/** Every form submission is kept, even when it is merged into an existing lead. */
module.exports = model(
  'Enquiry',
  new Schema(
    {
      lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
      name: String,
      phone: String,
      email: String,
      company: String,
      service: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
      budgetLabel: String,
      message: String,
      preferredContact: String,
      formUsed: String,
      pageUrl: String,
      landingPage: String,
      referrer: String,
      source: { type: Schema.Types.ObjectId, ref: 'LeadSource', default: null },
      utm: { type: Schema.Types.Mixed, default: {} },
      ip: String,
      userAgent: String,
      merged: { type: Boolean, default: false }, // true = matched an existing lead
    },
    { timestamps: { createdAt: true, updatedAt: false } }
  ),
  'enquiries'
);
