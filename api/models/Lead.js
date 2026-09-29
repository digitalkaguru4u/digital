const { Schema, model } = require('mongoose');

/** Budget as a number: accepts numbers and legacy { customAmount, estimate, max, min } objects. */
function budgetAmount(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'object') v = v.customAmount || v.estimate || v.max || v.min || null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

const utmSchema = new Schema(
  { source: String, medium: String, campaign: String, content: String, term: String, gclid: String, fbclid: String },
  { _id: false }
);

const bookingSchema = new Schema(
  {
    serviceBooked: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
    finalBudget: { type: Number, default: null },
    bookingDate: { type: Date, default: null },
    paymentStatus: {
      type: String,
      enum: ['pending', 'advance_received', 'partially_paid', 'fully_paid'],
      default: 'pending',
    },
    projectStartDate: { type: Date, default: null },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '' },
  },
  { _id: false }
);

const leadSchema = new Schema(
  {
    leadId: { type: String, required: true, unique: true }, // DG-000001
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, default: '' },
    phoneNormalized: { type: String, default: '', index: true }, // last 10 digits
    email: { type: String, trim: true, lowercase: true, default: '' },
    company: { type: String, trim: true, default: '' },
    service: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
    source: { type: Schema.Types.ObjectId, ref: 'LeadSource', default: null },
    campaign: { type: Schema.Types.ObjectId, ref: 'Campaign', default: null },
    utm: { type: utmSchema, default: () => ({}) },
    landingPage: { type: String, default: '' }, // first-touch landing page
    referrer: { type: String, default: '' },
    formUsed: { type: String, default: '' },
    message: { type: String, default: '', maxlength: 5000 },
    preferredContact: { type: String, enum: ['', 'call', 'whatsapp', 'email'], default: '' },
    // Expected deal value in ₹, typed by the team (null = not set yet)
    budget: { type: Number, default: null, min: 0, set: budgetAmount },

    status: { type: String, default: 'NEW', index: true }, // PipelineStatus.key
    statusChangedAt: { type: Date, default: Date.now },
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    lastContactedAt: { type: Date, default: null },
    nextFollowUpAt: { type: Date, default: null, index: true }, // earliest pending follow-up
    lostReason: { type: Schema.Types.ObjectId, ref: 'LostReason', default: null },
    lostReasonText: { type: String, default: '' },
    lostAt: { type: Date, default: null },

    booking: { type: bookingSchema, default: null },
    enquiryCount: { type: Number, default: 1 },
    lastEnquiryAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }, // null = website
  },
  { timestamps: true }
);

// Older versions stored budget as an object — read it as a plain amount so saves never fail.
leadSchema.pre('init', (raw) => {
  if (raw && raw.budget !== null && typeof raw.budget === 'object') raw.budget = budgetAmount(raw.budget);
});

// …and the same for .lean() queries (lists, dashboards, populated leads)
function normalizeLean(res) {
  const fix = (d) => { if (d && d.budget !== null && typeof d.budget === 'object' && !(d.budget instanceof Number)) d.budget = budgetAmount(d.budget); };
  if (Array.isArray(res)) res.forEach(fix); else fix(res);
}
leadSchema.post(['find', 'findOne', 'findOneAndUpdate'], function post(res) { if (this._mongooseOptions?.lean) normalizeLean(res); });

leadSchema.index({ email: 1 });
leadSchema.index({ createdAt: -1 });
leadSchema.index({ status: 1, budget: 1 });

module.exports = model('Lead', leadSchema);
module.exports.budgetAmount = budgetAmount;
