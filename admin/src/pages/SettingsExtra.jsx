import { useCallback, useEffect, useState } from 'react';
import { BellRing, BellOff, Send, Copy, RefreshCw, Link2, CheckCircle2, AlertTriangle, Save, PlugZap, RotateCcw, Smartphone } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useToast } from '../lib/context';
import { fmtDateTime, relTime } from '../lib/format';
import { Button, Field, Spinner } from '../components/ui';
import { disablePush, enablePush, isIOS, isStandalone, pushState } from '../lib/push';

const PREFS = [
  ['newLead', 'New leads', 'Website forms, WhatsApp form and Meta Lead Ads'],
  ['repeatEnquiry', 'Repeat enquiries', 'An existing lead enquires again'],
  ['assigned', 'Assigned to me', 'Someone assigns a lead to you'],
  ['followupReminder', 'Follow-up reminders', 'Before each follow-up is due (uses its reminder time)'],
  ['booked', 'Leads booked', 'A lead moves to Booked / Closed'],
  ['payment', 'Payments', 'A payment is recorded'],
  ['lost', 'Leads lost', 'A lead is marked Lost / Not interested'],
  ['import', 'Imports', 'A lead import finishes'],
  ['dailyDigest', 'Morning summary', '09:30 — today’s follow-ups, overdue items, yesterday’s leads'],
  ['integration', 'Integration problems', 'e.g. a Meta lead could not be fetched'],
];

