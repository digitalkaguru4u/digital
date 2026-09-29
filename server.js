/**
 * Digital Guru — single Node process serving three separated apps:
 *   /api/*    REST API (api/)           — JSON, auth-protected admin endpoints
 *   /admin/*  CRM admin SPA (admin/)     — React build served as static files
 *   /*        Public website (web/)      — server-rendered HTML for SEO
 */
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const config = require('./api/config');
const { connectDB } = require('./api/db');
const buildApi = require('./api/routes');
const buildWeb = require('./web/router');
const { startScheduler } = require('./api/services/scheduler');

const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", 'https://challenges.cloudflare.com', 'https://www.googletagmanager.com'],
      'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'https://www.googletagmanager.com', 'https://www.google-analytics.com'],
      'connect-src': ["'self'", 'https://www.google-analytics.com', 'https://*.google-analytics.com', 'https://*.analytics.google.com'],
      'frame-src': ['https://challenges.cloudflare.com', 'https://www.google.com'],
      'upgrade-insecure-requests': config.isProd ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(morgan(config.isProd ? 'combined' : 'dev', { skip: (req) => req.path.startsWith('/assets') || req.path.startsWith('/admin/assets') }));

// 1) API
app.use('/api', buildApi());

// 2) Admin SPA (built by `npm run build` into admin/dist)
const adminDist = path.join(__dirname, 'admin', 'dist');
if (fs.existsSync(adminDist)) {
  app.use('/admin', express.static(adminDist, { index: false, maxAge: '1y', immutable: true, setHeaders: (res, p) => {
    if (p.endsWith('.html') || p.endsWith('sw.js') || p.endsWith('.webmanifest')) res.setHeader('Cache-Control', 'no-cache');
    if (p.endsWith('sw.js')) res.setHeader('Service-Worker-Allowed', '/admin/');
  } }));
  app.get(['/admin', '/admin/*'], (_req, res) => {
    res.set({ 'Cache-Control': 'no-cache', 'X-Robots-Tag': 'noindex, nofollow' });
    res.sendFile(path.join(adminDist, 'index.html'));
  });
} else {
  app.get(['/admin', '/admin/*'], (_req, res) => res.status(503).send('Admin panel not built. Run: npm run build'));
}

// 3) Public website (must be last — it owns the 404 page)
app.use(buildWeb());

// Startup order: env (.env locally / Render env vars, loaded by api/config) → DB + migration →
// Meta config check → HTTP server → Meta auth check → scheduler. A Meta problem never stops the CRM.
connectDB()
  .then(() => require('./api/migrate').migrate({ log: (m) => console.log(m) }))
  .then(() => {
    const { logMetaStartup, redact } = require('./api/services/metaConfig');
    logMetaStartup();
    app.listen(config.port, () => console.log(`[server] Digital Guru running on http://localhost:${config.port}`));
    const meta = require('./api/services/meta');
    const metaCheck = (process.env.META_PAGE_ID && process.env.META_PAGE_ACCESS_TOKEN)
      ? meta.validateAuth().then((r) => console.log(meta.summarize(r))).catch((e) => console.error('[META] auth check error:', redact(e.message)))
      : Promise.resolve();
    metaCheck.finally(() => startScheduler()); // reminders, daily digest, Meta auto-sync
  })
  .catch((e) => { console.error('[server] failed to start:', e.message); process.exit(1); });

module.exports = app;

// Graceful shutdown (PM2 / Docker / Render send SIGTERM)
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, async () => {
  console.log(`[server] ${sig} received, closing…`);
  try { await require('mongoose').disconnect(); } finally { process.exit(0); }
}));
