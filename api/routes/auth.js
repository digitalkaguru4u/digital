const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const { User } = require('../models');
const { asyncHandler, HttpError } = require('../utils/http');
const validate = require('../middleware/validate');
const { requireAuth, signSession, setSessionCookie, clearSessionCookie } = require('../middleware/auth');
const { issueCsrf } = require('../middleware/csrf');
const { sendMail, mailEnabled } = require('../services/mailer');

const router = express.Router();
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again in 15 minutes.' } });
const forgotLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many reset requests. Try again later.' } });

const password = z.string().min(8, 'Password must be at least 8 characters').max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter').regex(/[0-9]/, 'Password must contain a number');

const publicUser = (u) => ({
  id: u._id, name: u.name, email: u.email, phone: u.phone,
  role: u.role ? { id: u.role._id, key: u.role.key, name: u.role.name, permissions: u.role.permissions } : null,
});

router.get('/csrf', (req, res) => res.json({ csrfToken: issueCsrf(req, res) }));

router.post('/login', loginLimiter, validate(z.object({ email: z.string().email().max(160), password: z.string().min(1).max(128) })),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase() }).select('+passwordHash +tokenVersion').populate('role');
    const ok = user && user.active && (await bcrypt.compare(req.body.password, user.passwordHash));
    if (!ok) throw new HttpError(401, 'Incorrect email or password');
    user.lastLoginAt = new Date();
    await user.save();
    setSessionCookie(res, signSession(user));
    res.json({ user: publicUser(user) });
  }));

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

router.post('/logout-all', requireAuth, asyncHandler(async (req, res) => {
  await User.updateOne({ _id: req.user._id }, { $inc: { tokenVersion: 1 } });
  clearSessionCookie(res);
  res.json({ ok: true });
}));

router.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

router.post('/forgot-password', forgotLimiter, validate(z.object({ email: z.string().email().max(160) })),
  asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email.toLowerCase(), active: true });
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      user.resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');
      user.resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000);
      await user.save();
      const link = `${config.siteUrl}/admin/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
      await sendMail({
        to: user.email,
        subject: 'Reset your Digital Guru CRM password',
        text: `Hi ${user.name},\n\nUse this link to set a new password (valid for 1 hour):\n${link}\n\nIf you did not request this, ignore this email.`,
      });
    }
    // Same response whether or not the account exists (no user enumeration)
    res.json({ ok: true, emailConfigured: mailEnabled() });
  }));

router.post('/reset-password', loginLimiter,
  validate(z.object({ email: z.string().email(), token: z.string().length(64), password })),
  asyncHandler(async (req, res) => {
    const hash = crypto.createHash('sha256').update(req.body.token).digest('hex');
    const user = await User.findOne({ email: req.body.email.toLowerCase(), resetTokenHash: hash, resetTokenExpires: { $gt: new Date() } })
      .select('+resetTokenHash +resetTokenExpires +tokenVersion');
    if (!user) throw new HttpError(400, 'This reset link is invalid or has expired');
    user.passwordHash = await bcrypt.hash(req.body.password, 12);
    user.resetTokenHash = undefined;
    user.resetTokenExpires = undefined;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await user.save();
    res.json({ ok: true });
  }));

router.patch('/profile', requireAuth,
  validate(z.object({ name: z.string().trim().min(2).max(80), phone: z.string().trim().max(20).optional().default('') })),
  asyncHandler(async (req, res) => {
    req.user.name = req.body.name;
    req.user.phone = req.body.phone;
    await req.user.save();
    res.json({ user: publicUser(req.user) });
  }));

router.post('/change-password', requireAuth,
  validate(z.object({ currentPassword: z.string().min(1), newPassword: password })),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.user._id).select('+passwordHash +tokenVersion').populate('role');
    if (!(await bcrypt.compare(req.body.currentPassword, user.passwordHash))) throw new HttpError(400, 'Current password is incorrect');
    user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
    user.tokenVersion = (user.tokenVersion || 0) + 1; // sign out other sessions
    await user.save();
    setSessionCookie(res, signSession(user));
    res.json({ ok: true });
  }));

module.exports = router;
module.exports.passwordSchema = password;
