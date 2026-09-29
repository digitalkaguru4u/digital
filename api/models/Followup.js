const { Schema, model } = require('mongoose');

module.exports = model(
  'Followup',
  new Schema(
    {
      lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
      dueAt: { type: Date, required: true, index: true },
      type: { type: String, required: true }, // FollowupType.key
      assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },
      priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
      reminderMinutes: { type: Number, default: 15 }, // 0 = no reminder
      notes: { type: String, default: '', maxlength: 3000 },
      status: { type: String, enum: ['pending', 'completed', 'cancelled'], default: 'pending', index: true },
      completedAt: { type: Date, default: null },
      completedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      outcome: { type: String, default: '', maxlength: 3000 },
      rescheduledFrom: { type: Date, default: null },
      rescheduleCount: { type: Number, default: 0 },
      createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      reminderSentAt: { type: Date, default: null }, // push/in-app reminder already sent
    },
    { timestamps: true }
  ),
  'followups'
);
