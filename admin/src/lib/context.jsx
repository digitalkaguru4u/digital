import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { api, setUnauthorizedHandler } from './api';
import { setTimezone } from './format';

/* ───────── Auth ───────── */
const AuthCtx = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    api('/auth/me').then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const login = useCallback(async (email, password) => {
    const r = await api('/auth/login', { method: 'POST', body: { email, password } });
    setUser(r.user);
    return r.user;
  }, []);
  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST' }); } finally { setUser(null); }
  }, []);
  const can = useCallback((perm) => !!user?.role && (user.role.permissions.includes('*') || user.role.permissions.includes(perm)), [user]);

  const value = useMemo(() => ({ user, setUser, ready, login, logout, can }), [user, ready, login, logout, can]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}
export const useAuth = () => useContext(AuthCtx);

/* ───────── Master data (lookups, team, templates) ───────── */
const DataCtx = createContext(null);
export function DataProvider({ children }) {
  const [lookups, setLookups] = useState(null);
  const [team, setTeam] = useState([]);
  const [app, setApp] = useState({ settings: {}, timezone: 'Asia/Kolkata' });

  const refresh = useCallback(async () => {
    const [l, t, a] = await Promise.all([api('/settings/lookups'), api('/users/team'), api('/settings/app')]);
    setTimezone(a.timezone);
    setLookups(l);
    setTeam(t.items);
    setApp(a);
  }, []);
  useEffect(() => { refresh().catch(() => {}); }, [refresh]);

  const helpers = useMemo(() => {
    if (!lookups) return {};
    const by = (list, key = '_id') => Object.fromEntries(list.map((x) => [String(x[key]), x]));
    return {
      statusByKey: by(lookups.statuses, 'key'),
      activeStatuses: lookups.statuses.filter((s) => s.active),
      activeServices: lookups.services.filter((s) => s.active),
      activeSources: lookups.sources.filter((s) => s.active),
      activeLostReasons: lookups.lostReasons.filter((r) => r.active),
      activeFollowupTypes: lookups.followupTypes.filter((t) => t.active),
      followupTypeByKey: by(lookups.followupTypes, 'key'),
    };
  }, [lookups]);

  const value = useMemo(() => ({ lookups, team, app, refresh, ...helpers }), [lookups, team, app, refresh, helpers]);
  // Master data is needed by nearly every screen — render once it is loaded.
  if (!lookups) return <div className="boot"><span className="muted">Loading CRM…</span></div>;
  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}
export const useData = () => useContext(DataCtx);

/* ───────── Toasts ───────── */
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const id = useRef(0);
  const push = useCallback((message, type = 'success') => {
    const t = { id: ++id.current, message, type };
    setToasts((x) => [...x, t]);
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), type === 'error' ? 6000 : 3500);
  }, []);
  const toast = useMemo(() => ({ success: (m) => push(m, 'success'), error: (m) => push(m, 'error'), info: (m) => push(m, 'info') }), [push]);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => <div key={t.id} className={`toast toast--${t.type}`}>{t.message}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
