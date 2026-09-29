# Digital Guru — Agency Website + Lead Management CRM

Node.js · Express · MongoDB (Mongoose) · EJS (server-rendered, SEO) · React + Vite (admin)

```
digital-guru/
├── server.js            # one Node process, three separated apps:
├── api/                 #   /api/*    REST API — models, auth, security, services
│   ├── models/          #   Mongoose collections (one per entity, referenced by ObjectId)
│   ├── routes/          #   public intake, auth, leads, import, followups, dashboard, settings, users, notifications, integrations
│   ├── services/        #   lead dedup/attribution/workflow, activity log, mailer, lookups
│   ├── middleware/      #   auth + RBAC, CSRF, validation (zod), Mongo-injection scrub, errors
│   └── seed.js          #   master data + first admin (+ optional demo leads)
├── web/                 #   /*        public website — SSR EJS views, content files, SVG system
│   ├── content/         #   services.js (11 service pages) · site.js (home content)
│   ├── lib/svg.js       #   reusable icons, decorative shapes, brand illustrations
│   ├── views/           #   layouts, partials (lead form, modals), pages
│   └── public/          #   css/site.css (design tokens) · js/site.js · img/
├── admin/               #   /admin/*  CRM SPA (React 18 + Vite) → built to admin/dist
└── tests/               #   e2e.js (32 checks) · e2e-integrations.js (25 checks) · seo-check.js · mock-meta.js
```

## Quick start

```bash
cp .env.example .env          # set MONGODB_URI, JWT_SECRET, SITE_URL, business phone/WhatsApp…
npm install
npm run build                 # installs + builds the admin panel
npm run seed                  # stages, sources, services, lost reasons, follow-up types, roles + admin user (also runs the migration)
# npm run seed:demo           # optional: 18 sample leads tagged "[Demo]" to explore the CRM
npm start                     # http://localhost:4000  ·  CRM at /admin
```

