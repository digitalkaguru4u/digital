const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const M = require('../models');
const { PERMISSIONS } = require('../models/Role');
const { asyncHandler, HttpError } = require('../utils/http');
const { cleanText } = require('../utils/text');
const validate = require('../middleware/validate');
const { requirePermission } = require('../middleware/auth');
const { passwordSchema } = require('./auth');

const router = express.Router();
const oid = z.string().regex(/^[a-f0-9]{24}$/i);
const txt = (max) => z.preprocess((v) => cleanText(v), z.string().max(max));

// Active team members (for "Assign to" dropdowns) — any signed-in user
router.get('/team', asyncHandler(async (_req, res) => {
  const users = await M.User.find({ active: true }).select('name email role').populate('role', 'name key').sort({ name: 1 }).lean();
  res.json({ items: users });
}));

router.get('/', requirePermission('users:manage'), asyncHandler(async (_req, res) => {
  const users = await M.User.find().populate('role', 'name key').sort({ createdAt: 1 });
  res.json({ items: users });
}));

router.post('/', requirePermission('users:manage'),
  validate(z.object({ name: txt(80).pipe(z.string().min(2)), email: z.string().email().max(160), phone: txt(20).optional().default(''), role: oid, password: passwordSchema })),
  asyncHandler(async (req, res) => {
    const b = req.body;
    if (!(await M.Role.exists({ _id: b.role }))) throw new HttpError(422, 'Role not found');
    if (await M.User.exists({ email: b.email.toLowerCase() })) throw new HttpError(409, 'A user with this email already exists');
    const user = await M.User.create({ name: b.name, email: b.email, phone: b.phone, role: b.role, passwordHash: await bcrypt.hash(b.password, 12) });
    res.status(201).json({ user: await M.User.findById(user._id).populate('role', 'name key') });
  }));

router.patch('/:id', requirePermission('users:manage'),
  validate(z.object({ name: txt(80).pipe(z.string().min(2)), phone: txt(20), role: oid, active: z.boolean(), password: passwordSchema }).partial()),
  asyncHandler(async (req, res) => {
    const user = await M.User.findById(req.params.id).select('+tokenVersion').populate('role');
    if (!user) throw new HttpError(404, 'User not found');
    const b = req.body;
    const isSelf = String(user._id) === String(req.user._id);
    if (isSelf && (b.active === false || (b.role && String(b.role) !== String(user.role._id)))) {
      throw new HttpError(422, 'You cannot deactivate yourself or change your own role');
    }
    if (b.role) {
      const role = await M.Role.findById(b.role);
      if (!role) throw new HttpError(422, 'Role not found');
      user.role = role._id;
    }
    // Keep at least one active full admin
    if ((b.active === false || b.role) && user.role && user.populated('role') && user.role.permissions?.includes('*')) {
      const adminRoles = await M.Role.find({ permissions: '*' }).distinct('_id');
      const others = await M.User.countDocuments({ _id: { $ne: user._id }, active: true, role: { $in: adminRoles } });
      const staysAdmin = b.active !== false && (!b.role || adminRoles.some((r) => String(r) === String(b.role)));
      if (!others && !staysAdmin) throw new HttpError(422, 'At least one active administrator is required');
    }
    if (b.name) user.name = b.name;
    if (b.phone !== undefined) user.phone = b.phone;
    if (b.active !== undefined) { user.active = b.active; if (!b.active) user.tokenVersion += 1; }
    if (b.password) { user.passwordHash = await bcrypt.hash(b.password, 12); user.tokenVersion += 1; }
    await user.save();
    res.json({ user: await M.User.findById(user._id).populate('role', 'name key') });
  }));

/* ── Roles ── */
router.get('/roles/all', requirePermission('users:manage'), asyncHandler(async (_req, res) => {
  const roles = await M.Role.find().sort({ createdAt: 1 }).lean();
  const counts = await M.User.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }]);
  res.json({ items: roles.map((r) => ({ ...r, users: counts.find((c) => String(c._id) === String(r._id))?.n || 0 })), permissions: PERMISSIONS });
}));

const roleBody = z.object({
  name: txt(60).pipe(z.string().min(2)),
  key: z.string().regex(/^[a-z0-9_]{2,40}$/).optional(),
  description: txt(300).optional().default(''),
  permissions: z.array(z.enum(PERMISSIONS)).default([]),
});

router.post('/roles', requirePermission('users:manage'), validate(roleBody), asyncHandler(async (req, res) => {
  const key = req.body.key || req.body.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const role = await M.Role.create({ ...req.body, key });
  res.status(201).json({ role });
}));

router.patch('/roles/:id', requirePermission('users:manage'), validate(roleBody.partial()), asyncHandler(async (req, res) => {
  const role = await M.Role.findById(req.params.id);
  if (!role) throw new HttpError(404, 'Role not found');
  if (role.permissions.includes('*') && req.body.permissions) throw new HttpError(422, 'The Administrator role always has full access');
  if (req.body.name) role.name = req.body.name;
  if (req.body.description !== undefined) role.description = req.body.description;
  if (req.body.permissions) role.permissions = req.body.permissions;
  await role.save();
  res.json({ role });
}));

router.delete('/roles/:id', requirePermission('users:manage'), asyncHandler(async (req, res) => {
  const role = await M.Role.findById(req.params.id);
  if (!role) throw new HttpError(404, 'Role not found');
  if (role.isSystem) throw new HttpError(422, 'Built-in roles cannot be deleted');
  if (await M.User.exists({ role: role._id })) throw new HttpError(422, 'Move users to another role before deleting this one');
  await role.deleteOne();
  res.json({ ok: true });
}));

module.exports = router;
