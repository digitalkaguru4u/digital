const { Schema, model } = require('mongoose');

/**
 * Immutable lead timeline. Entries are only ever appended — never updated
 * or deleted when the lead changes (deleting a lead soft-deletes it).
 */
const ACTIVITY_TYPES = [
  'lead_created', 'enquiry', 'status_changed', 'temperature_changed', 'budget_changed',
  'assigned', 'note_added', 'followup_scheduled', 'followup_completed', 'followup_rescheduled',
  'followup_cancelled', 'call', 'whatsapp', 'email', 'task_created', 'task_updated',
  'booking_updated', 'payment_added', 'lead_updated', 'lead_deleted', 'lead_restored', 'lost',
];

const activitySchema = new Schema(
  {
    lead: { type: Schema.Types.ObjectId, ref: 'Lead', required: true, index: true },
    type: { type: String, enum: ACTIVITY_TYPES, required: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    meta: { type: Schema.Types.Mixed, default: {} },
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null = system / website
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = model('LeadActivity', activitySchema, 'lead_activities');
module.exports.ACTIVITY_TYPES = ACTIVITY_TYPES;
