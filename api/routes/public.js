const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const config = require('../config');
const { CtaEvent } = require('../models');
const { asyncHandler, HttpError } = require('../utils/http');
const { cleanText } = require('../utils/text');
const validate = require('../middleware/validate');
const { csrfProtect, issueCsrf } = require('../middleware/csrf');
const { getLookups } = require('../services/lookups');
const { captureWebsiteEnquiry, deriveSourceKey } = require('../services/leadService');

const router = express.Router();

const formLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many enquiries from this network. Please try again in a few minutes or call us.' },
});
const eventLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false });

const str = (max) => z.preprocess((v) => cleanText(v), z.string().max(max));
const utmSchema = z.object({
  source: str(120).optional().default(''),
  medium: str(120).optional().default(''),
  campaign: str(200).optional().default(''),
  content: str(200).optional().default(''),
  term: str(200).optional().default(''),
  gclid: str(300).optional().default(''),
  fbclid: str(300).optional().default(''),
}).partial().default({});

const leadSchema = z
  .object({
    name: str(120).pipe(z.string().min(2, 'Please enter your name')),
    phone: str(20).pipe(z.string().regex(/^\+?[0-9\s-]{8,16}$/, 'Please enter a valid phone number')),
    email: z.preprocess((v) => cleanText(v).toLowerCase(), z.union([z.literal(''), z.string().email('Please enter a valid email').max(160)])).default(''),
    company: str(160).default(''),
    service: str(80).default(''),
    budget: str(40).default(''),
    message: str(3000).default(''),
    preferredContact: z.enum(['', 'call', 'whatsapp', 'email']).default(''),
    formUsed: z.enum(['hero', 'contact', 'popup', 'service', 'quote', 'whatsapp_quick', 'footer_cta', 'pricing']).default('contact'),
    pageUrl: str(500).default(''),
    landingPage: str(500).default(''),
    referrer: str(500).default(''),
    utm: utmSchema,
    // anti-spam
    website: z.string().optional().default(''), // honeypot — must stay empty
    startedAt: z.coerce.number().optional(),
    turnstileToken: z.string().optional().default(''),
    consent: z.coerce.boolean().optional().default(true),
  })
  .strip();

async function verifyTurnstile(token, ip) {
  if (!config.turnstile.secret) return true; // not configured → honeypot + timing + rate-limit only
  if (!token) return false;
  try {
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: config.turnstile.secret, response: token, remoteip: ip || '' }),
    });
    const data = await r.json();
    return !!data.success;
  } catch {
    return false;
  }
}

// Options for public forms (services), plus a CSRF token for fetch()
router.get('/config', asyncHandler(async (req, res) => {
  const { services } = await getLookups();
  res.json({
    csrfToken: issueCsrf(req, res),
    services: services.filter((s) => s.active).map((s) => ({ slug: s.slug, label: s.label })),
    turnstileSiteKey: config.turnstile.siteKey,
  });
}));

router.post('/leads', formLimiter, csrfProtect, validate(leadSchema), asyncHandler(async (req, res) => {
  const b = req.body;
  // Honeypot / too-fast submissions: pretend success, store nothing.
  const tooFast = b.startedAt && Date.now() - b.startedAt < 2500;
  if (b.website || tooFast) return res.status(201).json({ ok: true });
  if (!(await verifyTurnstile(b.turnstileToken, req.ip))) throw new HttpError(400, 'Anti-spam check failed. Please try again.');

  const { lead, merged } = await captureWebsiteEnquiry(b, { ip: req.ip, userAgent: (req.get('user-agent') || '').slice(0, 300) });
  res.status(201).json({ ok: true, merged, reference: lead.leadId });
}));

const eventSchema = z.object({
  cta: z.enum(['call', 'whatsapp', 'quote_open', 'email']),
  pageUrl: str(500).default(''),
  referrer: str(500).default(''),
  utm: utmSchema,
});

router.post('/events', eventLimiter, csrfProtect, validate(eventSchema), asyncHandler(async (req, res) => {
  const { cta, pageUrl, utm, referrer } = req.body;
  await CtaEvent.create({ cta, pageUrl, utm, source: deriveSourceKey({ utm, referrer }) });
  res.status(204).end();
}));

module.exports = router;
