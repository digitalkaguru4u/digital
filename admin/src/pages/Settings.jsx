import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUp, ArrowDown, Trash2, Plus, Save, UserPlus, ShieldCheck, KeyRound, LogOut } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useData, useToast } from '../lib/context';
import { fmtDateTime, fmtINR } from '../lib/format';
import { Button, Confirm, Field, Modal, Spinner } from '../components/ui';
import { MetaIntegration, NotificationSettings } from './SettingsExtra';

const LISTS = {
  statuses: { title: 'Stages', desc: 'The stages a lead moves through (Open, Hot, Warm, Cold…). “Needs budget” lists leads in that stage without an amount. “Lost” asks for a reason.', key: 'key', color: true, flags: [['showOnBoard', 'On board'], ['needsBudget', 'Needs budget'], ['requiresReason', 'Ask reason'], ['isBooked', 'Booking'], ['isWon', 'Won'], ['isLost', 'Lost']] },
  sources: { title: 'Lead sources', desc: 'Where leads come from. Website attribution uses the built-in keys (google_ads, meta_ads, …).', key: 'key' },
  services: { title: 'Services', desc: 'Used on website forms and for reporting. The slug links to /services/<slug>.', key: 'slug' },
  'lost-reasons': { title: 'Lost reasons', desc: 'Asked when a lead is marked Not Interested or Lost.' },
  'followup-types': { title: 'Follow-up types', desc: 'Call, WhatsApp, meeting…', key: 'key' },
};
const LOOKUP_KEY = { statuses: 'statuses', sources: 'sources', services: 'services', 'lost-reasons': 'lostReasons', 'followup-types': 'followupTypes' };

