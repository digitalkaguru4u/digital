import { Suspense, useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, Columns3, CalendarClock, ListChecks, BadgeCheck, Settings, Wallet, Bell, BellRing, Search, Plus, LogOut, Menu, X, ExternalLink, Sparkles, Repeat, UserPlus, AlarmClock, IndianRupee, XCircle, Upload, Sun, AlertTriangle, Megaphone, CheckCheck } from 'lucide-react';
import { useAuth, useData } from '../lib/context';
import { api } from '../lib/api';
import { relTime } from '../lib/format';
import { Avatar, Button, Spinner } from './ui';
import { LeadFormModal } from './modals';
import { pushState, registerSW, syncPushSubscription } from '../lib/push';

const N_ICON = { new_lead: Sparkles, meta_lead: Megaphone, repeat_enquiry: Repeat, assigned: UserPlus, followup_reminder: AlarmClock, task_due: ListChecks, booked: BadgeCheck, payment: IndianRupee, lost: XCircle, import: Upload, daily_digest: Sun, integration_error: AlertTriangle, test: BellRing };

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/leads', label: 'Leads', icon: Users },
  { to: '/pipeline', label: 'Pipeline', icon: Columns3 },
  { to: '/followups', label: 'Follow-ups', icon: CalendarClock, badge: 'followups' },
  { to: '/pipeline-value', label: 'Pipeline value', icon: Wallet },
  { to: '/booked', label: 'Booked', icon: BadgeCheck },
  { to: '/settings', label: 'Settings', icon: Settings },
];

