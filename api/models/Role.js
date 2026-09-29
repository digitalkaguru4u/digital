const { Schema, model } = require('mongoose');

// Permission keys used across the API. '*' = everything.
const PERMISSIONS = [
  'dashboard:view',
  'leads:view_all',      // see every lead (otherwise only leads assigned to self)
  'leads:create',
  'leads:edit',
  'leads:delete',
  'leads:assign',
  'leads:export',
  'followups:manage',
  'settings:manage',
  'users:manage',
];

const roleSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true, default: '' },
    permissions: [{ type: String }],
    isSystem: { type: Boolean, default: false },
  },
  { timestamps: true }
);

roleSchema.methods.can = function can(perm) {
  return this.permissions.includes('*') || this.permissions.includes(perm);
};

module.exports = model('Role', roleSchema);
module.exports.PERMISSIONS = PERMISSIONS;
