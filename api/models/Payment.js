const { Schema, model } = require('mongoose');

module.exports = model(
  'Payment',
  new Schema(
    {
      lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
      amount: { type: Number, required: true, min: 0 },
      paidAt: { type: Date, default: Date.now },
      method: { type: String, enum: ['upi', 'bank_transfer', 'cash', 'card', 'cheque', 'other'], default: 'upi' },
      reference: { type: String, default: '' },
      note: { type: String, default: '' },
      recordedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    },
    { timestamps: true }
  ),
  'payments'
);
