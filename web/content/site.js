/**
 * Home-page content. Edit freely — everything here is rendered server-side.
 *
 * IMPORTANT: `portfolio` and `testimonials` ship as clearly-marked SAMPLES
 * (sample: true renders a small "Sample" tag). Replace them with real client
 * work and real, permission-granted reviews before launch, then set sample:false.
 * No review/rating schema markup is emitted for testimonials.
 */
module.exports = {
  hero: {
    eyebrow: 'Digital marketing agency · India',
    titleA: 'Turn clicks into',
    titleB: 'real customers.',
    lead: 'Digital Guru builds high-converting websites and runs SEO, Google Ads and Meta Ads that bring you qualified leads — then helps your team follow up and close them.',
    chips: ['Websites', 'SEO', 'Google Ads', 'Meta Ads', 'Lead Generation'],
  },
  why: [
    { icon: 'target', t: 'Leads, not vanity metrics', d: 'We report cost per lead, booked customers and revenue — the numbers your business actually runs on.' },
    { icon: 'layers', t: 'Website + ads + follow-up', d: 'One team for your website, campaigns and lead handling, so nothing gets lost between agencies.' },
    { icon: 'gauge', t: 'Built for speed', d: 'Fast websites, fast campaign launches and fast responses to every enquiry.' },
    { icon: 'eye', t: 'Transparent by default', d: 'You own your ad accounts, data and website. Clear monthly reports, no lock-in contracts.' },
  ],
  process: [
    { n: '01', t: 'Free strategy call', d: 'We understand your business, goals, budget and what has (or hasn’t) worked so far.' },
    { n: '02', t: 'Growth plan', d: 'A clear plan: channels, website changes, timelines and expected cost per lead.' },
    { n: '03', t: 'Build & launch', d: 'Website, tracking and campaigns go live — usually within 7–14 days.' },
    { n: '04', t: 'Optimise & scale', d: 'Weekly improvements, monthly reviews, and scaling what brings customers.' },
  ],
  portfolio: [
    { sample: true, tag: 'Real Estate', title: 'Lead engine for a residential project', result: 'Landing pages + Google & Meta Ads + CRM follow-up', metric: 'Cost per lead ↓', color: 'purple', art: 'building' },
    { sample: true, tag: 'E-commerce', title: 'D2C store relaunch', result: 'Shopify redesign, product SEO, Meta retargeting', metric: 'Conversion rate ↑', color: 'yellow', art: 'bag' },
    { sample: true, tag: 'Healthcare', title: 'Local SEO for a multi-city clinic', result: 'Google Business Profiles, location pages, reviews', metric: 'Calls from Maps ↑', color: 'pink', art: 'pin' },
    { sample: true, tag: 'Education', title: 'Admissions campaign for a coaching institute', result: 'Meta Lead Ads + WhatsApp automation', metric: 'Qualified enquiries ↑', color: 'cream', art: 'cap' },
  ],
  testimonials: [
    { sample: true, quote: 'Replace this with a real review from a client — what problem you solved and what changed for them.', name: 'Client name', role: 'Founder, Company' },
    { sample: true, quote: 'Short, specific reviews convert best: mention the service, the timeline and the result in the client’s own words.', name: 'Client name', role: 'Marketing Head, Company' },
    { sample: true, quote: 'Ask happy clients for permission before publishing their name, photo or company.', name: 'Client name', role: 'Director, Company' },
  ],
  industries: [
    { icon: 'home', t: 'Real Estate' }, { icon: 'heart', t: 'Healthcare & Clinics' }, { icon: 'book', t: 'Education & Coaching' },
    { icon: 'bag', t: 'E-commerce & D2C' }, { icon: 'coffee', t: 'Restaurants & Cafés' }, { icon: 'briefcase', t: 'B2B & Professional Services' },
    { icon: 'plane', t: 'Travel & Hospitality' }, { icon: 'tool', t: 'Manufacturing' }, { icon: 'sparkles', t: 'Beauty & Wellness' },
    { icon: 'car', t: 'Automotive' },
  ],
  pricing: [
    { name: 'Starter Website', price: '₹14,999', unit: 'one-time', best: false, service: 'website-development',
      features: ['Up to 5 pages, custom design', 'Mobile-first & fast loading', 'On-page SEO setup', 'Enquiry form + WhatsApp + call buttons', 'Google Analytics setup'] },
    { name: 'Growth Marketing', price: '₹19,999', unit: '/month', best: true, service: 'performance-marketing',
      features: ['Google Ads or Meta Ads management', 'Landing page optimisation', 'Conversion tracking (forms, calls, WhatsApp)', 'Weekly optimisation', 'Monthly performance report'] },
    { name: 'SEO Accelerator', price: '₹9,999', unit: '/month', best: false, service: 'seo',
      features: ['Technical SEO audit & fixes', 'Keyword research & mapping', 'On-page optimisation', 'Local SEO & Google Business Profile', 'Monthly ranking report'] },
  ],
  faqs: [
    { q: 'What services does Digital Guru offer?', a: 'We offer website design and development, SEO, Google Ads, Meta (Facebook & Instagram) Ads, social media marketing, lead generation, branding, e-commerce development, performance marketing and marketing automation.' },
    { q: 'How much does digital marketing cost?', a: 'Websites start from ₹14,999 and monthly marketing retainers from ₹9,999. Ad spend is separate and paid directly to Google or Meta. We share a clear quote after a free strategy call.' },
    { q: 'How soon can I start getting leads?', a: 'With paid ads, most clients receive their first enquiries within the first week of campaigns going live. SEO builds more gradually, typically over 2–6 months.' },
    { q: 'Do you work with small businesses?', a: 'Yes. We work with startups, local businesses and growing brands, and shape packages around your stage and budget.' },
    { q: 'Will I own my website and ad accounts?', a: 'Yes. Your website, domain, ad accounts and data are always yours — even if you stop working with us.' },
    { q: 'Do you offer a free consultation?', a: 'Yes. Book a free 30-minute strategy call and we will review your website and marketing and suggest quick wins.' },
  ],
};
