let TZ = 'Asia/Kolkata';
export const setTimezone = (tz) => { if (tz) TZ = tz; };
export const getTimezone = () => TZ;

const dtf = (opts) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, ...opts });

export function fmtDate(d) {
  if (!d) return '—';
  return dtf({ day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d));
}
export function fmtDateTime(d) {
  if (!d) return '—';
  return dtf({ day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(d));
}
/** Compact date+time for cards: "27 Sept, 12:30 pm" (year only when not this year) */
export function fmtDue(d) {
  if (!d) return '—';
  const sameYear = dtf({ year: 'numeric' }).format(new Date(d)) === dtf({ year: 'numeric' }).format(new Date());
  return dtf({ day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }), hour: 'numeric', minute: '2-digit' }).format(new Date(d));
}
export function fmtTime(d) {
  if (!d) return '';
  return dtf({ hour: 'numeric', minute: '2-digit' }).format(new Date(d));
}
export function fmtShortDay(d) {
  return dtf({ day: '2-digit', month: 'short' }).format(new Date(d));
}
/** A lead's budget as a number (tolerates old { customAmount, estimate } objects). */
export function amountOf(b) {
  if (b === null || b === undefined || b === '') return null;
  if (typeof b === 'object') b = b.customAmount || b.estimate || b.max || b.min || null;
  const n = Number(b);
  return Number.isFinite(n) && n > 0 ? n : null;
}
export function fmtINR(n, { compact = false } = {}) {
  if (n !== null && typeof n === 'object') n = amountOf(n);
  if (n === null || n === undefined || n === '') return '—';
  const v = Number(n);
  if (compact && v >= 100000) return '₹' + (v / 100000).toFixed(v >= 1000000 ? 1 : 2).replace(/\.0+$/, '') + 'L';
  if (compact && v >= 1000) return '₹' + (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return '₹' + v.toLocaleString('en-IN');
}
export function relTime(d) {
  if (!d) return '';
  const diff = (new Date(d).getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (abs < 60) return rtf.format(Math.round(diff), 'second');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), 'day');
  return fmtDate(d);
}
/** YYYY-MM-DD for "today + n days" in the business timezone */
export function dateInTz(offsetDays = 0, base = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(base.getTime() + offsetDays * 86400000));
}
/** Split a Date into {date, time} strings in the business timezone */
export function splitTz(d) {
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(d));
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(d));
  return { date, time };
}
export function isToday(d) { return d && dateInTz(0, new Date(d)) === dateInTz(0); }
export function isPastDay(d) { return d && dateInTz(0, new Date(d)) < dateInTz(0); }

export const PAYMENT_STATUS = { pending: 'Pending', advance_received: 'Advance Received', partially_paid: 'Partially Paid', fully_paid: 'Fully Paid' };
export const PRIORITY = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
export const FORM_LABEL = { hero: 'Home form', contact: 'Contact page', popup: 'Popup', service: 'Service page', quote: 'Quote', whatsapp_quick: 'WhatsApp quick form', footer_cta: 'Footer CTA', pricing: 'Pricing', admin: 'Added by admin', meta_lead_ad: 'Meta Lead Ad', import: 'Imported file' };

export function waNumber(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  return d;
}
export function fillTemplate(tpl, vars) {
  return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] ?? ''));
}
export const initials = (name = '') => name.replace(/\[Demo\]\s*/, '').split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
