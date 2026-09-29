/**
 * Digital Guru SVG system — reusable server-side "components".
 *   icon(name)          Lucide-style functional icons (currentColor)
 *   deco(kind, opts)    Decorative shapes: star, sparkle, cross, circle, dots, arrow, underline, blob, squiggle
 *   illo(name)          Brand illustrations (hero + one per service)
 *   logoMark()          Brand mark
 * One illustration language: thick round strokes (#302060), flat fills from the palette,
 * slightly imperfect organic geometry.
 */
const C = {
  ink: '#302060', dark: '#4A3878', purple: '#7040F0', cream: '#F4E8D4', yellow: '#E8D45A',
  pink: '#F4B0B0', lav: '#807CB0', white: '#FFFDF8',
};
const S = `stroke="${C.ink}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"`;
const s = (w = 3.5) => `stroke="${C.ink}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

/* ───────────── icons (24×24, stroke = currentColor) ───────────── */
const ICONS = {
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  whatsapp: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/><path d="M9 8.8c0 3.4 2.8 6.2 6.2 6.2l1.1-1.5-2.1-1-.8.8a4.3 4.3 0 0 1-2.2-2.2l.8-.8-1-2.1z"/>',
  arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="m22 7-10 6L2 7"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/>',
  gauge: '<path d="m12 14 4-4"/><path d="M3.3 19a10 10 0 1 1 17.4 0"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  heart: '<path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7z"/>',
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v18H6.5A2.5 2.5 0 0 1 4 18.5"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  tool: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9z"/>',
  sparkles: '<path d="M12 3 13.9 8.1 19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17v4M17 19h4M5 3v4M3 5h4"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.6A2 2 0 0 0 13.7 6H8.3a2 2 0 0 0-1.6.8L4 10l-1.5.4C1.7 10.6 1 11.4 1 12.3V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/><path d="M9 17h6"/>',
  star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
  quote: '<path d="M3 21c3 0 7-1 7-8V5c0-1.3-.8-2-2-2H4c-1.3 0-2 .8-2 2v6c0 1.3.8 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .9-1 2v3c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.3-.8-2-2-2h-4c-1.3 0-2 .8-2 2v6c0 1.3.8 2 2 2h.8c0 2.3.2 4-2.8 4v3c0 1 0 1 1 1z"/>',
  code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  palette: '<circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h2A5.6 5.6 0 0 0 22 11c0-5-4.5-9-10-9z"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2 2h3l2.7 12.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/>',
  trending: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
};
const SERVICE_ICON = {
  'website-development': 'code', 'website-design': 'palette', seo: 'search', 'google-ads': 'megaphone', 'meta-ads': 'heart',
  'social-media-marketing': 'users', 'lead-generation': 'target', branding: 'sparkles', 'ecommerce-development': 'cart',
  'performance-marketing': 'trending', 'marketing-automation': 'zap',
};

function icon(name, { size = 20, cls = '', stroke = 2.2 } = {}) {
  const body = ICONS[name] || ICONS.sparkles;
  return `<svg class="ico ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

/* ───────────── decorative shapes ───────────── */
function deco(kind, { color = C.yellow, size = 32, cls = '', style = '' } = {}) {
  const wrap = (vb, body) => `<svg class="deco deco-${kind} ${cls}" style="${style}" width="${size}" height="${size}" viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
  switch (kind) {
    case 'star': // four-point sparkle star ✦
      return wrap('0 0 40 40', `<path d="M20 2c1.6 9.2 5.3 13.5 18 18-12.7 4.5-16.4 8.8-18 18-1.6-9.2-5.3-13.5-18-18C14.7 15.5 18.4 11.2 20 2z" fill="${color}" ${s(2.5)}/>`);
    case 'sparkle':
      return wrap('0 0 40 40', `<g fill="none" stroke="${color}" stroke-width="3.5" stroke-linecap="round"><path d="M20 4v10M20 26v10M4 20h10M26 20h10"/><path d="M9 9l5 5M26 26l5 5M31 9l-5 5M14 26l-5 5" opacity=".55"/></g>`);
    case 'cross':
      return wrap('0 0 40 40', `<path d="M10 10l20 20M30 10 10 30" stroke="${color}" stroke-width="5" stroke-linecap="round"/>`);
    case 'circle':
      return wrap('0 0 40 40', `<circle cx="20" cy="20" r="15" fill="none" stroke="${color}" stroke-width="4"/>`);
    case 'dot':
      return wrap('0 0 40 40', `<circle cx="20" cy="20" r="14" fill="${color}"/>`);
    case 'dots': {
      let d = '';
      for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) d += `<circle cx="${6 + x * 14}" cy="${6 + y * 14}" r="2.6"/>`;
      return wrap('0 0 68 68', `<g fill="${color}">${d}</g>`);
    }
    case 'arrow': // hand-drawn curved arrow
      return `<svg class="deco deco-arrow ${cls}" style="${style}" width="${size}" height="${size * 0.6}" viewBox="0 0 120 72" aria-hidden="true" focusable="false"><path d="M6 60C26 18 70 8 104 26" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round"/><path d="M90 14l16 12-18 8" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case 'underline':
      return `<svg class="deco deco-underline ${cls}" style="${style}" viewBox="0 0 300 24" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M4 16C64 6 150 4 296 10M40 20c60-6 140-8 220-4" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/></svg>`;
    case 'squiggle':
      return `<svg class="deco deco-squiggle ${cls}" style="${style}" width="${size}" height="${size / 3}" viewBox="0 0 120 40" aria-hidden="true" focusable="false"><path d="M4 22c10-16 20-16 28 0s18 16 28 0 18-16 28 0 18 16 28 0" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/></svg>`;
    case 'blob':
      return `<svg class="deco deco-blob ${cls}" style="${style}" viewBox="0 0 600 560" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M318 22c86-8 170 30 222 104 50 72 62 170 28 250-34 82-116 142-206 160-92 18-196-4-262-70C34 400 8 300 30 210 52 118 122 52 204 32c38-9 76-8 114-10z" fill="${color}"/></svg>`;
    default:
      return '';
  }
}

