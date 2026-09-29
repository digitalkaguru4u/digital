const { Schema, model } = require('mongoose');

module.exports = model(
  'Communication',
  new Schema(
    {
      lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
      channel: { type: String, enum: ['call', 'whatsapp', 'email', 'sms', 'meeting'], required: true },
      direction: { type: String, enum: ['outbound', 'inbound'], default: 'outbound' },
      subject: { type: String, default: '' },
      message: { type: String, default: '', maxlength: 5000 },
      outcome: { type: String, default: '' }, // e.g. connected, no_answer, busy, replied
      user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
  ),
  'communications'
);
