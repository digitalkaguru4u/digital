/** Strip HTML tags/control chars from free text before it is stored. */
function cleanText(v) {
  if (v === undefined || v === null) return '';
  return String(v)
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim();
}

/** Normalise an Indian/international phone to its last 10 digits for matching. */
function normalizePhone(v) {
  const digits = String(v || '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function slugify(s) {
  return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

module.exports = { cleanText, normalizePhone, escapeRegex, slugify };