/* ───────────── logo ───────────── */
function logoMark(size = 40) {
  return `<svg class="logo-mark" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M24 3c11 0 21 7 21 20 0 13-9 22-22 22C10 45 3 36 3 24 3 11 13 3 24 3z" fill="${C.purple}"/><path d="M24 11c1.1 6.6 3.8 9.6 12 12.5-8.2 2.9-10.9 5.9-12 12.5-1.1-6.6-3.8-9.6-12-12.5 8.2-2.9 10.9-5.9 12-12.5z" fill="${C.yellow}" stroke="${C.ink}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}

/* ───────────── illustration helpers ───────────── */
const sparkle = (x, y, r = 12, fill = C.yellow) =>
  `<path transform="translate(${x} ${y}) scale(${r / 18})" d="M0-18c1.4 8.2 4.8 12 16 18-11.2 6-14.6 9.8-16 18-1.4-8.2-4.8-12-16-18 11.2-6 14.6-9.8 16-18z" fill="${fill}" ${s(((2.8 * 18) / r).toFixed(2))}/>`;
const plus = (x, y, r = 8, color = C.lav) => `<path d="M${x - r} ${y}h${r * 2}M${x} ${y - r}v${r * 2}" stroke="${color}" stroke-width="4" stroke-linecap="round"/>`;
const blobBg = (fill = C.cream, t = '') =>
  `<path ${t} d="M188 20c62-6 118 18 146 70 28 50 22 116-12 160-34 44-92 58-150 52-58-6-112-34-140-84S14 106 50 64C82 26 132 26 188 20z" fill="${fill}"/>`;
const wrapIllo = (vb, title, body) =>
  `<svg class="illo" viewBox="${vb}" role="img" aria-label="${title}" xmlns="http://www.w3.org/2000/svg"><title>${title}</title>${body}</svg>`;

/* ───────────── HERO ───────────── */
function heroIllo() {
  const body = `
  <path d="M322 30c96-6 178 36 222 116 42 78 34 178-16 250-52 74-150 118-246 108-96-10-190-66-226-150C22 272 44 170 106 106 162 48 238 36 322 30z" fill="${C.cream}"/>
  <circle cx="470" cy="92" r="46" fill="${C.yellow}"/>
  ${plus(66, 150, 9)} ${plus(560, 300, 8, C.purple)}
  <g fill="${C.lav}"><circle cx="120" cy="470" r="4"/><circle cx="136" cy="470" r="4"/><circle cx="152" cy="470" r="4"/><circle cx="120" cy="486" r="4"/><circle cx="136" cy="486" r="4"/><circle cx="152" cy="486" r="4"/></g>

  <!-- dashed flow arrow -->
  <path d="M196 356C206 366 212 372 220 380" fill="none" stroke="${C.lav}" stroke-width="3" stroke-dasharray="2 9" stroke-linecap="round"/>

  <!-- browser window -->
  <g transform="translate(34 58) rotate(-6)"><g class="fl fl-1">
    <rect width="176" height="116" rx="14" fill="${C.white}" ${S}/>
    <path d="M0 26h176" ${S}/>
    <circle cx="16" cy="13" r="4.5" fill="${C.pink}"/><circle cx="30" cy="13" r="4.5" fill="${C.yellow}"/><circle cx="44" cy="13" r="4.5" fill="${C.lav}"/>
    <rect x="14" y="38" width="70" height="46" rx="8" fill="${C.yellow}" ${s(3)}/>
    <path d="M24 70l14-14 10 10 8-8 16 16" fill="none" ${s(3)}/>
    <path d="M96 44h62M96 58h48M96 72h56" ${s(3.5)} stroke="${C.lav}"/>
    <rect x="96" y="86" width="50" height="16" rx="8" fill="${C.purple}"/>
  </g></g>

  <!-- megaphone -->
  <g transform="translate(236 96) rotate(-14)"><g class="fl fl-2">
    <path d="M0 22h16l46-22v62L16 40H0z" fill="${C.yellow}" ${S}/>
    <path d="M8 40l6 24h12l-4-24" fill="${C.white}" ${S}/>
    <path d="M76 12l14-8M78 31h16M76 50l14 8" ${S} stroke="${C.purple}"/>
  </g></g>

  <!-- analytics card -->
  <g transform="translate(392 52) rotate(4)"><g class="fl fl-3">
    <rect width="168" height="124" rx="16" fill="${C.white}" ${S}/>
    <path d="M16 22h56" ${s(4)} stroke="${C.lav}"/>
    <rect x="18" y="80" width="20" height="28" rx="5" fill="${C.lav}" ${s(3)}/>
    <rect x="48" y="66" width="20" height="42" rx="5" fill="${C.yellow}" ${s(3)}/>
    <rect x="78" y="54" width="20" height="54" rx="5" fill="${C.pink}" ${s(3)}/>
    <rect x="108" y="38" width="20" height="70" rx="5" fill="${C.purple}" ${s(3)}/>
    <path d="M20 66 56 50l30-6 46-26" fill="none" ${s(3.5)}/>
    <path d="M120 16l14 2-4 13" fill="none" ${s(3.5)}/>
  </g></g>

  <!-- search bar -->
  <g transform="translate(20 200) rotate(3)"><g class="fl fl-2">
    <rect width="182" height="48" rx="24" fill="${C.white}" ${S}/>
    <circle cx="26" cy="23" r="9" fill="none" ${s(3.5)}/><path d="M33 30l7 7" ${s(3.5)}/>
    <path d="M52 24h78" ${s(4)} stroke="${C.lav}"/>
    <rect x="140" y="12" width="30" height="24" rx="12" fill="${C.purple}"/>
    <path d="M150 24h10m-4-4 4 4-4 4" stroke="${C.white}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </g></g>

  <!-- social card -->
  <g transform="translate(448 214) rotate(8)"><g class="fl fl-1">
    <rect width="118" height="104" rx="18" fill="${C.pink}" ${S}/>
    <circle cx="24" cy="24" r="10" fill="${C.white}" ${s(3)}/>
    <path d="M42 20h40M42 30h26" ${s(3.5)}/>
    <path d="M59 90s-26-14-26-31c0-8 6-13 13-13 5 0 10 3 13 8 3-5 8-8 13-8 7 0 13 5 13 13 0 17-26 31-26 31z" fill="${C.purple}" ${s(3)}/>
  </g></g>

  <!-- desk -->
  <path d="M70 436h470" ${s(4)}/>
  <rect x="76" y="424" width="458" height="16" rx="8" fill="${C.white}" ${S}/>

  <!-- person -->
  <g>
    <path d="M196 424c0-70 34-106 104-106s104 36 104 106z" fill="${C.purple}" ${S}/>
    <path d="M276 330c8 16 40 16 48 0" fill="none" ${s(3.5)}/>
    <rect x="288" y="292" width="24" height="32" rx="10" fill="${C.pink}" ${S}/>
    <circle cx="300" cy="252" r="42" fill="${C.pink}" ${S}/>
    <circle cx="300" cy="200" r="17" fill="${C.ink}"/>
    <path d="M258 254c-4-34 18-54 42-54s46 20 42 54c-8-18-22-28-42-28s-34 10-42 28z" fill="${C.ink}"/>
    <circle cx="285" cy="258" r="10" fill="${C.white}" ${s(3)}/><circle cx="315" cy="258" r="10" fill="${C.white}" ${s(3)}/>
    <path d="M295 258h10" ${s(3)}/>
    <circle cx="286" cy="259" r="3.2" fill="${C.ink}"/><circle cx="316" cy="259" r="3.2" fill="${C.ink}"/>
    <path d="M290 280q10 8 20 0" fill="none" ${s(3.2)}/>
    <circle cx="270" cy="276" r="5" fill="${C.purple}" opacity=".22"/><circle cx="330" cy="276" r="5" fill="${C.purple}" opacity=".22"/>
  </g>

  <!-- laptop (back view) -->
  <path d="M206 424l8-86a10 10 0 0 1 10-9h152a10 10 0 0 1 10 9l8 86z" fill="${C.ink}" ${S}/>
  ${sparkle(300, 378, 16)}
  <ellipse cx="216" cy="414" rx="16" ry="11" fill="${C.purple}" ${S}/><ellipse cx="384" cy="414" rx="16" ry="11" fill="${C.purple}" ${S}/>

  <!-- mug -->
  <g transform="translate(118 378)"><path d="M0 0h36v34a12 12 0 0 1-12 12H12A12 12 0 0 1 0 34z" fill="${C.yellow}" ${S}/><path d="M36 10h6a10 10 0 0 1 0 20h-6" fill="none" ${S}/><path class="steam" d="M12-10c-4-6 4-10 0-16M24-10c-4-6 4-10 0-16" fill="none" ${s(3)} stroke="${C.lav}"/></g>

  <!-- funnel with incoming leads -->
  <g transform="translate(452 346)"><g class="fl fl-3">
    <circle cx="20" cy="-14" r="6" fill="${C.yellow}" ${s(2.5)}/><circle cx="42" cy="-24" r="6" fill="${C.pink}" ${s(2.5)}/><circle cx="62" cy="-10" r="6" fill="${C.white}" ${s(2.5)}/>
    <path d="M0 0h84L54 36v26l-24 14V36z" fill="${C.lav}" ${S}/>
    <path d="M10 12h64" ${s(3)} stroke="${C.white}"/>
  </g></g>

  <!-- lead notification -->
  <g transform="translate(14 288)"><g class="fl fl-1">
    <rect width="188" height="64" rx="18" fill="${C.white}" ${S}/>
    <circle cx="32" cy="32" r="16" fill="${C.yellow}" ${s(3)}/>
    <path d="M32 26a4 4 0 1 1 0 .1M24 42c2-6 14-6 16 0" fill="none" ${s(2.8)}/>
    <text x="58" y="29" font-family="'Plus Jakarta Sans',Poppins,sans-serif" font-weight="800" font-size="15" fill="${C.ink}">New lead!</text>
    <text x="58" y="47" font-family="'Plus Jakarta Sans',Poppins,sans-serif" font-weight="600" font-size="11.5" fill="${C.lav}">Website enquiry · SEO</text>
    <circle cx="170" cy="14" r="11" fill="${C.purple}" ${s(3)}/><path d="M165 14l4 4 6-7" fill="none" stroke="${C.white}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
  </g></g>

  <!-- chat bubble -->
  <g transform="translate(404 128)"><g class="fl fl-2">
    <path d="M0 14A14 14 0 0 1 14 0h58a14 14 0 0 1 14 14v20a14 14 0 0 1-14 14H26l-16 12 2-12A14 14 0 0 1 0 34z" fill="${C.yellow}" ${S}/>
    <circle cx="28" cy="24" r="4" fill="${C.ink}"/><circle cx="43" cy="24" r="4" fill="${C.ink}"/><circle cx="58" cy="24" r="4" fill="${C.ink}"/>
  </g></g>

  ${sparkle(372, 38, 13)} ${sparkle(560, 196, 11, C.pink)} ${sparkle(34, 188, 10)} ${sparkle(544, 478, 14)} ${sparkle(206, 30, 9, C.purple)}
  `;
  return wrapIllo('0 0 600 520', 'Illustration of a Digital Guru marketer at a laptop surrounded by a website, search bar, ads megaphone, analytics chart, social post and incoming lead notifications', body);
}

/* ───────────── SERVICE ILLUSTRATIONS (360×300) ───────────── */
const ILLOS = {
  webdev: () => wrapIllo('0 0 360 300', 'Website development illustration: browser window with code and UI components', `
    ${blobBg()}
    <g transform="translate(50 58)"><rect width="230" height="160" rx="16" fill="${C.white}" ${S}/><path d="M0 32h230" ${S}/>
      <circle cx="18" cy="16" r="5" fill="${C.pink}"/><circle cx="34" cy="16" r="5" fill="${C.yellow}"/><circle cx="50" cy="16" r="5" fill="${C.lav}"/>
      <rect x="18" y="48" width="96" height="92" rx="10" fill="${C.ink}" ${s(3)}/>
      <path d="M42 80l-12 12 12 12M90 80l12 12-12 12M70 74l-10 38" fill="none" stroke="${C.yellow}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M130 56h80M130 72h60M130 88h72" ${s(4)} stroke="${C.lav}"/>
      <rect x="130" y="108" width="70" height="26" rx="13" fill="${C.purple}" ${s(3)}/></g>
    <g class="fl fl-1" ><rect x="232" y="30" width="96" height="52" rx="14" fill="${C.yellow}" ${S}/><rect x="248" y="46" width="40" height="20" rx="10" fill="${C.white}" ${s(3)}/><circle cx="278" cy="56" r="7" fill="${C.purple}"/></g>
    <g class="fl fl-2"><rect x="24" y="196" width="104" height="60" rx="14" fill="${C.pink}" ${S}/><path d="M40 216h60M40 232h40" ${s(4)}/></g>
    <g class="fl fl-3"><path d="M246 188l40 16-18 6-6 18z" fill="${C.white}" ${S}/></g>
    ${sparkle(318, 140, 12)} ${plus(40, 40, 8)} ${sparkle(170, 262, 10, C.purple)}`),

  seo: () => wrapIllo('0 0 360 300', 'SEO illustration: magnifying glass over search results with a rising graph', `
    ${blobBg()}
    <g transform="translate(40 50)"><rect width="200" height="176" rx="16" fill="${C.white}" ${S}/>
      <rect x="16" y="16" width="168" height="30" rx="15" fill="${C.cream}" ${s(3)}/><circle cx="34" cy="31" r="6" fill="none" ${s(3)}/><path d="M38 35l5 5" ${s(3)}/>
      <rect x="16" y="60" width="168" height="34" rx="8" fill="${C.yellow}" ${s(3)}/><path d="M28 72h80M28 84h120" ${s(3)}/>
      <path d="M28 110h90M28 122h130M28 144h70M28 156h110" ${s(3.5)} stroke="${C.lav}"/></g>
    <g class="fl fl-1"><circle cx="248" cy="130" r="50" fill="${C.purple}" fill-opacity=".14" ${s(6)}/><path d="M284 166l40 40" stroke="${C.ink}" stroke-width="14" stroke-linecap="round"/><path d="M226 110a28 28 0 0 1 22-10" fill="none" stroke="${C.white}" stroke-width="5" stroke-linecap="round"/></g>
    <g class="fl fl-2"><rect x="238" y="28" width="96" height="62" rx="14" fill="${C.white}" ${S}/><path d="M252 74l20-16 14 8 32-26" fill="none" ${s(4)} stroke="${C.purple}"/><path d="M306 38l14 2-2 13" fill="none" ${s(4)} stroke="${C.purple}"/></g>
    <g class="fl fl-3"><rect x="30" y="240" width="92" height="30" rx="15" fill="${C.pink}" ${s(3)}/><path d="M46 255h58" ${s(3.5)}/></g>
    ${sparkle(150, 26, 12)} ${plus(318, 238, 9, C.purple)} ${sparkle(200, 262, 9)}`),

  ads: () => wrapIllo('0 0 360 300', 'Advertising illustration: megaphone with campaign cards, clicks and a conversion graph', `
    ${blobBg()}
    <g transform="translate(58 94) rotate(-10)"><path d="M0 34h26l90-40v124L26 78H0z" fill="${C.yellow}" ${S}/><rect x="-12" y="30" width="22" height="52" rx="8" fill="${C.purple}" ${S}/><path d="M18 78l10 42h22l-8-42" fill="${C.white}" ${S}/>
      <path d="M134 14l22-12M138 58h26M134 100l22 12" ${s(5)} stroke="${C.purple}"/></g>
    <g class="fl fl-1"><rect x="222" y="26" width="112" height="66" rx="14" fill="${C.white}" ${S}/><rect x="236" y="40" width="30" height="30" rx="8" fill="${C.pink}" ${s(3)}/><path d="M276 46h44M276 60h30" ${s(3.5)}/><rect x="276" y="72" width="40" height="10" rx="5" fill="${C.purple}"/></g>
    <g class="fl fl-2"><rect x="214" y="196" width="122" height="72" rx="14" fill="${C.white}" ${S}/><path d="M228 252l24-18 18 10 32-28" fill="none" ${s(4)} stroke="${C.purple}"/><circle cx="302" cy="216" r="6" fill="${C.yellow}" ${s(3)}/></g>
    <g class="fl fl-3"><path d="M190 150l34 12-14 6-4 16z" fill="${C.white}" ${S}/><path d="M178 136l-8-8M196 130v-12M166 150h-12" ${s(3.5)} stroke="${C.purple}"/></g>
    <g class="fl fl-1"><rect x="36" y="222" width="116" height="40" rx="20" fill="${C.purple}" ${S}/><circle cx="58" cy="242" r="9" fill="${C.yellow}"/><path d="M76 242h58" stroke="${C.white}" stroke-width="4" stroke-linecap="round"/></g>
    ${sparkle(40, 40, 12)} ${sparkle(190, 30, 9, C.pink)} ${plus(332, 150, 8)}`),

  social: () => wrapIllo('0 0 360 300', 'Social media illustration: phone with a post, hearts, comments and share icons', `
    ${blobBg()}
    <g transform="translate(120 30)"><rect width="124" height="236" rx="24" fill="${C.ink}" ${S}/><rect x="10" y="14" width="104" height="208" rx="16" fill="${C.white}"/>
      <circle cx="30" cy="36" r="10" fill="${C.pink}" ${s(3)}/><path d="M46 32h46M46 42h28" ${s(3)}/>
      <rect x="20" y="56" width="84" height="84" rx="12" fill="${C.yellow}" ${s(3)}/><path d="M34 124l20-24 16 14 12-10 14 20" fill="none" ${s(3)}/><circle cx="84" cy="76" r="8" fill="${C.white}" ${s(3)}/>
      <path d="M26 162c0 0-6-4-6-8 0-2 2-4 4-4 1 0 2 1 2 2 0-1 1-2 2-2 2 0 4 2 4 4 0 4-6 8-6 8z" fill="${C.purple}" ${s(2)}/><path d="M44 152h52M24 176h72M24 190h50" ${s(3)} stroke="${C.lav}"/></g>
    <g class="fl fl-1"><path d="M58 110s-34-18-34-40c0-10 8-17 17-17 7 0 13 4 17 10 4-6 10-10 17-10 9 0 17 7 17 17 0 22-34 40-34 40z" fill="${C.pink}" ${S}/></g>
    <g class="fl fl-2"><path d="M266 62a16 16 0 0 1 16-16h40a16 16 0 0 1 16 16v18a16 16 0 0 1-16 16h-30l-16 12 2-12a16 16 0 0 1-12-16z" fill="${C.yellow}" ${S}/><path d="M284 66h36M284 78h22" ${s(3.5)}/></g>
    <g class="fl fl-3"><circle cx="296" cy="196" r="30" fill="${C.purple}" ${S}/><circle cx="286" cy="196" r="5" fill="${C.white}"/><circle cx="308" cy="186" r="5" fill="${C.white}"/><circle cx="308" cy="206" r="5" fill="${C.white}"/><path d="M290 194l14-6M290 198l14 6" stroke="${C.white}" stroke-width="3"/></g>
    <g class="fl fl-2"><rect x="30" y="190" width="72" height="52" rx="14" fill="${C.white}" ${S}/><path d="M48 216l8 8 16-16" fill="none" ${s(4)} stroke="${C.purple}"/></g>
    ${sparkle(96, 30, 11)} ${sparkle(330, 130, 10, C.purple)} ${plus(262, 272, 8)}`),

  leadgen: () => wrapIllo('0 0 360 300', 'Lead generation illustration: funnel converting incoming visitors into customer cards', `
    ${blobBg()}
    <g class="fl fl-1"><circle cx="112" cy="36" r="12" fill="${C.pink}" ${s(3)}/><circle cx="160" cy="24" r="12" fill="${C.yellow}" ${s(3)}/><circle cx="208" cy="34" r="12" fill="${C.white}" ${s(3)}/><circle cx="250" cy="22" r="12" fill="${C.lav}" ${s(3)}/></g>
    <path d="M86 64h200l-70 78v56l-60 30v-86z" fill="${C.purple}" ${S}/>
    <path d="M110 88h152" stroke="${C.white}" stroke-width="4" stroke-linecap="round" opacity=".7"/><path d="M134 112h104" stroke="${C.white}" stroke-width="4" stroke-linecap="round" opacity=".5"/>
    <g class="fl fl-2"><rect x="200" y="206" width="136" height="60" rx="16" fill="${C.white}" ${S}/><circle cx="226" cy="236" r="14" fill="${C.yellow}" ${s(3)}/><path d="M248 228h66M248 244h40" ${s(3.5)}/><circle cx="322" cy="214" r="10" fill="${C.purple}" ${s(3)}/><path d="M317 214l4 4 5-6" stroke="${C.white}" stroke-width="2.5" fill="none" stroke-linecap="round"/></g>
    <g class="fl fl-3"><rect x="24" y="170" width="92" height="76" rx="14" fill="${C.white}" ${S}/><rect x="38" y="210" width="12" height="22" rx="3" fill="${C.lav}"/><rect x="56" y="198" width="12" height="34" rx="3" fill="${C.yellow}"/><rect x="74" y="186" width="12" height="46" rx="3" fill="${C.purple}"/></g>
    <path d="M186 236c0 20 0 26 6 30" fill="none" stroke="${C.lav}" stroke-width="3" stroke-dasharray="2 8" stroke-linecap="round"/>
    ${sparkle(310, 110, 13)} ${sparkle(40, 90, 10, C.purple)} ${plus(160, 280, 8)}`),

  branding: () => wrapIllo('0 0 360 300', 'Branding illustration: colour palette, typography specimen, logo shapes and a pen tool', `
    ${blobBg()}
    <g transform="translate(40 60)"><path d="M100 0C46 0 0 36 0 86c0 44 36 72 76 72 14 0 18-10 14-20-4-12 2-22 16-22h30c30 0 56-18 56-50C192 30 150 0 100 0z" fill="${C.white}" ${S}/>
      <circle cx="46" cy="60" r="14" fill="${C.purple}" ${s(3)}/><circle cx="86" cy="32" r="14" fill="${C.yellow}" ${s(3)}/><circle cx="136" cy="38" r="14" fill="${C.pink}" ${s(3)}/><circle cx="42" cy="108" r="14" fill="${C.lav}" ${s(3)}/></g>
    <g class="fl fl-1"><rect x="228" y="30" width="104" height="96" rx="16" fill="${C.yellow}" ${S}/><text x="246" y="98" font-family="'Plus Jakarta Sans',Poppins,sans-serif" font-weight="800" font-size="56" fill="${C.ink}">Aa</text></g>
    <g class="fl fl-2"><circle cx="262" cy="206" r="34" fill="${C.purple}" ${S}/><rect x="282" y="196" width="50" height="50" rx="10" fill="${C.pink}" ${S}/><path d="M300 180l18 30h-36z" fill="${C.cream}" ${S}/></g>
    <g class="fl fl-3" transform="translate(94 206) rotate(-30)"><rect width="18" height="80" rx="6" fill="${C.ink}" ${s(3)}/><path d="M0 80l9 22 9-22z" fill="${C.yellow}" ${s(3)}/></g>
    ${sparkle(200, 40, 12)} ${sparkle(40, 250, 10, C.purple)} ${plus(180, 270, 8)}`),

  ecommerce: () => wrapIllo('0 0 360 300', 'E-commerce illustration: shopping bag, product cards, cart, payment card and order notification', `
    ${blobBg()}
    <g transform="translate(116 70)"><path d="M0 40h128l-10 150H10z" fill="${C.purple}" ${S}/><path d="M36 56V36a28 28 0 0 1 56 0v20" fill="none" ${s(5)}/>
      ${sparkle(64, 118, 20)}</g>
    <g class="fl fl-1"><rect x="22" y="56" width="84" height="104" rx="14" fill="${C.white}" ${S}/><rect x="34" y="68" width="60" height="50" rx="10" fill="${C.pink}" ${s(3)}/><path d="M36 134h40M36 146h24" ${s(3.5)}/></g>
    <g class="fl fl-2"><rect x="256" y="40" width="84" height="104" rx="14" fill="${C.white}" ${S}/><rect x="268" y="52" width="60" height="50" rx="10" fill="${C.yellow}" ${s(3)}/><path d="M270 118h40M270 130h24" ${s(3.5)}/></g>
    <g class="fl fl-3"><rect x="228" y="198" width="112" height="70" rx="12" fill="${C.yellow}" ${S}/><path d="M228 220h112" stroke="${C.ink}" stroke-width="8"/><path d="M242 248h32" ${s(4)}/></g>
    <g class="fl fl-1"><rect x="18" y="206" width="130" height="54" rx="16" fill="${C.white}" ${S}/><circle cx="42" cy="233" r="12" fill="${C.purple}" ${s(3)}/><path d="M36 233l4 4 7-8" stroke="${C.white}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M62 226h66M62 240h44" ${s(3.5)}/></g>
    ${sparkle(212, 26, 11)} ${plus(334, 170, 8, C.purple)}`),

  performance: () => wrapIllo('0 0 360 300', 'Performance marketing illustration: gauge, rising revenue graph and target', `
    ${blobBg()}
    <g transform="translate(60 70)"><path d="M0 110a110 110 0 0 1 220 0" fill="${C.white}" ${S}/><path d="M22 110a88 88 0 0 1 44-76" fill="none" stroke="${C.pink}" stroke-width="16"/><path d="M70 30a88 88 0 0 1 80 0" fill="none" stroke="${C.yellow}" stroke-width="16"/><path d="M154 34a88 88 0 0 1 44 76" fill="none" stroke="${C.purple}" stroke-width="16"/>
      <path class="needle" d="M110 110l58-52" ${s(6)}/><circle cx="110" cy="110" r="12" fill="${C.ink}"/><path d="M-10 110h240" ${S}/></g>
    <g class="fl fl-1"><rect x="208" y="196" width="128" height="76" rx="14" fill="${C.white}" ${S}/><path d="M222 256l26-20 20 10 40-30" fill="none" ${s(4)} stroke="${C.purple}"/><path d="M294 214l16 2-2 15" fill="none" ${s(4)} stroke="${C.purple}"/></g>
    <g class="fl fl-2"><circle cx="70" cy="232" r="34" fill="${C.white}" ${S}/><circle cx="70" cy="232" r="20" fill="${C.pink}" ${s(3)}/><circle cx="70" cy="232" r="7" fill="${C.purple}"/><path d="M70 232l40-40M100 190h12v12" ${s(4)}/></g>
    ${sparkle(310, 50, 13)} ${sparkle(40, 50, 10, C.purple)} ${plus(170, 272, 8)}`),

  automation: () => wrapIllo('0 0 360 300', 'Marketing automation illustration: connected workflow nodes, gears and message bubbles', `
    ${blobBg()}
    <path d="M92 90c40 0 40 60 88 60s50-60 90-60M180 150v60" fill="none" stroke="${C.lav}" stroke-width="4" stroke-dasharray="3 9" stroke-linecap="round"/>
    <g class="fl fl-1"><rect x="36" y="58" width="96" height="62" rx="16" fill="${C.yellow}" ${S}/><path d="M56 82h52M56 96h32" ${s(3.5)}/></g>
    <g class="fl fl-2"><rect x="232" y="58" width="96" height="62" rx="16" fill="${C.pink}" ${S}/><circle cx="256" cy="89" r="10" fill="${C.white}" ${s(3)}/><path d="M274 82h36M274 96h24" ${s(3.5)}/></g>
    <g class="gear"><circle cx="180" cy="150" r="30" fill="${C.purple}" ${S}/><circle cx="180" cy="150" r="11" fill="${C.white}" ${s(3)}/>
      <path d="M180 112v10M180 178v10M142 150h10M208 150h10M153 123l7 7M200 170l7 7M207 123l-7 7M160 170l-7 7" ${s(6)}/></g>
    <g class="fl fl-3"><rect x="118" y="212" width="124" height="56" rx="16" fill="${C.white}" ${S}/><circle cx="142" cy="240" r="12" fill="${C.purple}" ${s(3)}/><path d="M137 240l4 4 7-8" stroke="${C.white}" stroke-width="2.6" fill="none" stroke-linecap="round"/><path d="M162 232h62M162 246h40" ${s(3.5)}/></g>
    ${sparkle(318, 200, 12)} ${sparkle(40, 220, 10, C.purple)} ${plus(180, 40, 8)}`),
};

/* ───────────── portfolio art (card headers) ───────────── */
const PORTFOLIO = {
  building: () => `<rect x="120" y="60" width="90" height="150" rx="10" fill="${C.white}" ${S}/><rect x="210" y="100" width="70" height="110" rx="10" fill="${C.yellow}" ${S}/>${[80, 110, 140, 170].map((y) => `<rect x="138" y="${y}" width="18" height="16" rx="3" fill="${C.lav}"/><rect x="172" y="${y}" width="18" height="16" rx="3" fill="${C.lav}"/>`).join('')}<path d="M90 210h220" ${S}/>${sparkle(300, 60, 14)}`,
  bag: () => `<path d="M140 90h120l-10 120H150z" fill="${C.white}" ${S}/><path d="M170 100V84a30 30 0 0 1 60 0v16" fill="none" ${s(5)}/>${sparkle(200, 150, 20)}<rect x="270" y="130" width="56" height="70" rx="10" fill="${C.purple}" ${S}/>${sparkle(100, 70, 12, C.white)}`,
  pin: () => `<path d="M200 214s-60-56-60-104a60 60 0 0 1 120 0c0 48-60 104-60 104z" fill="${C.purple}" ${S}/><circle cx="200" cy="110" r="22" fill="${C.yellow}" ${S}/><path d="M110 214h180" ${S}/>${sparkle(300, 80, 14, C.white)}`,
  cap: () => `<path d="M200 70l110 44-110 44-110-44z" fill="${C.purple}" ${S}/><path d="M140 136v40c0 16 30 30 60 30s60-14 60-30v-40" fill="${C.white}" ${S}/><path d="M300 118v56" ${S}/><circle cx="300" cy="180" r="8" fill="${C.yellow}" ${S}/>${sparkle(110, 70, 13)}`,
};
function portfolioArt(name, title) {
  return wrapIllo('0 0 400 240', title, (PORTFOLIO[name] || PORTFOLIO.building)());
}

function illo(name) {
  if (name === 'hero') return heroIllo();
  return (ILLOS[name] || ILLOS.webdev)();
}

module.exports = { C, icon, deco, illo, logoMark, portfolioArt, SERVICE_ICON };
