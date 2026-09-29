const jwt = require('jsonwebtoken');
const config = require('../config');
const { User } = require('../models');
const { HttpError } = require('../utils/http');

const SESSION_COOKIE = 'dg_session';

function signSession(user) {
  return jwt.sign({ sub: String(user._id), v: user.tokenVersion || 0 }, config.jwtSecret, {
    expiresIn: `${config.sessionHours}h`,
  });
}

function setSessionCookie(res, token) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    maxAge: config.sessionHours * 3600 * 1000,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

/** Requires a valid session. Loads req.user (with role). */
async function requireAuth(req, _res, next) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (!token) throw new HttpError(401, 'Not signed in');
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret);
    } catch {
      throw new HttpError(401, 'Session expired. Please sign in again.');
    }
    const user = await User.findById(payload.sub).select('+tokenVersion').populate('role');
    if (!user || !user.active || (user.tokenVersion || 0) !== payload.v || !user.role) {
      throw new HttpError(401, 'Session is no longer valid');
    }
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

const can = (user, perm) => !!user?.role && (user.role.permissions.includes('*') || user.role.permissions.includes(perm));

const requirePermission = (...perms) => (req, _res, next) => {
  if (perms.every((p) => can(req.user, p))) return next();
  next(new HttpError(403, 'You do not have permission to do this'));
};

/** Lead visibility: users without leads:view_all only see leads assigned to them. */
function leadScope(user) {
  return can(user, 'leads:view_all') ? {} : { assignedTo: user._id };
}

module.exports = { SESSION_COOKIE, signSession, setSessionCookie, clearSessionCookie, requireAuth, requirePermission, can, leadScope };