export function NotificationSettings() {
  const toast = useToast();
  const [state, setState] = useState('…');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setState(await pushState());
    setData(await api('/notifications/prefs'));
  }, []);
  useEffect(() => { load().catch((e) => toast.error(e.message)); }, [load, toast]);

  const on = async () => {
    setBusy(true);
    try { await enablePush(); toast.success('Push notifications are on for this device'); await load(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const off = async () => { setBusy(true); try { await disablePush(); await load(); toast.info('Turned off for this device'); } finally { setBusy(false); } };
  const test = async () => {
    try { const r = await api('/notifications/push/test', { method: 'POST' }); toast.success(r.devices ? `Test sent to ${r.devices} device${r.devices > 1 ? 's' : ''}` : 'Added to your bell — no push devices yet'); }
    catch (e) { toast.error(e.message); }
  };
  const toggle = async (k) => {
    const next = !data.prefs[k];
    setData((d) => ({ ...d, prefs: { ...d.prefs, [k]: next } }));
    try { await api('/notifications/prefs', { method: 'PUT', body: { [k]: next } }); } catch (e) { toast.error(e.message); load(); }
  };

  if (!data) return <Spinner />;
  const iosNeedsInstall = isIOS() && !isStandalone();
  const STATUS = {
    subscribed: ['ok', 'Push is ON for this device', 'You’ll get alerts even when the CRM tab is closed.'],
    granted: ['warn', 'Allowed, but this device isn’t registered yet', 'Click “Turn on” to register it.'],
    default: ['off', 'Push is off for this device', 'Turn it on to get phone/desktop alerts.'],
    denied: ['warn', 'Blocked in this browser', 'Click the lock icon in the address bar → Notifications → Allow, then reload.'],
    unsupported: ['off', iosNeedsInstall ? 'Install the CRM app first (iPhone)' : 'This browser can’t receive push', iosNeedsInstall ? 'In Safari tap Share → “Add to Home Screen”, open DG CRM from your home screen, then come back here.' : 'Use Chrome, Edge, Firefox or Safari (macOS 13+, iOS 16.4+ installed app).'],
  };
  const [tone, title, text] = STATUS[state] || STATUS.default;

  return (
    <div className="settings-stack">
      <section className="card">
        <header className="card-head"><div><h3><BellRing size={18} /> Browser push notifications</h3><p className="muted small">Free alerts on desktop and phone. Turn on for every device you use (laptop, office PC, phone).</p></div></header>
        <div className="status-box">
          <span className={`status-dot status-dot--${tone}`} />
          <div className="grow"><b>{title}</b><p>{text}</p></div>
          {state !== 'subscribed' && state !== 'unsupported' && state !== 'denied' && <Button icon={BellRing} loading={busy} onClick={on}>Turn on</Button>}
          {state === 'subscribed' && <><Button variant="secondary" icon={Send} onClick={test}>Send test</Button><Button variant="ghost" icon={BellOff} loading={busy} onClick={off}>Turn off here</Button></>}
        </div>
        {data.devices.length > 0 && (
          <>
            <p className="field-label"><Smartphone size={14} /> Your registered devices ({data.devices.length})</p>
            <ul className="devices">
              {data.devices.map((d) => <li key={d._id}>{d.userAgent.match(/(Android|iPhone|iPad|Windows|Macintosh|Linux)/)?.[0] || 'Device'} · {d.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[0]?.replace('Edg', 'Edge') || 'Browser'} · added {fmtDateTime(d.createdAt)}{d.lastSuccessAt ? ` · last alert ${relTime(d.lastSuccessAt)}` : ''}</li>)}
            </ul>
          </>
        )}
      </section>

      <section className="card">
        <header className="card-head"><div><h3>What should alert me?</h3><p className="muted small">Everything is always listed in the bell. These switches control which events also send a push.</p></div></header>
        <div className="pref-grid">
          {PREFS.map(([k, l, d]) => (
            <label key={k} className={`pref ${data.prefs[k] !== false ? 'is-on' : ''}`}>
              <span className="switch"><input type="checkbox" checked={data.prefs[k] !== false} onChange={() => toggle(k)} /><span /></span>
              <span><b>{l}</b><small>{d}</small></span>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}

function CopyField({ value }) {
  const toast = useToast();
  return (
    <div className="copy-row">
      <input readOnly value={value} onFocus={(e) => e.target.select()} />
      <Button type="button" size="sm" variant="secondary" icon={Copy} onClick={() => { navigator.clipboard?.writeText(value); toast.success('Copied'); }}>Copy</Button>
    </div>
  );
}

export function MetaIntegration() {
  const toast = useToast();
  const { can } = useAuth();
  const [d, setD] = useState(null);
  const [f, setF] = useState({ pageId: '', appSecret: '', verifyToken: '', syncMinutes: 5, enabled: true });
  const [test, setTest] = useState(null);
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState('');
  const [days, setDays] = useState(7);
  const load = useCallback(async () => {
    const r = await api('/integrations/meta');
    setD(r);
    setF((x) => ({ ...x, pageId: r.settings.pageId, verifyToken: r.settings.verifyToken || x.verifyToken || `dg-${Math.random().toString(36).slice(2, 12)}`, syncMinutes: r.settings.syncMinutes, enabled: r.settings.enabled }));
  }, []);
  useEffect(() => { if (can('settings:manage')) load().catch((e) => toast.error(e.message)); }, [load, toast, can]);
  if (!can('settings:manage')) return <p className="muted">Only administrators can manage integrations.</p>;
  if (!d) return <Spinner />;
  const s = d.settings;
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const run = async (key, fn) => { setBusy(key); try { await fn(); } catch (e) { toast.error(e.message); } finally { setBusy(''); } };
  const save = () => run('save', async () => {
    const body = { syncMinutes: Number(f.syncMinutes), enabled: f.enabled };
    if (!s.fromEnv?.pageId) body.pageId = f.pageId;
    if (!s.fromEnv?.appSecret) body.appSecret = f.appSecret;
    if (!s.fromEnv?.verifyToken) body.verifyToken = f.verifyToken;
    await api('/integrations/meta', { method: 'PUT', body }); setF((x) => ({ ...x, appSecret: '' })); toast.success('Saved'); await load();
  });
  const doTest = async () => {
    setBusy('test');
    try { const r = await api('/integrations/meta/test', { method: 'POST' }); setTest(r); setReport(r.report); toast.success(`Connected to “${r.page.name}”`); }
    catch (e) { setTest(null); setReport(e.body?.details || null); toast.error(e.message); }
    finally { setBusy(''); await load().catch(() => {}); }
  };
  const subscribe = () => run('sub', async () => { await api('/integrations/meta/subscribe', { method: 'POST' }); toast.success('Page subscribed to lead events'); await doTest(); });
  const sync = () => run('sync', async () => { const r = await api('/integrations/meta/sync', { method: 'POST', body: { days: Number(days) } }); const x = r.summary; toast.success(`Synced ${x.forms} form(s): ${x.created} new, ${x.merged} merged, ${x.duplicates} already in CRM${x.errors ? `, ${x.errors} errors` : ''}`); await load(); });
  const retry = () => run('retry', async () => { const r = await api('/integrations/meta/retry', { method: 'POST' }); toast.success(`Retried ${r.retried}, fixed ${r.fixed}`); await load(); });
  const connected = s.hasToken && s.pageId;
  const authDown = s.auth?.status === 'unavailable';
  const live = s.lastWebhookAt || s.lastSyncAt;

  return (
    <div className="settings-stack">
      <section className="card">
        <header className="card-head"><div><h3><PlugZap size={18} /> Meta Lead Ads → CRM</h3><p className="muted small">Facebook & Instagram lead form submissions land here automatically — free, straight from Meta’s Graph API (no Zapier).</p></div></header>
        <div className="status-box">
          <span className={`status-dot status-dot--${connected ? (authDown ? 'off' : s.lastError ? 'warn' : 'ok') : 'off'}`} />
          <div className="grow">
            <b>{!connected ? 'Not connected yet' : authDown ? `Sync paused — ${s.auth.label}` : `Connected${s.pageName ? ` to ${s.pageName}` : ''}`}</b>
            {authDown && <p className="t-red small"><AlertTriangle size={13} /> {s.auth.message} — {s.auth.hint}{s.auth.nextRetryAt ? ` Next automatic check ${relTime(s.auth.nextRetryAt)}.` : ''}</p>}
            <p>
              {s.lastWebhookAt ? `Last instant webhook ${relTime(s.lastWebhookAt)}. ` : 'No webhook received yet. '}
              {s.syncMinutes ? `Auto-sync every ${s.syncMinutes} min${s.lastSyncAt ? `, last ran ${relTime(s.lastSyncAt)}` : ''}.` : 'Auto-sync off.'}
              {' '}{d.counts.processed || 0} created · {d.counts.merged || 0} merged · {d.counts.error || 0} failed
            </p>
            {s.lastError && <p className="t-red small"><AlertTriangle size={13} /> {s.lastError}</p>}
          </div>
          {connected && <Button variant="secondary" icon={RefreshCw} loading={busy === 'test'} onClick={doTest}>{authDown ? 'Check again now' : 'Test connection'}</Button>}
        </div>

        <div className="grid-2">
          <Field label="Facebook Page ID" hint={s.fromEnv?.pageId ? 'Set on the server (META_PAGE_ID)' : 'Page → About → Page transparency, or set META_PAGE_ID on the server'}><input value={f.pageId} onChange={set('pageId')} disabled={s.fromEnv?.pageId} placeholder="e.g. 104839274658392" /></Field>
          <Field label="Access token" hint="Kept only in the server environment — never stored in the CRM or sent to the browser">
            <div className={`env-status ${s.hasToken ? 'is-set' : 'is-missing'}`}>{s.hasToken ? <>Set on the server · <code>META_PAGE_ACCESS_TOKEN</code> · {s.tokenPreview}</> : <>Not set — add <code>META_PAGE_ACCESS_TOKEN</code> in Render → Environment</>}</div>
          </Field>
          <Field label="App secret" hint={s.fromEnv?.appSecret ? 'Set on the server (META_APP_SECRET)' : s.hasAppSecret ? 'Saved — leave empty to keep' : 'Meta app → App settings → Basic (or META_APP_SECRET)'}><input type="password" value={f.appSecret} onChange={set('appSecret')} disabled={s.fromEnv?.appSecret} placeholder={s.hasAppSecret ? '••••••••  (unchanged)' : ''} autoComplete="off" /></Field>
          <Field label="Webhook verify token" hint={s.fromEnv?.verifyToken ? 'Set on the server (META_VERIFY_TOKEN)' : 'Any secret phrase — paste the same in Meta’s webhook setup'}><input value={f.verifyToken} onChange={set('verifyToken')} disabled={s.fromEnv?.verifyToken} /></Field>
          <Field label="Auto-sync" hint="Pulls new leads even if the webhook isn’t live yet">
            <select value={f.syncMinutes} onChange={set('syncMinutes')}><option value="0">Off (webhook only)</option><option value="2">Every 2 minutes</option><option value="5">Every 5 minutes</option><option value="15">Every 15 minutes</option><option value="60">Every hour</option></select>
          </Field>
          <Field label="Status"><label className="check"><input type="checkbox" checked={f.enabled} onChange={set('enabled')} /> Integration enabled</label></Field>
        </div>
        <div className="form-actions"><Button icon={Save} loading={busy === 'save'} onClick={save}>Save</Button></div>
      </section>

      {report && (
        <section className="card">
          <header className="card-head"><div><h3>{report.ok ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />} Connection check</h3><p className="muted small">Checked {relTime(report.checkedAt)}</p></div></header>
          <ul className="devices">
            {report.problem && <li className="t-red"><b>{report.problem.label}</b>: {report.problem.message}<br /><span className="small">{report.problem.hint}</span></li>}
            {report.token && <li>Token type <b>{report.token.type || '—'}</b> · expires <b>{report.token.expiresAt || '—'}</b>{report.token.scopes?.length ? <> · permissions: {report.token.scopes.join(', ')}</> : null}</li>}
            {report.page && <li>Page <b>{report.page.name || report.page.id}</b>{report.page.usesPageTokenFromSystemUser ? ' · Page token obtained from the System User' : ''}</li>}
            {report.leadForms && <li>{report.leadForms.count} lead form(s) · leads readable: <b>{report.leadsReadable === null ? '—' : report.leadsReadable ? 'yes' : 'no'}</b></li>}
            {report.warnings?.map((w) => <li key={w} className="t-amber small">{w}</li>)}
          </ul>
        </section>
      )}

      {test && (
        <section className="card">
          <header className="card-head"><div><h3><CheckCircle2 size={18} /> {test.page.name}</h3><p className="muted small">{test.forms.length} lead form(s) found</p></div>
            {test.webhookSubscribed === false && <Button icon={Link2} loading={busy === 'sub'} onClick={subscribe}>Subscribe page to lead events</Button>}
            {test.webhookSubscribed && <span className="pill pill--st-completed">Webhook subscribed</span>}
          </header>
          <ul className="devices">{test.forms.map((fm) => <li key={fm.id}><b>{fm.name}</b> · {fm.status} · {fm.leads_count ?? '—'} leads · ID {fm.id}</li>)}</ul>
        </section>
      )}

      <section className="card">
        <header className="card-head"><div><h3>Pull existing leads</h3><p className="muted small">Import leads already sitting in Meta (up to 90 days — Meta deletes older ones). Duplicates are skipped automatically.</p></div></header>
        <div className="copy-row" style={{ maxWidth: 420 }}>
          <select value={days} onChange={(e) => setDays(e.target.value)} aria-label="Days"><option value="1">Last 24 hours</option><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option></select>
          <Button icon={RefreshCw} loading={busy === 'sync'} disabled={!connected} onClick={sync}>Sync now</Button>
          {d.counts.error > 0 && <Button variant="secondary" icon={RotateCcw} loading={busy === 'retry'} onClick={retry}>Retry failed</Button>}
        </div>
      </section>

      <section className="card">
        <header className="card-head"><div><h3>One-time setup (≈15 minutes)</h3><p className="muted small">Your website must be live on HTTPS for the instant webhook.</p></div></header>
        <ol className="steps-list">
          <li>Go to <b>developers.facebook.com → My Apps → Create app</b> → type <b>Business</b>, linked to your Business portfolio.</li>
          <li>In the app, open <b>App settings → Basic</b>: copy the <b>App secret</b> into the field above (or <code>META_APP_SECRET</code> on the server).</li>
          <li><b>Business Settings → Users → System users</b>: add a system user (Admin), then <b>Assign assets → Pages → your Page</b> (full control) and add your app under <b>Apps</b>. Click <b>Generate new token</b> → your app → Token expiration <b>Never</b> → permissions <code>leads_retrieval</code>, <code>pages_show_list</code>, <code>pages_read_engagement</code>, <code>pages_manage_metadata</code>, <code>pages_manage_ads</code>, <code>ads_management</code>, <code>business_management</code>.</li>
          <li>In <b>Render → your service → Environment</b> set <code>META_PAGE_ID</code> and <code>META_PAGE_ACCESS_TOKEN</code> (the system user token) and save — Render redeploys. The token is never entered in the CRM. Then click <b>Test connection</b> here.</li>
          <li>In Meta Business Suite → <b>Settings → Integrations → Leads access</b>, make sure your app (CRM) is allowed to access leads.</li>
          <li>Auto-sync starts working now. For <b>instant</b> leads: in the app add the <b>Webhooks</b> product → object <b>Page</b> → Callback URL and Verify token below → subscribe to the <b>leadgen</b> field. Then click <b>Subscribe page to lead events</b> here.
            <div style={{ margin: '8px 0' }}><CopyField value={d.webhookUrl} /></div>
            <CopyField value={f.verifyToken} />
          </li>
          <li>Test with Meta’s <b>Lead Ads Testing Tool</b> (developers.facebook.com/tools/lead-ads-testing) — the test lead should appear in Leads within seconds (webhook) or at the next auto-sync.</li>
        </ol>
        <p className="muted small" style={{ marginTop: 10 }}>Note: Meta only sends live webhooks to apps switched to <b>Live</b> mode, which may require App Review for <code>leads_retrieval</code>. Until then, auto-sync (using the server’s token) brings leads in every few minutes.</p>
      </section>

      <section className="card">
        <header className="card-head"><div><h3>Recent Meta leads</h3><p className="muted small">Every lead Meta sent us, and what happened to it.</p></div></header>
        {d.recent.length ? (
          <div className="table-wrap table-wrap--flat">
            <table className="table meta-log">
              <thead><tr><th>Received</th><th>Lead</th><th>Form / campaign</th><th>Via</th><th>Result</th></tr></thead>
              <tbody>
                {d.recent.map((m) => (
                  <tr key={m._id}>
                    <td data-label="Received" className="nowrap">{fmtDateTime(m.createdAt)}</td>
                    <td data-label="Lead">{m.lead ? <a href={`/admin/leads/${m.lead._id}`}>{m.lead.name} · {m.lead.leadId}</a> : <span className="muted">{m.leadgenId}</span>}</td>
                    <td data-label="Form">{m.formName || m.formId || '—'}{m.campaignName && <small className="muted block">{m.campaignName}</small>}</td>
                    <td data-label="Via" className="cap">{m.via}</td>
                    <td data-label="Result"><span className={`st-${m.status}`}>{m.status}</span>{m.error && <small className="t-red block">{m.error}</small>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="muted small">No Meta leads yet.</p>}
      </section>
    </div>
  );
}
