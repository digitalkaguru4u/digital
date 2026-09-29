import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarClock, CheckCircle2, Phone, MessageCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useData, useToast } from '../lib/context';
import { fmtDate, fmtDateTime, fmtTime, relTime, PRIORITY, fmtINR, amountOf } from '../lib/format';
import { Button, Empty, MultiSelect, Pagination, Spinner, StatusBadge } from '../components/ui';
import { CommModal, CompleteFollowupModal, FollowupModal } from '../components/modals';

const BUCKETS = [['today', 'Today'], ['overdue', 'Overdue'], ['upcoming', 'Upcoming'], ['completed', 'Completed']];

export default function Followups() {
  const [sp, setSp] = useSearchParams();
  const bucket = sp.get('bucket') || 'today';
  const { can } = useAuth();
  const { activeFollowupTypes, followupTypeByKey, team } = useData();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [types, setTypes] = useState([]);
  const [assigned, setAssigned] = useState('');
  const [modal, setModal] = useState(null);

  const load = useCallback(() => {
    api('/followups', { query: { bucket, page, type: types, assignedTo: assigned } }).then(setData).catch((e) => toast.error(e.message));
  }, [bucket, page, types, assigned, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [bucket, types, assigned]);

  const cancel = async (f) => { await api(`/followups/${f._id}/cancel`, { method: 'POST', body: {} }); toast.success('Cancelled'); load(); };
  const done = () => { setModal(null); load(); };

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Follow-ups</h1><p className="muted">Stay on top of every call, message and meeting.</p></div>
        <div className="filters filters--inline">
          <MultiSelect label="Type" value={types} onChange={setTypes} options={activeFollowupTypes.map((t) => ({ value: t.key, label: t.label }))} />
          {can('leads:view_all') && (
            <select className="select-sm" value={assigned} onChange={(e) => setAssigned(e.target.value)} aria-label="Assigned to">
              <option value="">Everyone</option>{team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
            </select>
          )}
        </div>
      </div>
      <div className="bucket-tabs">
        {BUCKETS.map(([k, l]) => (
          <button key={k} className={`bucket bucket--${k} ${bucket === k ? 'is-on' : ''}`} onClick={() => setSp({ bucket: k })}>
            <span>{l}</span><b>{data?.counts?.[k] ?? '–'}</b>
          </button>
        ))}
      </div>
      {!data ? <Spinner /> : data.items.length === 0 ? (
        <Empty icon={CalendarClock} title={bucket === 'overdue' ? 'Nothing overdue' : bucket === 'today' ? 'No follow-ups due today' : 'No follow-ups here'} text="Schedule follow-ups from a lead’s profile or the Leads list." />
      ) : (
        <ul className="fu-cards">
          {data.items.map((f) => (
            <li key={f._id} className={`fu-card fu-card--${bucket}`}>
              <div className="fu-card-when">
                <b>{bucket === 'today' ? fmtTime(f.dueAt) : fmtDate(f.dueAt)}</b>
                <small>{bucket === 'completed' ? `done ${relTime(f.completedAt)}` : bucket === 'today' ? relTime(f.dueAt) : bucket === 'overdue' ? relTime(f.dueAt) : fmtTime(f.dueAt)}</small>
              </div>
              <div className="fu-card-main">
                <div className="fu-card-title">
                  <Link to={`/leads/${f.lead?._id}`}><b>{f.lead?.name}</b></Link>
                  <span className="muted small">{f.lead?.leadId}</span>
                  <StatusBadge status={f.lead?.status} />{amountOf(f.lead?.budget) ? <span className="pill">{fmtINR(amountOf(f.lead.budget))}</span> : null}
                </div>
                <p className="small"><b>{followupTypeByKey[f.type]?.label || f.type}</b> · <span className={`pill pill--${f.priority}`}>{PRIORITY[f.priority]}</span> · {f.assignedTo?.name || 'Unassigned'}{f.rescheduleCount ? ` · rescheduled ${f.rescheduleCount}×` : ''}</p>
                {f.notes && <p className="muted small">{f.notes}</p>}
                {f.outcome && <p className="fu-outcome small"><CheckCircle2 size={13} /> {f.outcome} <span className="muted">— {f.completedBy?.name}, {fmtDateTime(f.completedAt)}</span></p>}
              </div>
              {f.status === 'pending' && (
                <div className="fu-card-actions">
                  {f.lead?.phone && <button className="icon-btn" onClick={() => setModal({ type: 'comm', channel: 'call', lead: f.lead })} aria-label="Call"><Phone size={16} /></button>}
                  {f.lead?.phone && <button className="icon-btn icon-btn--wa" onClick={() => setModal({ type: 'comm', channel: 'whatsapp', lead: f.lead })} aria-label="WhatsApp"><MessageCircle size={16} /></button>}
                  {can('followups:manage') && <>
                    <Button size="sm" icon={CheckCircle2} onClick={() => setModal({ type: 'complete', f })}>Complete</Button>
                    <Button size="sm" variant="secondary" onClick={() => setModal({ type: 'reschedule', f })}>Reschedule</Button>
                    <Button size="sm" variant="ghost" onClick={() => cancel(f)}>Cancel</Button>
                  </>}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {data && data.total > 50 && <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />}
      {modal?.type === 'complete' && <CompleteFollowupModal followup={modal.f} lead={modal.f.lead} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'reschedule' && <FollowupModal lead={modal.f.lead} followup={modal.f} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'comm' && <CommModal lead={{ ...modal.lead, service: null }} channel={modal.channel} onClose={() => setModal(null)} onDone={done} />}
    </div>
  );
}
