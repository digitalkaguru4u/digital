const { Schema, model } = require('mongoose');

module.exports = model(
  'LeadNote',
  new Schema(
    {
      lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
      text: { type: String, required: true, maxlength: 5000 },
      createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    },
    { timestamps: true }
  ),
  'lead_notes'
);
