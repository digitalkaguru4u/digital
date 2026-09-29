// Thin fetch wrapper: same-origin cookies, CSRF header, JSON errors.
function readCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

let csrfReady = null;
export async function ensureCsrf() {
  if (readCookie('dg_csrf')) return readCookie('dg_csrf');
  if (!csrfReady) csrfReady = fetch('/api/auth/csrf', { credentials: 'same-origin' }).then((r) => r.json()).then((j) => j.csrfToken);
  return csrfReady;
}

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error || `Request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export async function api(path, { method = 'GET', body, query } = {}) {
  let url = '/api' + path;
  if (query) {
    const qs = new URLSearchParams();
    Object.entries(query).forEach(([k, v]) => {
      if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
      qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
    });
    const s = qs.toString();
    if (s) url += '?' + s;
  }
  const headers = { Accept: 'application/json' };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    headers['X-CSRF-Token'] = await ensureCsrf();
  }
  const res = await fetch(url, { method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: text }; }
  if (res.status === 401 && !path.startsWith('/auth/login')) onUnauthorized();
  if (res.status === 403 && /CSRF/i.test(data.error || '')) csrfReady = null;
  if (!res.ok) throw new ApiError(res.status, data);
  return data;
}

export function downloadUrl(path, query) {
  const qs = new URLSearchParams();
  Object.entries(query || {}).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
    qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
  });
  return '/api' + path + (qs.toString() ? '?' + qs : '');
}