function Logo() {
  return (
    <svg width="34" height="34" viewBox="0 0 48 48" aria-hidden="true"><path d="M24 3c11 0 21 7 21 20 0 13-9 22-22 22C10 45 3 36 3 24 3 11 13 3 24 3z" fill="#7040F0" /><path d="M24 11c1.1 6.6 3.8 9.6 12 12.5-8.2 2.9-10.9 5.9-12 12.5-1.1-6.6-3.8-9.6-12-12.5 8.2-2.9 10.9-5.9 12-12.5z" fill="#E8D45A" stroke="#302060" strokeWidth="2" strokeLinejoin="round" /></svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { lookups } = useData();
  const nav = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [bell, setBell] = useState(false);
  const [notes, setNotes] = useState({ items: [], unread: 0 });
  const [counts, setCounts] = useState({ followups: 0 });
  const [newLead, setNewLead] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const [push, setPush] = useState('unsupported');

  const loadNotes = () => api('/notifications', { query: { limit: 30 } }).then(setNotes).catch(() => {});

  // Poll notifications + sidebar counters; refresh instantly when a push arrives
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (!alive) return;
      loadNotes();
      api('/followups', { query: { bucket: 'today', limit: 1 } })
        .then((f) => alive && setCounts({ followups: f.counts.today + f.counts.overdue })).catch(() => {});
    };
    load();
    const t = setInterval(load, 30000);
    const onMsg = (e) => { if (e.data?.type === 'dg-notification') load(); };
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => { alive = false; clearInterval(t); navigator.serviceWorker?.removeEventListener('message', onMsg); };
  }, [loc.pathname]);

  useEffect(() => {
    registerSW().then(() => pushState().then(setPush));
    syncPushSubscription();
  }, []);

  useEffect(() => { setDrawer(false); setBell(false); setUserMenu(false); }, [loc.pathname, loc.search]);

  const openBell = () => setBell((b) => !b);
  const openNote = (n) => {
    if (!n.readAt) api(`/notifications/${n._id}/read`, { method: 'POST' }).then(loadNotes).catch(() => {});
    setBell(false);
    if (n.url) nav(n.url);
  };
  const readAll = () => api('/notifications/read-all', { method: 'POST' }).then(loadNotes);

  const bellCount = notes.unread;

  return (
    <div className={`shell ${drawer ? 'shell--drawer' : ''}`}>
      <aside className="sidebar">
        <div className="sb-brand"><Logo /><span>digital<b>guru</b></span><small>CRM</small></div>
        <nav className="sb-nav" aria-label="CRM">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `sb-link ${isActive ? 'is-active' : ''}`}>
              <n.icon size={19} /><span>{n.label}</span>
              {n.badge && counts[n.badge] > 0 && <em className="sb-count">{counts[n.badge]}</em>}
            </NavLink>
          ))}
        </nav>
        <a className="sb-site" href="/" target="_blank" rel="noopener"><ExternalLink size={16} /> View website</a>
      </aside>
      <div className="sb-overlay" onClick={() => setDrawer(false)} />

      <div className="main">
        <header className="topbar">
          <button className="icon-btn burger" onClick={() => setDrawer((d) => !d)} aria-label="Menu">{drawer ? <X size={20} /> : <Menu size={20} />}</button>
          <form className="search" onSubmit={(e) => { e.preventDefault(); nav(`/leads?q=${encodeURIComponent(q.trim())}`); }}>
            <Search size={17} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search leads by name, phone, email, ID…" aria-label="Search leads" />
          </form>
          <div className="topbar-actions">
            <Button icon={Plus} onClick={() => setNewLead(true)} disabled={!lookups}><span className="hide-sm">New lead</span></Button>
            <div className="bell-wrap">
              <button className="icon-btn" onClick={openBell} aria-label={`Notifications (${bellCount})`}>
                <Bell size={19} />{bellCount > 0 && <em className="dot-count">{bellCount > 9 ? '9+' : bellCount}</em>}
              </button>
              {bell && (
                <div className="pop pop--bell">
                  <div className="pop-head">
                    <span>Notifications</span>
                    {notes.unread > 0 && <button className="link small" onClick={readAll}><CheckCheck size={14} /> Mark all read</button>}
                  </div>
                  {push !== 'subscribed' && push !== 'unsupported' && push !== 'denied' && (
                    <button className="pop-cta" onClick={() => nav('/settings?tab=notifications')}><BellRing size={16} /> Get these as phone/desktop alerts — turn on push</button>
                  )}
                  {notes.items.map((n) => {
                    const Icon = N_ICON[n.type] || Bell;
                    return (
                      <button key={n._id} className={`pop-item ${n.readAt ? '' : 'is-unread'}`} onClick={() => openNote(n)}>
                        <Icon size={16} /><span><b>{n.title}</b>{n.body && <small>{n.body}</small>}<small className="pop-time">{relTime(n.createdAt)}</small></span>
                      </button>
                    );
                  })}
                  {!notes.items.length && <p className="pop-empty">You’re all caught up.</p>}
                  <button className="pop-foot" onClick={() => nav('/settings?tab=notifications')}>Notification settings</button>
                </div>
              )}
            </div>
            <div className="user-wrap">
              <button className="user-btn" onClick={() => setUserMenu((u) => !u)} aria-label="Account menu">
                <Avatar name={user?.name} size={34} /><span className="hide-sm"><b>{user?.name}</b><small>{user?.role?.name}</small></span>
              </button>
              {userMenu && (
                <div className="pop pop--user">
                  <button className="pop-item" onClick={() => nav('/settings?tab=profile')}><Settings size={16} /> Profile & password</button>
                  <button className="pop-item" onClick={logout}><LogOut size={16} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="content"><Suspense fallback={<Spinner />}><Outlet /></Suspense></main>
        {!/^\/leads\/[a-f0-9]{24}/.test(loc.pathname) && (
          <nav className="bottom-nav" aria-label="Main">
            {[['/', 'Dashboard', LayoutDashboard, true], ['/leads', 'Leads', Users], ['/followups', 'Follow-ups', CalendarClock], ['/pipeline-value', 'Value', Wallet]].map(([to, l, Icon, end]) => (
              <NavLink key={to} to={to} end={end} className={({ isActive }) => (isActive ? 'is-active' : '')}>
                <Icon size={21} /><span>{l}</span>{to === '/followups' && counts.followups > 0 && <em>{counts.followups}</em>}
              </NavLink>
            ))}
          </nav>
        )}
      </div>
      {newLead && <LeadFormModal open onClose={() => setNewLead(false)} onSaved={(l) => { setNewLead(false); nav(`/leads/${l._id}`); }} />}
    </div>
  );
}
