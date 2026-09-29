/**
 * Public website — server-rendered with EJS for full SEO (every page is
 * complete HTML with unique title/description/canonical/OG + JSON-LD).
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const config = require('../api/config');
const { getLookups } = require('../api/services/lookups');
const svg = require('./lib/svg');
const services = require('./content/services');
const site = require('./content/site');

const PUBLIC_DIR = path.join(__dirname, 'public');
const bySlug = Object.fromEntries(services.map((s) => [s.slug, s]));

// Cache-busting hashes for CSS/JS
const hashes = {};
function asset(p) {
  if (!hashes[p] || !config.isProd) {
    try { hashes[p] = crypto.createHash('md5').update(fs.readFileSync(path.join(PUBLIC_DIR, p.replace(/^\/assets\//, '')))).digest('hex').slice(0, 10); }
    catch { hashes[p] = '1'; }
  }
  return `${p}?v=${hashes[p]}`;
}

// Content last-modified date for sitemap
const contentDate = (() => {
  const files = ['content/services.js', 'content/site.js', 'views/pages/home.ejs'].map((f) => path.join(__dirname, f));
  const t = Math.max(...files.map((f) => { try { return fs.statSync(f).mtimeMs; } catch { return Date.now(); } }));
  return new Date(t).toISOString().slice(0, 10);
})();

const priceNumber = (p) => Number(String(p).replace(/[^0-9]/g, '')) || undefined;
const B = config.business;
const orgId = `${config.siteUrl}/#organization`;

function orgSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ProfessionalService',
    '@id': orgId,
    name: 'Digital Guru',
    description: 'Digital marketing agency offering website development, SEO, Google Ads, Meta Ads, social media marketing, lead generation, branding and e-commerce development.',
    url: config.siteUrl,
    logo: `${config.siteUrl}/assets/img/logo-512.png`,
    image: `${config.siteUrl}/assets/img/og-default.png`,
    telephone: B.phone,
    email: B.email,
    priceRange: '₹₹',
    address: { '@type': 'PostalAddress', streetAddress: B.address, addressLocality: B.city, addressRegion: B.region, postalCode: B.postcode, addressCountry: 'IN' },
    areaServed: { '@type': 'Country', name: 'India' },
    knowsAbout: services.map((s) => s.name),
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: 'Digital marketing services',
      itemListElement: services.map((s) => ({ '@type': 'Offer', itemOffered: { '@type': 'Service', name: s.name, url: `${config.siteUrl}/services/${s.slug}` } })),
    },
  };
}
const faqSchema = (faqs) => ({
  '@context': 'https://schema.org', '@type': 'FAQPage',
  mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
});
const breadcrumbSchema = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: `${config.siteUrl}${it.path}` })),
});

function buildWeb() {
  const web = express();
  web.set('views', path.join(__dirname, 'views'));
  web.set('view engine', 'ejs');
  if (config.isProd) web.set('view cache', true);
  web.set('strict routing', false);

  web.use('/assets', express.static(PUBLIC_DIR, { maxAge: config.isProd ? '30d' : 0, fallthrough: true }));
  ['favicon.ico', 'favicon.svg', 'apple-touch-icon.png'].forEach((f) =>
    web.get(`/${f}`, (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'img', f), { maxAge: '30d' })));

  // Canonical host hygiene: strip trailing slashes & lower-case paths
  web.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    const p = req.path;
    if (p.length > 1 && p.endsWith('/')) return res.redirect(301, p.slice(0, -1) + (req.url.slice(p.length) || ''));
    if (/[A-Z]/.test(p) && !p.startsWith('/assets')) return res.redirect(301, p.toLowerCase() + req.url.slice(p.length));
    next();
  });

  // Shared locals for every page
  web.use(async (req, res, next) => {
    try {
      const L = await getLookups();
      res.locals.formServices = L.services.filter((s) => s.active);
    } catch {
      res.locals.formServices = services.map((s) => ({ slug: s.slug, label: s.name }));
    }
    Object.assign(res.locals, {
      svg, asset, site, services, B, config, year: new Date().getFullYear(),
      waLink: (text) => `https://wa.me/${B.whatsapp}?text=${encodeURIComponent(text || 'Hi Digital Guru, I would like to know more about your services.')}`,
      currentPath: req.path,
      turnstileKey: config.turnstile.siteKey,
      ga4Id: config.ga4Id,
      googleVerification: config.googleVerification,
      seo: null,
      jsonld: [orgSchema()],
    });
    res.set('Cache-Control', 'public, max-age=0, must-revalidate');
    next();
  });

  const render = (res, view, seo, extra = {}) => {
    const canonical = `${config.siteUrl}${seo.path === '/' ? '/' : seo.path}`;
    res.render(view, {
      ...extra,
      seo: { ogType: 'website', ogImage: `${config.siteUrl}/assets/img/og-default.png`, ...seo, canonical },
      jsonld: [...res.locals.jsonld, ...(extra.schemas || [])],
    });
  };

  web.get('/', (req, res) => {
    render(res, 'pages/home', {
      path: '/',
      title: 'Digital Guru | Digital Marketing Agency for Websites, SEO & Ads',
      description: 'Digital Guru builds high-converting websites and runs SEO, Google Ads, Meta Ads and lead generation that bring qualified customers. Get a free quote today.',
    }, {
      schemas: [
        { '@context': 'https://schema.org', '@type': 'WebSite', '@id': `${config.siteUrl}/#website`, url: config.siteUrl, name: 'Digital Guru', publisher: { '@id': orgId }, inLanguage: 'en-IN' },
        faqSchema(site.faqs),
      ],
    });
  });

  web.get('/services', (req, res) => {
    render(res, 'pages/services', {
      path: '/services',
      title: 'Digital Marketing Services: Websites, SEO & Ads | Digital Guru',
      description: 'Website development, SEO, Google Ads, Meta Ads, social media, lead generation, branding, e-commerce and marketing automation — all from Digital Guru.',
    }, {
      schemas: [
        breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }]),
        { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: services.map((s, i) => ({ '@type': 'ListItem', position: i + 1, url: `${config.siteUrl}/services/${s.slug}`, name: s.name })) },
      ],
    });
  });

  web.get('/services/:slug', (req, res, next) => {
    const svc = bySlug[req.params.slug];
    if (!svc) return next();
    render(res, 'pages/service', { path: `/services/${svc.slug}`, title: `${svc.metaTitle}`, description: svc.metaDescription }, {
      svc,
      related: svc.related.map((r) => bySlug[r]).filter(Boolean),
      schemas: [
        {
          '@context': 'https://schema.org', '@type': 'Service', name: svc.name, serviceType: svc.name, description: svc.metaDescription,
          url: `${config.siteUrl}/services/${svc.slug}`, provider: { '@id': orgId }, areaServed: { '@type': 'Country', name: 'India' },
          offers: { '@type': 'Offer', priceCurrency: 'INR', price: priceNumber(svc.startingPrice), description: `Starting from ${svc.startingPrice}`, url: `${config.siteUrl}/services/${svc.slug}` },
        },
        breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Services', path: '/services' }, { name: svc.name, path: `/services/${svc.slug}` }]),
        faqSchema(svc.faqs),
      ],
    });
  });

  web.get('/contact', (req, res) => {
    render(res, 'pages/contact', {
      path: '/contact',
      title: 'Contact Digital Guru | Get a Free Quote & Strategy Call',
      description: `Talk to Digital Guru about your website, SEO or ads. Call ${B.phoneDisplay}, WhatsApp us, or send an enquiry for a free quote and strategy call.`,
    }, {
      schemas: [
        { '@context': 'https://schema.org', '@type': 'ContactPage', url: `${config.siteUrl}/contact`, name: 'Contact Digital Guru', about: { '@id': orgId } },
        breadcrumbSchema([{ name: 'Home', path: '/' }, { name: 'Contact', path: '/contact' }]),
      ],
    });
  });

  web.get('/thank-you', (req, res) => {
    render(res, 'pages/thanks', { path: '/thank-you', title: 'Thank you — we have received your enquiry | Digital Guru', description: 'Thank you for contacting Digital Guru.', noindex: true },
      { ref: String(req.query.ref || '').replace(/[^A-Z0-9-]/gi, '').slice(0, 20) });
  });

  web.get('/privacy-policy', (req, res) => render(res, 'pages/legal', { path: '/privacy-policy', title: 'Privacy Policy | Digital Guru', description: 'How Digital Guru collects, uses and protects the information you share through our website and enquiry forms.' }, { kind: 'privacy' }));
  web.get('/terms', (req, res) => render(res, 'pages/legal', { path: '/terms', title: 'Terms of Use | Digital Guru', description: 'Terms governing the use of the Digital Guru website.' }, { kind: 'terms' }));

  web.get('/robots.txt', (_req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nDisallow: /thank-you\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  });

  web.get('/sitemap.xml', (_req, res) => {
    const urls = [
      { loc: '/', pr: '1.0', cf: 'weekly' },
      { loc: '/services', pr: '0.9', cf: 'monthly' },
      ...services.map((s) => ({ loc: `/services/${s.slug}`, pr: '0.8', cf: 'monthly' })),
      { loc: '/contact', pr: '0.7', cf: 'yearly' },
      { loc: '/privacy-policy', pr: '0.2', cf: 'yearly' },
      { loc: '/terms', pr: '0.2', cf: 'yearly' },
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${config.siteUrl}${u.loc === '/' ? '/' : u.loc}</loc><lastmod>${contentDate}</lastmod><changefreq>${u.cf}</changefreq><priority>${u.pr}</priority></url>`)
      .join('\n')}\n</urlset>\n`;
    res.type('application/xml').send(xml);
  });

  web.get('/site.webmanifest', (_req, res) => {
    res.type('application/manifest+json').send(JSON.stringify({
      name: 'Digital Guru', short_name: 'Digital Guru', start_url: '/', display: 'standalone',
      background_color: '#FFFDF8', theme_color: '#302060',
      icons: [{ src: '/assets/img/logo-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/img/logo-512.png', sizes: '512x512', type: 'image/png' }],
    }));
  });

  // 404
  web.use((req, res) => {
    res.status(404);
    render(res, 'pages/404', { path: req.path, title: 'Page not found | Digital Guru', description: 'The page you are looking for does not exist.', noindex: true });
  });

  // eslint-disable-next-line no-unused-vars
  web.use((err, req, res, _next) => {
    console.error('[web]', err);
    res.status(500).send('Something went wrong. Please try again.');
  });

  return web;
}

module.exports = buildWeb;