Sign in at `/admin` with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`, then change the password
(Settings → Profile & password). `npm run create-admin -- email@x.com "NewPass123" "Name"` resets or adds an admin from the server.

Development: `npm run dev` (API + site with auto-reload) and `npm run dev:admin` (Vite on :5173, proxies `/api`).

## Upgrading an existing install

Nothing to do: the migration runs automatically every time the server starts (you can also run `npm run migrate`
by hand). It is safe to run repeatedly: Not Interested / Closed → Lost, Follow-up stage → Contacted, temperature removed (Hot/Warm/Cold moves an
early-stage lead into that stage), budget ranges → amounts, tasks → follow-ups.

## Deploying

Any Node 20+ host with MongoDB 6+ (MongoDB Atlas works well):

1. Set env vars from `.env.example` (`NODE_ENV=production`, a 64-char `JWT_SECRET`, `SITE_URL=https://yourdomain`, `TRUST_PROXY=1` behind Nginx/Render/Railway).
2. `npm ci && npm run build && npm run seed && npm start` (use PM2 or your platform's process manager).
3. Serve over HTTPS — session cookies are `Secure` in production.
4. Optional: `SMTP_*` (password-reset emails + new-lead alerts to `NEW_LEAD_NOTIFY`), `TURNSTILE_*` (Cloudflare CAPTCHA on forms), `GA4_ID`, `GOOGLE_SITE_VERIFICATION`.
5. Submit `https://yourdomain/sitemap.xml` in Google Search Console.

A `Dockerfile` and `docker-compose.yml` (app + mongo:7) are included.

## Testing

With the server running and seeded:

```bash
npm run test:e2e   # website enquiry → dedup → login → stage/budget → pipeline value → notes → follow-ups
                   # → booking/payments → bulk → filters → CSV/XLSX → settings → dashboard → logout
npm run test:seo   # every sitemap URL: status, title/description length, canonical, single H1, OG, JSON-LD
npm run test:integrations   # import, Meta webhook + sync, push notifications, reminders (uses mock Meta/push
                            # servers — see the header of tests/e2e-integrations.js for the test-only env vars)
```

## Importing leads (CSV / Excel)

**Leads → Import.** Drop a `.csv` or `.xlsx` file (up to 5,000 rows, 10 MB). Columns are auto-matched
(e.g. “Customer Name”, “Mobile Number”, “Requirement”) and you can change any mapping before importing.
Download the Excel/CSV template from the same dialog.

- Fields: name (or first + last), phone, email, company, service, source, campaign, budget, stage (a “Temperature/Rating” column with Hot/Warm/Cold is read as the stage),
  message, notes (saved as a lead note), assigned to (user name/email), enquiry date, city.
- Budget is an amount: `35000`, `₹35,000`, `35k`, `1.5L`, `1cr`; a range like `₹10,000 – ₹15,000` is saved as its midpoint.
- Dates: `2026-09-21`, `21/09/2026`, `21-09-2026`, Excel dates.
- Duplicates (same phone/email, in the CRM or earlier in the file): **skip** (default), **update existing**, or **create anyway**.
- You get a result summary (new / updated / skipped / failed) and a downloadable list of problem rows. Every imported
  lead gets an “imported from <file>” timeline entry.

## Meta (Facebook & Instagram) Lead Ads → CRM — free

Built in, using Meta’s Graph API directly (no Zapier/Pabbly fees).

**Token = environment variable only.** `META_PAGE_ACCESS_TOKEN` (Render → Environment, or your local `.env`) is the
single source of the Meta token. It is read on the server at call time, never stored in MongoDB, never sent to the
admin panel (only “set / not set” + a 4-character prefix), never logged, and cannot be typed into the CRM. Older
builds saved a token from Settings into the database, where it overrode the env var — the startup migration deletes it.
`META_PAGE_ID`, `META_APP_SECRET`, `META_VERIFY_TOKEN` also come from the environment first (Settings is only a fallback).

**Use a Business System User token** (expiry “Never”): Business Settings → Users → System users → add (Admin) →
Assign assets → **Pages → your Page (full control)** and **Apps → your app** → Generate new token → your app →
Never → `leads_retrieval`, `pages_show_list`, `pages_read_engagement`, `pages_manage_metadata`, `pages_manage_ads`,
`ads_management`, `business_management`. A system user token is a user-type token, so the CRM asks Meta for the
Page’s token (`GET /{page-id}?fields=access_token`) and keeps it in memory to call the Page’s lead forms; a Page
token pasted directly also works. `META_APP_SECRET` must be the secret of the same app.

- **Auto-sync** (default every 5 min): pulls new leads from every lead form on your Page.
  Works even before your Meta app is approved.
- **If Meta rejects the token** (expired, invalid, missing permission, Page not assigned, wrong app secret) auto-sync
  pauses, logs one clear line with the fix, notifies admins once, and re-checks after 15 min → 30 → 60 … max 6 h.
  Network/rate-limit errors retry after 1 → 2 → 4 … 30 min. A redeploy with a new token, or **Test connection /
  Check again now** in Settings, resumes at once and back-fills leads created during the outage. The CRM keeps working.
- **Startup log** (Render → Logs): `[META] PAGE_ID configured`, `[META] ACCESS_TOKEN configured (prefix EAAx…)` and
  `[META] auth check OK — Page "…", token type SYSTEM_USER, expires never, N lead form(s)` or the exact problem.
- **Diagnostics:** `GET /api/meta/health` (admin login required, no token in the response) and `npm run meta:check`
  (Render → Shell) check token → Page → lead forms → leads and name the fix.
- **Instant webhook** at `https://yourdomain/api/integrations/meta/webhook`: signature-verified (`X-Hub-Signature-256`
  with your app secret), handshake with your verify token. Meta only sends live webhooks to apps in **Live** mode,
  which may require App Review for `leads_retrieval` — until then auto-sync covers you.
- **Sync now** backfills up to 90 days (Meta deletes leads older than that). Failed leads can be retried.
- Each Meta lead is recorded once by its leadgen ID (webhook + sync can’t double-create) and goes through the same
  phone/email dedup as the website. Source = Meta Ads, campaign = Meta campaign (or form) name, platform
  (Facebook/Instagram), ad name, city and all custom questions are saved on the lead; the service is guessed from
  the form/campaign/answers. Graph API version defaults to `v25.0` (`META_GRAPH_VERSION`).

## Notifications

Every event is stored in the CRM **bell** (with read/unread) and — for users who turn it on — sent as a free
**browser push** to desktop and phone, even when the CRM tab is closed.

- Events: new lead, new Meta lead, repeat enquiry, lead assigned to you, follow-up reminder (at each follow-up’s
  reminder time), booked, payment recorded, lost, import finished, 09:30 morning summary,
  integration errors.
- Each user chooses which events push to them in **Settings → Notifications** and can register several devices.
- Turn on: Settings → Notifications → **Turn on** (or the banner on the dashboard). Needs HTTPS in production.
  Chrome/Edge/Firefox on desktop and Android work directly; on iPhone (iOS 16.4+) first “Add to Home Screen” and open
  the CRM from there — the admin is installable as an app.
- VAPID keys are generated automatically on first run and stored in the database (or set `VAPID_*` env vars).
- Reminders run in the app process every minute; each item is claimed atomically so running two instances won’t double-send.

## How it fits together

**Lead capture.** Every website CTA posts to `POST /api/public/leads` (hero form, popup, service pages, contact page,
pricing buttons, WhatsApp quick form). The browser stores first-touch attribution (UTM params, `gclid`/`fbclid`,
landing page, referrer) for 30 days; the server derives the source (Google Ads, Meta Ads, Instagram, Facebook, WhatsApp,
Referral, Website = organic search, Direct) and auto-creates a Campaign record from `utm_campaign`.
Tap-to-call and "open WhatsApp without the form" can't identify a visitor, so they are counted as anonymous CTA clicks on the dashboard.

**No duplicates.** Before creating a lead the phone (last 10 digits) and email are matched. A repeat website enquiry is
attached to the existing lead (`enquiries` collection + timeline entry, count++), and re-opens it if it was lost.
When an admin adds a lead that already exists, the CRM shows **Existing lead found** with *Update existing lead*,
*Add as new enquiry* or *Create separate lead anyway*.

**Workflow (kept simple).** One stage field — Open, Contacted, Ringing, Cold, Warm, Hot, Proposal Sent, Booked, Lost —
changed from a dropdown on every lead card, the lead page, the pipeline board and the pipeline-value list. Stages, sources,
services, lost reasons and follow-up types are database records (Settings), not code. Stage flags drive behaviour:
`needsBudget` (Hot/Warm/Cold leads without an amount are listed for you to fill in), `requiresReason` (Lost asks for a
reason, stored permanently), `isBooked` (opens booking details), `isWon` (conversion), `isLost` (excluded from pipeline value).
Budget is one ₹ amount per lead. To-dos are follow-ups (type “Task / to-do”) — there is no separate task list.
The dashboard is all-time with a “Today” block (no date filter); **Open pipeline value** opens a list of every open lead
with its amount (subtotals per stage) plus the Hot/Warm/Cold leads still missing a budget, editable inline.
Every change is appended to `lead_activities`; history is never edited or deleted
(deleting a lead moves it to trash — restorable).

**Follow-ups & reminders.** Today / Upcoming / Overdue / Completed buckets in the business timezone (`TIMEZONE`).
Completing one can add a note, change the stage/budget and schedule the next follow-up in one step. Reminders show in
the CRM bell and as browser push (see Notifications). Email/SMS reminders are not built.

**Roles.** Administrator (full), Sales Manager, Sales Executive (sees only leads assigned to them), Marketing Manager
(view + export). Permissions are editable per role in Settings → Roles; new roles can be added.

**Security.** bcrypt (12 rounds) · JWT in an httpOnly SameSite cookie with server-side revocation (`tokenVersion`) ·
double-submit CSRF token on every state-changing request · zod validation + HTML stripping on all input ·
`$`/`.` key scrubbing against Mongo operator injection · rate limits on login, password reset and public forms ·
honeypot + minimum fill time (+ Cloudflare Turnstile when configured) · Helmet CSP/HSTS · CSV formula-injection guard ·
admin pages `noindex`.

## Before launch — things only you can supply

- Real phone, WhatsApp number, email and address in `.env`.
- **Portfolio and testimonials** in `web/content/site.js` ship as clearly tagged *Sample* entries — replace them with real
  work and permission-granted reviews, then set `sample: false`. (No review/rating schema is emitted.)
- Confirm the indicative prices in `web/content/services.js` and `site.js`.
- Have the Privacy Policy / Terms templates reviewed.

## Built for later

The data model already separates what future modules need: `users`/`roles` (more sales staff, assignment),
`communications` (WhatsApp API / email / SMS logs), `enquiries` + `campaigns` (Google Ads offline conversions,
Sheets sync), `payments` + `booking` (invoices, client & project management). The WhatsApp Business API and automated
email/SMS messages are **not** connected in this version.