function ListEditor({ type }) {
  const cfg = LISTS[type];
  const { lookups, refresh } = useData();
  const { can } = useAuth();
  const toast = useToast();
  const items = lookups[LOOKUP_KEY[type]];
  const [drafts, setDrafts] = useState({});
  const [adding, setAdding] = useState({ label: '', color: '#7040F0', min: '', max: '' });
  const [del, setDel] = useState(null);
  const editable = can('settings:manage');
  const val = (it, k) => (drafts[it._id]?.[k] !== undefined ? drafts[it._id][k] : it[k]);
  const setD = (id, k, v) => setDrafts((d) => ({ ...d, [id]: { ...d[id], [k]: v } }));

  const save = async (it) => {
    const body = { ...drafts[it._id] };
    if (body.min !== undefined) body.min = body.min === '' ? null : Number(body.min);
    if (body.max !== undefined) body.max = body.max === '' ? null : Number(body.max);
    try { await api(`/settings/${type}/${it._id}`, { method: 'PATCH', body }); setDrafts((d) => { const n = { ...d }; delete n[it._id]; return n; }); await refresh(); toast.success('Saved'); }
    catch (e) { toast.error(e.message); }
  };
  const toggle = async (it, k) => {
    try { await api(`/settings/${type}/${it._id}`, { method: 'PATCH', body: { [k]: !it[k] } }); await refresh(); } catch (e) { toast.error(e.message); }
  };
  const reorder = async (idx, dir) => {
    const ids = items.map((x) => x._id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    await api(`/settings/${type}/reorder`, { method: 'POST', body: { ids } });
    refresh();
  };
  const add = async (e) => {
    e.preventDefault();
    if (!adding.label.trim()) return;
    const body = { label: adding.label.trim() };
    if (cfg.color) body.color = adding.color;
    if (cfg.minmax) { body.min = adding.min === '' ? null : Number(adding.min); body.max = adding.max === '' ? null : Number(adding.max); }
    try { await api(`/settings/${type}`, { method: 'POST', body }); setAdding({ label: '', color: '#7040F0', min: '', max: '' }); await refresh(); toast.success('Added'); }
    catch (e2) { toast.error(e2.message); }
  };
  const remove = async (it) => {
    const r = await api(`/settings/${type}/${it._id}`, { method: 'DELETE' });
    toast[r.deactivated ? 'info' : 'success'](r.message || 'Deleted');
    refresh();
  };

  return (
    <section className="card">
      <header className="card-head"><div><h3>{cfg.title}</h3><p className="muted small">{cfg.desc}</p></div></header>
      <div className="list-editor">
        {items.map((it, i) => (
          <div key={it._id} className={`le-row ${it.active ? '' : 'is-off'}`}>
            <div className="le-order">
              <button className="icon-btn icon-btn--xs" disabled={!editable || i === 0} onClick={() => reorder(i, -1)} aria-label="Move up"><ArrowUp size={12} /></button>
              <button className="icon-btn icon-btn--xs" disabled={!editable || i === items.length - 1} onClick={() => reorder(i, 1)} aria-label="Move down"><ArrowDown size={12} /></button>
            </div>
            {cfg.color && <input type="color" value={val(it, 'color') || '#807CB0'} disabled={!editable} onChange={(e) => setD(it._id, 'color', e.target.value)} aria-label="Colour" />}
            {cfg.emoji && <input className="le-emoji" value={val(it, 'emoji') || ''} disabled={!editable} onChange={(e) => setD(it._id, 'emoji', e.target.value)} aria-label="Emoji" maxLength={4} />}
            <input className="le-label" value={val(it, 'label')} disabled={!editable} onChange={(e) => setD(it._id, 'label', e.target.value)} aria-label="Label" />
            {cfg.key && <code className="le-key" title="System key (fixed)">{it[cfg.key]}</code>}
            {cfg.minmax && !it.isCustom && (
              <span className="le-minmax">
                <input type="number" placeholder="min" value={val(it, 'min') ?? ''} disabled={!editable} onChange={(e) => setD(it._id, 'min', e.target.value)} aria-label="Minimum" />
                <input type="number" placeholder="max" value={val(it, 'max') ?? ''} disabled={!editable} onChange={(e) => setD(it._id, 'max', e.target.value)} aria-label="Maximum" />
              </span>
            )}
            {cfg.flags && (
              <span className="le-flags">
                {cfg.flags.map(([k, l]) => <label key={k} className={`flag ${it[k] ? 'is-on' : ''}`}><input type="checkbox" checked={!!it[k]} disabled={!editable} onChange={() => toggle(it, k)} />{l}</label>)}
              </span>
            )}
            <label className={`flag ${it.active ? 'is-on' : ''}`}><input type="checkbox" checked={it.active} disabled={!editable || it.isSystem} onChange={() => toggle(it, 'active')} />Active</label>
            {drafts[it._id] && <Button size="sm" icon={Save} onClick={() => save(it)}>Save</Button>}
            {editable && !it.isSystem && <button className="icon-btn icon-btn--sm" onClick={() => setDel(it)} aria-label="Delete"><Trash2 size={14} /></button>}
          </div>
        ))}
      </div>
      {editable && (
        <form className="le-add" onSubmit={add}>
          {cfg.color && <input type="color" value={adding.color} onChange={(e) => setAdding((a) => ({ ...a, color: e.target.value }))} aria-label="Colour" />}
          <input placeholder={`Add ${cfg.title.toLowerCase().replace(/s$/, '')}…`} value={adding.label} onChange={(e) => setAdding((a) => ({ ...a, label: e.target.value }))} />
          {cfg.minmax && <><input type="number" placeholder="min ₹" value={adding.min} onChange={(e) => setAdding((a) => ({ ...a, min: e.target.value }))} /><input type="number" placeholder="max ₹" value={adding.max} onChange={(e) => setAdding((a) => ({ ...a, max: e.target.value }))} /></>}
          <Button type="submit" icon={Plus} size="sm">Add</Button>
        </form>
      )}
      <Confirm open={!!del} title={`Delete “${del?.label}”?`} danger confirmLabel="Delete" text="If existing records use it, it will be deactivated instead so history stays intact."
        onClose={() => setDel(null)} onConfirm={() => remove(del)} />
    </section>
  );
}

function AppSettings({ fields }) {
  const { app, refresh } = useData();
  const { can } = useAuth();
  const toast = useToast();
  const [f, setF] = useState(app.settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(app.settings), [app]);
  const save = async () => {
    setBusy(true);
    try { const body = Object.fromEntries(fields.map((k) => [k, f[k]])); await api('/settings/app', { method: 'PUT', body }); await refresh(); toast.success('Settings saved'); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const dis = !can('settings:manage');
  return (
    <section className="card">
      {fields.includes('defaultReminderMinutes') && (
        <>
          <header className="card-head"><div><h3>Reminder settings</h3><p className="muted small">Reminders appear in the bell menu of the CRM when a follow-up is coming up or overdue.</p></div></header>
          <div className="grid-2">
            <Field label="Default reminder"><select disabled={dis} value={f.defaultReminderMinutes} onChange={(e) => setF((x) => ({ ...x, defaultReminderMinutes: Number(e.target.value) }))}><option value="0">No reminder</option><option value="5">5 minutes before</option><option value="15">15 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></Field>
            <Field label="Default follow-up time"><input disabled={dis} type="time" value={f.defaultFollowupTime} onChange={(e) => setF((x) => ({ ...x, defaultFollowupTime: e.target.value }))} /></Field>
          </div>
        </>
      )}
      {fields.includes('whatsappTemplate') && (
        <>
          <header className="card-head"><div><h3>Message templates</h3><p className="muted small">Variables: <code>{'{{name}}'}</code> <code>{'{{full_name}}'}</code> <code>{'{{service}}'}</code> <code>{'{{service_for}}'}</code> <code>{'{{user}}'}</code> <code>{'{{lead_id}}'}</code></p></div></header>
          <Field label="WhatsApp message"><textarea disabled={dis} rows={3} value={f.whatsappTemplate} onChange={(e) => setF((x) => ({ ...x, whatsappTemplate: e.target.value }))} /></Field>
          <Field label="Email subject"><input disabled={dis} value={f.emailSubject} onChange={(e) => setF((x) => ({ ...x, emailSubject: e.target.value }))} /></Field>
          <Field label="Email body"><textarea disabled={dis} rows={7} value={f.emailTemplate} onChange={(e) => setF((x) => ({ ...x, emailTemplate: e.target.value }))} /></Field>
        </>
      )}
      {!dis && <div className="form-actions"><Button icon={Save} loading={busy} onClick={save}>Save settings</Button></div>}
    </section>
  );
}

function Users() {
  const toast = useToast();
  const { user: me } = useAuth();
  const { refresh } = useData();
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [modal, setModal] = useState(null);
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => Promise.all([api('/users'), api('/users/roles/all')]).then(([u, r]) => { setUsers(u.items); setRoles(r.items); }), []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);
  const open = (u) => { setF(u ? { name: u.name, phone: u.phone || '', role: u.role?._id, active: u.active, password: '' } : { name: '', email: '', phone: '', role: roles.find((r) => r.key === 'sales_executive')?._id || roles[0]?._id, password: '' }); setModal(u || 'new'); };
  const save = async () => {
    setBusy(true);
    try {
      if (modal === 'new') await api('/users', { method: 'POST', body: f });
      else { const body = { ...f }; if (!body.password) delete body.password; await api(`/users/${modal._id}`, { method: 'PATCH', body }); }
      toast.success('User saved'); setModal(null); load(); refresh();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  if (!users) return <Spinner />;
  return (
    <section className="card">
      <header className="card-head"><div><h3>Team members</h3><p className="muted small">People who can sign in to the CRM. Leads can be assigned to any active user.</p></div><Button icon={UserPlus} onClick={() => open(null)}>Add user</Button></header>
      <div className="table-wrap table-wrap--flat">
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u._id}>
                <td data-label="Name"><b>{u.name}</b>{String(u._id) === String(me.id) && <small className="muted"> (you)</small>}</td>
                <td data-label="Email">{u.email}</td>
                <td data-label="Role">{u.role?.name}</td>
                <td data-label="Status"><span className={`pill ${u.active ? 'pill--st-completed' : 'pill--st-cancelled'}`}>{u.active ? 'Active' : 'Disabled'}</span></td>
                <td data-label="Last login" className="muted">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : 'Never'}</td>
                <td className="c-actions"><Button size="sm" variant="ghost" onClick={() => open(u)}>Edit</Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <Modal open title={modal === 'new' ? 'Add team member' : `Edit ${modal.name}`} size="md" onClose={() => setModal(null)}
          footer={<><Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
          <div className="grid-2">
            <Field label="Name"><input value={f.name} onChange={(e) => setF((x) => ({ ...x, name: e.target.value }))} /></Field>
            {modal === 'new' ? <Field label="Email"><input type="email" value={f.email} onChange={(e) => setF((x) => ({ ...x, email: e.target.value }))} /></Field> : <Field label="Email"><input value={modal.email} disabled /></Field>}
            <Field label="Phone"><input value={f.phone} onChange={(e) => setF((x) => ({ ...x, phone: e.target.value }))} /></Field>
            <Field label="Role"><select value={f.role} onChange={(e) => setF((x) => ({ ...x, role: e.target.value }))}>{roles.map((r) => <option key={r._id} value={r._id}>{r.name}</option>)}</select></Field>
            <Field label={modal === 'new' ? 'Password' : 'New password (optional)'} hint="Min 8 characters with a letter and a number"><input type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF((x) => ({ ...x, password: e.target.value }))} /></Field>
            {modal !== 'new' && <Field label="Status"><select value={f.active ? '1' : '0'} onChange={(e) => setF((x) => ({ ...x, active: e.target.value === '1' }))}><option value="1">Active</option><option value="0">Disabled</option></select></Field>}
          </div>
        </Modal>
      )}
    </section>
  );
}

