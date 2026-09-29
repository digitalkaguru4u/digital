const crypto = require('crypto');
const config = require('../config');

const CSRF_COOKIE = 'dg_csrf';
const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Double-submit cookie: a readable random cookie that must be echoed in X-CSRF-Token. */
function issueCsrf(req, res) {
  let token = req.cookies?.[CSRF_COOKIE];
  if (!token || token.length < 32) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'lax', secure: config.isProd, path: '/' });
  }
  return token;
}

function csrfProtect(req, res, next) {
  if (SAFE.has(req.method)) return next();
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get('x-csrf-token');
  if (!cookie || !header || cookie.length !== header.length ||
      !crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token. Refresh the page and try again.' });
  }
  next();
}

module.exports = { issueCsrf, csrfProtect, CSRF_COOKIE };
