require('dotenv').config({ quiet: true });

const env = process.env;
const isProd = env.NODE_ENV === 'production';

function required(name, fallbackForDev) {
  const v = env[name];
  if (v) return v;
  if (!isProd && fallbackForDev !== undefined) return fallbackForDev;
  throw new Error(`Missing required environment variable: ${name}`);
}

const config = {
  isProd,
  port: Number(env.PORT || 4000),
  siteUrl: (env.SITE_URL || 'http://localhost:4000').replace(/\/$/, ''),
  timezone: env.TIMEZONE || 'Asia/Kolkata',
  trustProxy: env.TRUST_PROXY ? Number(env.TRUST_PROXY) || env.TRUST_PROXY : 0,
  mongoUri: required('MONGODB_URI', 'mongodb://127.0.0.1:27017/digital_guru'),
  jwtSecret: required('JWT_SECRET', 'dev-only-secret-change-me-dev-only-secret-change-me'),
  sessionHours: Number(env.SESSION_HOURS || 12),
  business: {
    name: 'Digital Guru',
    phone: env.BUSINESS_PHONE || '+919876543210',
    phoneDisplay: env.BUSINESS_PHONE_DISPLAY || '+91 98765 43210',
    whatsapp: (env.WHATSAPP_NUMBER || '919876543210').replace(/\D/g, ''),
    email: env.BUSINESS_EMAIL || 'hello@digitalguru.in',
    address: env.BUSINESS_ADDRESS || 'Navi Mumbai, Maharashtra, India',
    city: env.BUSINESS_CITY || 'Navi Mumbai',
    region: env.BUSINESS_REGION || 'Maharashtra',
    postcode: env.BUSINESS_POSTCODE || '400703',
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT || 587),
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || 'Digital Guru <no-reply@digitalguru.in>',
  },
  newLeadNotify: (env.NEW_LEAD_NOTIFY || '').split(',').map((s) => s.trim()).filter(Boolean),
  turnstile: { siteKey: env.TURNSTILE_SITE_KEY || '', secret: env.TURNSTILE_SECRET_KEY || '' },
  ga4Id: env.GA4_ID || '',
  googleVerification: env.GOOGLE_SITE_VERIFICATION || '',
};

if (isProd && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production');
}

module.exports = config;
