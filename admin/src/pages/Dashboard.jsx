import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Users, UserX, UserMinus, BellOff, CalendarDays, Repeat, CalendarClock, AlarmClock, Wallet, AlertCircle, BadgeCheck, XCircle, BellRing, ChevronRight } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useToast } from '../lib/context';
import { fmtINR, fmtTime, fmtDate, relTime, dateInTz } from '../lib/format';
import { Button, Empty, Spinner, StatusBadge } from '../components/ui';
import { enablePush, pushState } from '../lib/push';

function Tile({ icon: Icon, label, value, sub, to, tone = '' }) {
  const body = (
    <>
      <span className="tile-label">{Icon && <Icon size={16} />}{label}</span>
      <b className="tile-value">{value}</b>
      {sub && <span className="tile-sub">{sub}</span>}
      {to && <ChevronRight size={16} className="tile-go" />}
    </>
  );
  return to ? <Link to={to} className={`tile ${tone}`}>{body}</Link> : <div className={`tile ${tone}`}>{body}</div>;
}

function Bars({ rows, secondary, empty = 'No data yet' }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  if (!rows.length) return <p className="muted small chart-empty">{empty}</p>;
  return (
    <ul className="barlist">
      {rows.slice(0, 8).map((r) => (
        <li key={r.name} title={`${r.name}: ${r.count}`}>
          <span className="bl-label">{r.name}</span>
          <span className="bl-track"><span className="bl-bar" style={{ width: `${(r.count / max) * 100}%`, background: 'var(--color-purple)' }} /></span>
          <span className="bl-val">{r.count}{secondary && r[secondary.key] > 0 && <small>{r[secondary.key]} {secondary.label}</small>}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [push, setPush] = useState('');
  const [hidePush, setHidePush] = useState(() => { try { return localStorage.getItem('dg_push_banner') === 'hide'; } catch { return false; } });

  useEffect(() => { api('/dashboard').then(setD).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { pushState().then(setPush).catch(() => {}); }, []);

  if (err) return <div className="page"><p className="form-err">{err}</p></div>;
  if (!d) return <div className="page"><Spinner /></div>;
  const k = d.kpis;

  return (
    <div className="page dash-simple">
      <div className="page-head"><div><h1>Hi {user.name.split(' ')[0]} 👋</h1><p className="muted">Here’s where your leads stand right now.</p></div></div>

      {!hidePush && (push === 'default' || push === 'granted') && (
        <div className="push-banner">
          <BellRing size={20} />
          <p><b>Never miss a lead.</b> Get instant alerts for new leads and follow-up reminders on this device.</p>
          <Button variant="yellow" size="sm" onClick={async () => { try { await enablePush(); setPush('subscribed'); toast.success('Notifications on for this device'); } catch (e) { toast.error(e.message); } }}>Turn on</Button>
          <button className="link small" onClick={() => { setHidePush(true); try { localStorage.setItem('dg_push_banner', 'hide'); } catch { /* ignore */ } }}>Not now</button>
        </div>
      )}

      <section className="dash-sec">
        <div className="sec-head"><h2>Lead stages</h2><Link to="/leads" className="link">View all</Link></div>
        <div className="stage-tiles">
          {d.stages.map((s) => (
            <div key={s.key} className="stage-tile" style={{ '--c': s.color }} role="link" tabIndex={0}
              onClick={() => nav(`/leads?status=${s.key}`)} onKeyDown={(e) => { if (e.key === 'Enter') nav(`/leads?status=${s.key}`); }}>
              <span>{s.label}</span><b>{s.count}</b>
              {s.needsBudget && s.noBudget > 0
                ? <button className="nb-badge" onClick={(e) => { e.stopPropagation(); nav(`/pipeline-value?tab=missing&stage=${s.key}`); }}>{s.noBudget} no budget</button>
                : <small>{s.count === 1 ? 'lead' : 'leads'}</small>}
            </div>
          ))}
        </div>
      </section>

      <section className="dash-sec">
        <div className="sec-head"><h2>Lead analysis</h2></div>
        <div className="tiles">
          <Tile icon={Users} label="Total" value={k.total} to="/leads" />
          <Tile icon={UserX} label="Untouched" value={k.untouched} sub="Still Open" to="/leads?status=NEW" />
          <Tile icon={UserMinus} label="Unassigned" value={k.unassigned} to="/leads?assignedTo=unassigned" />
          <Tile icon={BellOff} label="No follow-up" value={k.noReminder} sub="Open leads without a reminder" to="/leads?followup=none" />
        </div>
      </section>

      <section className="dash-sec">
        <div className="sec-head"><h2>Today</h2></div>
        <div className="tiles">
          <Tile icon={CalendarDays} label="New leads" value={k.todaysLeads} to={`/leads?from=${dateInTz(0)}&to=${dateInTz(0)}`} />
          <Tile icon={Repeat} label="Returning" value={k.returningToday} sub="Enquired again" />
          <Tile icon={CalendarClock} label="Follow-ups due" value={k.followupsToday} sub={`${k.followupsUpcoming} upcoming`} to="/followups?bucket=today" />
          <Tile icon={AlarmClock} label="Overdue" value={k.followupsOverdue} to="/followups?bucket=overdue" tone={k.followupsOverdue ? 'tile--red' : ''} />
        </div>
      </section>

      <section className="dash-sec">
        <div className="sec-head"><h2>Value</h2></div>
        <div className="tiles">
          <Tile icon={Wallet} label="Open pipeline value" value={fmtINR(k.pipelineValue, { compact: true })} sub={`${k.pipelineLeads} leads with a budget · tap to see`} to="/pipeline-value" tone="tile--dark" />
          <Tile icon={AlertCircle} label="No budget (Hot/Warm/Cold)" value={k.needBudget} sub={d.stages.filter((x) => x.noBudget).map((x) => `${x.label} ${x.noBudget}`).join(' · ') || 'All have a budget'} to="/pipeline-value?tab=missing" tone={k.needBudget ? 'tile--amber' : ''} />
          <Tile icon={BadgeCheck} label="Booked" value={k.booked} sub={`${fmtINR(k.bookedValue, { compact: true })} · ${k.conversionRate}% of leads`} to="/booked" tone="tile--green" />
          <Tile icon={XCircle} label="Lost" value={k.lost} to="/leads?status=LOST" />
        </div>
      </section>

      <div className="dash-cols">
        <section className="card">
          <header className="card-head"><h3>Today’s follow-ups</h3><Link className="link" to="/followups?bucket=today">View all</Link></header>
          {d.lists.todayFollowups.length ? (
            <ul className="mini-list">
              {d.lists.todayFollowups.map((f) => (
                <li key={f._id} onClick={() => nav(`/leads/${f.lead?._id}`)}>
                  <span className="ml-time">{fmtTime(f.dueAt)}</span>
                  <span className="ml-main"><b>{f.lead?.name}</b><small>{f.type} · {f.lead?.phone}</small></span>
                  <StatusBadge status={f.lead?.status} />
                </li>
              ))}
            </ul>
          ) : <Empty title="No follow-ups today" />}
        </section>
        <section className="card">
          <header className="card-head"><h3>Overdue follow-ups</h3><Link className="link" to="/followups?bucket=overdue">View all</Link></header>
          {d.lists.overdueFollowups.length ? (
            <ul className="mini-list">
              {d.lists.overdueFollowups.map((f) => (
                <li key={f._id} onClick={() => nav(`/leads/${f.lead?._id}`)}>
                  <span className="ml-time t-red">{relTime(f.dueAt)}</span>
                  <span className="ml-main"><b>{f.lead?.name}</b><small>{f.type} · due {fmtDate(f.dueAt)}</small></span>
                  <StatusBadge status={f.lead?.status} />
                </li>
              ))}
            </ul>
          ) : <Empty title="Nothing overdue" />}
        </section>
        <section className="card">
          <header className="card-head"><h3>Where leads come from</h3></header>
          <Bars rows={d.bySource} secondary={{ key: 'booked', label: 'booked' }} />
        </section>
        <section className="card">
          <header className="card-head"><h3>Services asked for</h3></header>
          <Bars rows={d.byService} />
        </section>
        <section className="card">
          <header className="card-head"><h3>Why leads were lost</h3></header>
          <Bars rows={d.lostReasons} empty="No lost leads" />
        </section>
        <section className="card">
          <header className="card-head"><h3>Latest leads</h3><Link className="link" to="/leads">All leads</Link></header>
          <ul className="mini-list">
            {d.lists.recent.map((l) => (
              <li key={l._id} onClick={() => nav(`/leads/${l._id}`)}>
                <span className="ml-time">{relTime(l.createdAt)}</span>
                <span className="ml-main"><b>{l.name}</b><small>{l.service?.label || 'No service'} · {l.source?.label || '—'}</small></span>
                <StatusBadge status={l.status} />
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
