const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    passwordHash: { type: String, required: true, select: false },
    role: { type: Schema.Types.ObjectId, ref: 'Role', required: true },
    active: { type: Boolean, default: true },
    // Incremented on logout-everywhere / password change → invalidates old sessions
    tokenVersion: { type: Number, default: 0, select: false },
    resetTokenHash: { type: String, select: false },
    resetTokenExpires: { type: Date, select: false },
    lastLoginAt: Date,
    notificationsSeenAt: { type: Date, default: Date.now },
    // Which events send a browser push to this user (in-app history is always kept)
    notifyPrefs: {
      newLead: { type: Boolean, default: true },
      repeatEnquiry: { type: Boolean, default: true },
      assigned: { type: Boolean, default: true },
      followupReminder: { type: Boolean, default: true },
      booked: { type: Boolean, default: true },
      payment: { type: Boolean, default: true },
      lost: { type: Boolean, default: false },
      import: { type: Boolean, default: true },
      dailyDigest: { type: Boolean, default: true },
      integration: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.tokenVersion;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpires;
    delete ret.__v;
    return ret;
  },
});

module.exports = model('User', userSchema);
