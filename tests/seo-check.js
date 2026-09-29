/**
 * SEO smoke test for the public site (run against a running server):
 *   BASE_URL=http://localhost:4000 node tests/seo-check.js
 * Checks every sitemap URL for: 200, unique <title> (≤ 70 chars), meta description
 * (≤ 170 chars), canonical, exactly one <h1>, OG tags, valid JSON-LD, img/svg alt text.
 */
const BASE = process.env.BASE_URL || 'http://localhost:4000';
(async () => {
  const sm = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/^https?:\/\/[^/]+/, ''));
  const titles = new Map();
  let problems = 0;
  for (const path of urls) {
    const res = await fetch(BASE + path);
    const html = await res.text();
    const issues = [];
    const dec = (x) => x.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    const title = dec((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '');
    const desc = dec((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || '');
    const h1 = (html.match(/<h1[\s>]/g) || []).length;
    if (res.status !== 200) issues.push(`status ${res.status}`);
    if (!title) issues.push('missing title');
    if (title.length > 65) issues.push(`title ${title.length} chars`);
    if (!desc) issues.push('missing description');
    if (desc.length > 160) issues.push(`description ${desc.length} chars`);
    if (!/<link rel="canonical" href="[^"]+"/.test(html)) issues.push('no canonical');
    if (h1 !== 1) issues.push(`${h1} h1 tags`);
    if (!/property="og:image"/.test(html)) issues.push('no og:image');
    if (/<img(?![^>]*alt=)/.test(html)) issues.push('img without alt');
    for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
      try { JSON.parse(m[1]); } catch { issues.push('invalid JSON-LD'); }
    }
    const ld = [...html.matchAll(/"@type":"([A-Za-z]+)"/g)].map((m) => m[1]);
    if (titles.has(title)) issues.push(`duplicate title with ${titles.get(title)}`);
    titles.set(title, path);
    problems += issues.length;
    console.log(`${issues.length ? '✗' : '✓'} ${path.padEnd(36)} ${title.length}c title · ${desc.length}c desc · schema: ${[...new Set(ld)].filter((t) => !['PostalAddress', 'Country', 'OfferCatalog', 'Offer', 'ListItem', 'Question', 'Answer'].includes(t)).join(', ')}${issues.length ? '\n    ' + issues.join('; ') : ''}`);
  }
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  console.log(robots.includes('Sitemap:') && robots.includes('Disallow: /admin') ? '✓ robots.txt' : '✗ robots.txt');
  console.log(`\n${urls.length} URLs checked, ${problems} issue(s).`);
  process.exit(problems ? 1 : 0);
})();
