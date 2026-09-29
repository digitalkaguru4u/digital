const express = require('express');
const cookieParser = require('cookie-parser');
const mongoSanitize = require('../middleware/sanitize');
const { csrfProtect } = require('../middleware/csrf');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { notFoundApi, errorHandler } = require('../middleware/error');

/** Builds the /api router. Everything except /public and /auth is behind requireAuth + CSRF. */
function buildApi() {
  const api = express.Router();
  const { webhook: metaWebhook, admin: integrationsAdmin, health: metaHealth } = require('./integrations');

  // Meta webhook needs the raw body (signature check) → mounted before the JSON parser
  api.use('/integrations', metaWebhook);

  // Small JSON bodies everywhere, except lead imports (spreadsheets up to 10 MB)
  const smallJson = express.json({ limit: '200kb' });
  const bigJson = express.json({ limit: '16mb' });
  api.use((req, res, next) => (req.path.startsWith('/leads/import') ? bigJson : smallJson)(req, res, next));
  api.use(cookieParser());
  api.use(mongoSanitize);
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  api.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));
  api.use('/public', require('./public'));
  api.use('/auth', csrfProtect, require('./auth'));
  api.use('/integrations', integrationsAdmin);
  api.use('/meta', metaHealth); // GET /api/meta/health (admin only)

  // ── authenticated admin API ──
  api.use(requireAuth, csrfProtect);
  api.use('/dashboard', requirePermission('dashboard:view'), require('./dashboard'));
  api.use('/leads/import', require('./import'));
  api.use('/leads', require('./leads'));
  api.use('/notifications', require('./notifications'));
  api.use('/followups', require('./followups'));
  api.use('/settings', require('./settings'));
  api.use('/users', require('./users'));

  api.use(notFoundApi);
  api.use(errorHandler);
  return api;
}

module.exports = buildApi;