const PERM_LABEL = {
  'dashboard:view': 'View dashboard', 'leads:view_all': 'See all leads (not just own)', 'leads:create': 'Create leads', 'leads:edit': 'Edit leads & change status',
  'leads:delete': 'Delete / restore leads', 'leads:assign': 'Assign leads', 'leads:export': 'Export CSV / Excel', 'followups:manage': 'Manage follow-ups',
  'settings:manage': 'Manage settings', 'users:manage': 'Manage users & roles',
};
function Roles() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [newName, setNewName] = useState('');
  const load = useCallback(() => api('/users/roles/all').then(setData), []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);
  const togglePerm = async (r, p) => {
    const perms = r.permissions.includes(p) ? r.permissions.filter((x) => x !== p) : [...r.permissions, p];
    try { await api(`/users/roles/${r._id}`, { method: 'PATCH', body: { permissions: perms } }); load(); } catch (e) { toast.error(e.message); }
  };
  const add = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try { await api('/users/roles', { method: 'POST', body: { name: newName, permissions: ['dashboard:view'] } }); setNewName(''); load(); } catch (e2) { toast.error(e2.message); }
  };
  const remove = async (r) => { try { await api(`/users/roles/${r._id}`, { method: 'DELETE' }); load(); } catch (e) { toast.error(e.message); } };
  if (!data) return <Spinner />;
  return (
    <section className="card">
      <header className="card-head"><div><h3>Roles & permissions</h3><p className="muted small">Control what each role can do. Administrators always have full access.</p></div></header>
      <div className="table-wrap table-wrap--flat">
        <table className="table perm-table">
          <thead><tr><th>Permission</th>{data.items.map((r) => <th key={r._id}>{r.name}<small className="muted block">{r.users} user{r.users === 1 ? '' : 's'}</small>{!r.isSystem && !r.users && <button className="link small" onClick={() => remove(r)}>Delete</button>}</th>)}</tr></thead>
          <tbody>
            {data.permissions.map((p) => (
              <tr key={p}>
                <td>{PERM_LABEL[p] || p}</td>
                {data.items.map((r) => {
                  const full = r.permissions.includes('*');
                  return <td key={r._id} className="c-center"><input type="checkbox" checked={full || r.permissions.includes(p)} disabled={full} onChange={() => togglePerm(r, p)} aria-label={`${r.name}: ${p}`} /></td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="le-add" onSubmit={add}><input placeholder="New role name (e.g. Account Manager)" value={newName} onChange={(e) => setNewName(e.target.value)} /><Button size="sm" icon={Plus} type="submit">Add role</Button></form>
    </section>
  );
}

function Profile() {
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const [p, setP] = useState({ name: user.name, phone: user.phone || '' });
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [busy, setBusy] = useState('');
  const saveProfile = async () => {
    setBusy('p');
    try { const r = await api('/auth/profile', { method: 'PATCH', body: p }); setUser(r.user); toast.success('Profile updated'); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  const savePw = async () => {
    if (pw.newPassword !== pw.confirm) { toast.error('Passwords do not match'); return; }
    setBusy('pw');
    try { await api('/auth/change-password', { method: 'POST', body: { currentPassword: pw.currentPassword, newPassword: pw.newPassword } }); setPw({ currentPassword: '', newPassword: '', confirm: '' }); toast.success('Password changed. Other sessions were signed out.'); }
    catch (e) { toast.error(e.message); } finally { setBusy(''); }
  };
  return (
    <div className="settings-cols">
      <section className="card">
        <header className="card-head"><h3>Your profile</h3></header>
        <Field label="Name"><input value={p.name} onChange={(e) => setP((x) => ({ ...x, name: e.target.value }))} /></Field>
        <Field label="Email"><input value={user.email} disabled /></Field>
        <Field label="Phone"><input value={p.phone} onChange={(e) => setP((x) => ({ ...x, phone: e.target.value }))} /></Field>
        <Field label="Role"><input value={user.role?.name} disabled /></Field>
        <div className="form-actions"><Button icon={Save} loading={busy === 'p'} onClick={saveProfile}>Save profile</Button></div>
      </section>
      <section className="card">
        <header className="card-head"><h3><KeyRound size={17} /> Change password</h3></header>
        <Field label="Current password"><input type="password" autoComplete="current-password" value={pw.currentPassword} onChange={(e) => setPw((x) => ({ ...x, currentPassword: e.target.value }))} /></Field>
        <Field label="New password" hint="Min 8 characters with a letter and a number"><input type="password" autoComplete="new-password" value={pw.newPassword} onChange={(e) => setPw((x) => ({ ...x, newPassword: e.target.value }))} /></Field>
        <Field label="Confirm new password"><input type="password" autoComplete="new-password" value={pw.confirm} onChange={(e) => setPw((x) => ({ ...x, confirm: e.target.value }))} /></Field>
        <div className="form-actions">
          <Button variant="ghost" icon={LogOut} onClick={async () => { await api('/auth/logout-all', { method: 'POST' }); logout(); }}>Sign out everywhere</Button>
          <Button icon={ShieldCheck} loading={busy === 'pw'} onClick={savePw}>Update password</Button>
        </div>
      </section>
    </div>
  );
}

const TABS = [
  ['leads', 'Lead settings'], ['followups', 'Follow-up settings'], ['notifications', 'Notifications'], ['integrations', 'Integrations', 'settings:manage'], ['templates', 'Templates'], ['users', 'Users', 'users:manage'], ['roles', 'Roles', 'users:manage'], ['profile', 'Profile & password'],
];

export default function Settings() {
  const [sp, setSp] = useSearchParams();
  const { can } = useAuth();
  const { lookups } = useData();
  const tabs = TABS.filter((t) => !t[2] || can(t[2]));
  const tab = sp.get('tab') || 'leads';
  if (!lookups) return <div className="page"><Spinner /></div>;
  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1><p className="muted">Manage CRM options without touching code.{!can('settings:manage') && ' (read-only for your role)'}</p></div></div>
      <div className="tabs tabs--top">{tabs.map(([k, l]) => <button key={k} className={tab === k ? 'is-on' : ''} onClick={() => setSp({ tab: k })}>{l}</button>)}</div>
      {tab === 'leads' && <div className="settings-stack">{['statuses', 'sources', 'services', 'lost-reasons'].map((t) => <ListEditor key={t} type={t} />)}</div>}
      {tab === 'followups' && <div className="settings-stack"><ListEditor type="followup-types" /><AppSettings fields={['defaultReminderMinutes', 'defaultFollowupTime']} /></div>}
      {tab === 'notifications' && <NotificationSettings />}
      {tab === 'integrations' && can('settings:manage') && <MetaIntegration />}
      {tab === 'templates' && <AppSettings fields={['whatsappTemplate', 'emailSubject', 'emailTemplate']} />}
      {tab === 'users' && can('users:manage') && <Users />}
      {tab === 'roles' && can('users:manage') && <Roles />}
      {tab === 'profile' && <Profile />}
    </div>
  );
}
