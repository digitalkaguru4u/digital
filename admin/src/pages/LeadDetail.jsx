import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Phone, MessageCircle, Mail, Pencil, Trash2, RotateCcw, CalendarPlus, StickyNote, ListPlus, Globe, Megaphone,
  Link2, FileText, Clock, Building2, Wallet, UserRound, CheckCircle2, CalendarClock, Sparkles, Flag, XCircle, BadgeCheck,
  PhoneCall, Send, IndianRupee, ChevronRight, CircleDot,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useData, useToast } from '../lib/context';
import { fmtDate, fmtDateTime, fmtINR, amountOf, relTime, FORM_LABEL, PAYMENT_STATUS, PRIORITY, splitTz, isPastDay, isToday } from '../lib/format';
import { Avatar, Button, Confirm, Empty, Field, Spinner, StageSelect } from '../components/ui';
import { BudgetModal, CommModal, CompleteFollowupModal, FollowupModal, LeadFormModal, StatusModal } from '../components/modals';

const ACT_ICON = {
  lead_created: Sparkles, enquiry: FileText, status_changed: Flag, temperature_changed: CircleDot, budget_changed: Wallet,
  assigned: UserRound, note_added: StickyNote, followup_scheduled: CalendarPlus, followup_completed: CheckCircle2,
  followup_rescheduled: CalendarClock, followup_cancelled: XCircle, call: PhoneCall, whatsapp: MessageCircle, email: Mail,
  task_created: ListPlus, task_updated: ListPlus, booking_updated: BadgeCheck, payment_added: IndianRupee, lead_updated: Pencil,
  lead_deleted: Trash2, lead_restored: RotateCcw, lost: XCircle,
};
const ACT_TONE = { lead_created: 'purple', enquiry: 'purple', lost: 'red', payment_added: 'green', booking_updated: 'green', followup_completed: 'green', whatsapp: 'green', call: 'yellow', status_changed: 'dark', note_added: 'yellow' };

function InfoRow({ icon: Icon, label, children }) {
  return <div className="info-row"><Icon size={15} /><span className="info-label">{label}</span><span className="info-val">{children || '—'}</span></div>;
}

function BookingCard({ lead, payments, onChanged }) {
  const { activeServices, team } = useData();
  const toast = useToast();
  const b = lead.booking || {};
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState({});
  const [pay, setPay] = useState({ amount: '', method: 'upi', reference: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setF({
      serviceBooked: b.serviceBooked?._id || '', finalBudget: b.finalBudget ?? '', bookingDate: b.bookingDate ? splitTz(b.bookingDate).date : '',
      paymentStatus: b.paymentStatus || 'pending', projectStartDate: b.projectStartDate ? splitTz(b.projectStartDate).date : '', assignedTo: b.assignedTo?._id || '', notes: b.notes || '',
    });
  }, [lead]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const paid = payments.reduce((a, p) => a + p.amount, 0);
  const save = async () => {
    setBusy(true);
    try {
      await api(`/leads/${lead._id}/booking`, { method: 'PATCH', body: {
        serviceBooked: f.serviceBooked || null, finalBudget: f.finalBudget === '' ? null : Number(f.finalBudget), bookingDate: f.bookingDate || null,
        paymentStatus: f.paymentStatus, projectStartDate: f.projectStartDate || null, assignedTo: f.assignedTo || null, notes: f.notes,
      } });
      toast.success('Booking saved'); setEdit(false); onChanged();
    } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const addPayment = async () => {
    if (!Number(pay.amount)) return;
    setBusy(true);
    try { await api(`/leads/${lead._id}/payments`, { method: 'POST', body: { ...pay, amount: Number(pay.amount) } }); toast.success('Payment recorded'); setPay({ amount: '', method: 'upi', reference: '' }); onChanged(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="card card--booking">
      <header className="card-head"><div><h3><BadgeCheck size={18} /> Booking</h3><p className="muted small">Deal details for this client</p></div>
        {!edit && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Edit</Button>}</header>
      {edit ? (
        <div className="grid-2">
          <Field label="Service booked"><select value={f.serviceBooked} onChange={set('serviceBooked')}><option value="">—</option>{activeServices.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}</select></Field>
          <Field label="Final agreed budget (₹)"><input type="number" min="0" value={f.finalBudget} onChange={set('finalBudget')} /></Field>
          <Field label="Booking date"><input type="date" value={f.bookingDate} onChange={set('bookingDate')} /></Field>
          <Field label="Project start date"><input type="date" value={f.projectStartDate} onChange={set('projectStartDate')} /></Field>
          <Field label="Payment status"><select value={f.paymentStatus} onChange={set('paymentStatus')}>{Object.entries(PAYMENT_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Team member"><select value={f.assignedTo} onChange={set('assignedTo')}><option value="">—</option>{team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</select></Field>
          <Field label="Notes" full><textarea rows={2} value={f.notes} onChange={set('notes')} /></Field>
          <div className="form-actions field--full"><Button variant="ghost" onClick={() => setEdit(false)}>Cancel</Button><Button loading={busy} onClick={save}>Save booking</Button></div>
        </div>
      ) : (
        <div className="booking-grid">
          <div><small>Service</small><b>{b.serviceBooked?.label || '—'}</b></div>
          <div><small>Final budget</small><b>{fmtINR(b.finalBudget)}</b></div>
          <div><small>Booked on</small><b>{fmtDate(b.bookingDate)}</b></div>
          <div><small>Project start</small><b>{fmtDate(b.projectStartDate)}</b></div>
          <div><small>Payment</small><b><span className={`pay pay--${b.paymentStatus}`}>{PAYMENT_STATUS[b.paymentStatus] || '—'}</span></b></div>
          <div><small>Team member</small><b>{b.assignedTo?.name || '—'}</b></div>
          {b.notes && <div className="span-all"><small>Notes</small><p>{b.notes}</p></div>}
        </div>
      )}
      <div className="payments">
        <div className="pay-head"><b>Payments</b><span className="muted small">{fmtINR(paid)} received{b.finalBudget ? ` of ${fmtINR(b.finalBudget)}` : ''}</span></div>
        {b.finalBudget > 0 && <div className="progress"><span style={{ width: `${Math.min(100, (paid / b.finalBudget) * 100)}%` }} /></div>}
        {payments.map((p) => <div key={p._id} className="pay-row"><span>{fmtDate(p.paidAt)}</span><span>{p.method.replace('_', ' ')}{p.reference ? ` · ${p.reference}` : ''}</span><b>{fmtINR(p.amount)}</b></div>)}
        <div className="pay-add">
          <input type="number" min="1" placeholder="Amount ₹" value={pay.amount} onChange={(e) => setPay((x) => ({ ...x, amount: e.target.value }))} aria-label="Payment amount" />
          <select value={pay.method} onChange={(e) => setPay((x) => ({ ...x, method: e.target.value }))} aria-label="Method"><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card</option><option value="cheque">Cheque</option><option value="other">Other</option></select>
          <input placeholder="Ref / UTR" value={pay.reference} onChange={(e) => setPay((x) => ({ ...x, reference: e.target.value }))} aria-label="Reference" />
          <Button size="sm" loading={busy} onClick={addPayment}>Add</Button>
        </div>
      </div>
    </section>
  );
}

export default function LeadDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { lookups, statusByKey, team, followupTypeByKey } = useData();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [tab, setTab] = useState('timeline');
  const [modal, setModal] = useState(null);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);

  const load = useCallback(() => api(`/leads/${id}`).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  if (err) return <div className="page"><Empty title="Lead not found" text={err} action={<Button variant="secondary" onClick={() => nav('/leads')}>Back to leads</Button>} /></div>;
  if (!d || !lookups) return <div className="page"><Spinner /></div>;
  const { lead, activities, notes, followups, communications, enquiries, payments } = d;
  const status = statusByKey[lead.status];
  const lostOpts = lookups.statuses.filter((s) => s.active && s.isLost);
  const pendingFu = followups.filter((f) => f.status === 'pending').sort((a, b) => new Date(a.dueAt) - new Date(b.dueAt));
  const editable = can('leads:edit') && !lead.isDeleted;

  const changeStatus = async (key) => {
    if (key === lead.status || !editable) return;
    if (statusByKey[key]?.requiresReason) { setModal({ type: 'status', status: key }); return; }
    try { await api(`/leads/${lead._id}/status`, { method: 'POST', body: { status: key } }); toast.success(`Status → ${statusByKey[key].label}`); load(); }
    catch (e) { toast.error(e.message); }
  };
  const assign = async (uid) => {
    try { await api(`/leads/${lead._id}/assign`, { method: 'POST', body: { assignedTo: uid || null } }); toast.success('Assignment updated'); load(); } catch (e) { toast.error(e.message); }
  };
  const addNote = async (e) => {
    e.preventDefault();
    if (!note.trim()) return;
    setNoteBusy(true);
    try { await api(`/leads/${lead._id}/notes`, { method: 'POST', body: { text: note } }); setNote(''); toast.success('Note added'); load(); }
    catch (e2) { toast.error(e2.message); } finally { setNoteBusy(false); }
  };
  const cancelFu = async (f) => { await api(`/followups/${f._id}/cancel`, { method: 'POST', body: {} }); toast.success('Follow-up cancelled'); load(); };
  const done = () => { setModal(null); load(); };
  const utm = lead.utm || {};

  const TABS = [
    ['timeline', 'Timeline', activities.length], ['notes', 'Notes', notes.length], ['followups', 'Follow-ups', followups.length],
    ['enquiries', 'Enquiries', enquiries.length], ['comms', 'Communication', communications.length],
  ];

  return (
    <div className="page lead-page">
      <Link to="/leads" className="back"><ArrowLeft size={16} /> All leads</Link>
      {lead.isDeleted && <div className="alert-strip alert-strip--warn">This lead is in trash. <button className="link" onClick={async () => { await api(`/leads/${lead._id}/restore`, { method: 'POST' }); load(); }}>Restore lead</button></div>}

      <header className="lead-head">
        <div className="lead-id">
          <Avatar name={lead.name} size={56} />
          <div>
            <div className="lead-title"><h1>{lead.name}</h1></div>
            <p className="muted">{lead.leadId} · {lead.company || 'No company'} · Created {fmtDateTime(lead.createdAt)}{lead.enquiryCount > 1 ? ` · ${lead.enquiryCount} enquiries` : ''}</p>
          </div>
        </div>
        <div className="lead-actions">
          <Button variant="secondary" icon={Phone} onClick={() => setModal({ type: 'comm', channel: 'call' })}>Call</Button>
          <Button variant="whatsapp" icon={MessageCircle} onClick={() => setModal({ type: 'comm', channel: 'whatsapp' })}>WhatsApp</Button>
          <Button variant="secondary" icon={Mail} onClick={() => setModal({ type: 'comm', channel: 'email' })}>Email</Button>
          {editable && <Button variant="ghost" icon={Pencil} onClick={() => setModal({ type: 'edit' })}>Edit</Button>}
          {can('leads:delete') && !lead.isDeleted && <Button variant="ghost" icon={Trash2} onClick={() => setModal({ type: 'delete' })} aria-label="Delete" />}
        </div>
      </header>

      <section className="card stage-card">
        <div className="stage-card-row">
          <div className="stage-field">
            <p className="field-label">Stage</p>
            <StageSelect value={lead.status} onChange={changeStatus} disabled={!editable} size="lg" />
          </div>
          <button className="stage-field budget-field" onClick={() => editable && setModal({ type: 'budget' })} disabled={!editable}>
            <p className="field-label">Budget</p>
            <b className={amountOf(lead.budget) ? '' : 'muted'}>{amountOf(lead.budget) ? fmtINR(amountOf(lead.budget)) : '+ Add amount'}</b>
            {status?.needsBudget && !amountOf(lead.budget) && <small className="t-amber">Add a budget for this {status.label} lead</small>}
          </button>
          <div className="stage-field">
            <p className="field-label">Next follow-up</p>
            <b className={pendingFu[0] && isPastDay(pendingFu[0].dueAt) ? 't-red' : pendingFu[0] && isToday(pendingFu[0].dueAt) ? 't-amber' : 'muted'}>{pendingFu[0] ? fmtDateTime(pendingFu[0].dueAt) : 'None'}</b>
          </div>
          <div className="stage-actions">
            {pendingFu[0] && can('followups:manage') && <Button size="sm" icon={CheckCircle2} onClick={() => setModal({ type: 'complete', followup: pendingFu[0] })}>Complete follow-up</Button>}
            {can('followups:manage') && !lead.isDeleted && <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => setModal({ type: 'followup' })}>Add follow-up</Button>}
            {editable && lostOpts.filter((x) => x.key !== lead.status).map((x) => <Button key={x.key} size="sm" variant="ghost" icon={XCircle} onClick={() => changeStatus(x.key)}>Mark {x.label}</Button>)}
          </div>
        </div>
        {status?.isLost && (lead.lostReason || lead.lostReasonText) && (
          <p className="lost-reason"><XCircle size={15} /> Lost reason: <b>{lead.lostReason?.label}</b>{lead.lostReasonText ? ` — ${lead.lostReasonText}` : ''} <span className="muted">({fmtDate(lead.lostAt)})</span></p>
        )}
      </section>

      <div className="lead-grid">
        <div className="lead-side">
          <section className="card">
            <header className="card-head"><h3>Owner</h3></header>
            {can('leads:assign') && !lead.isDeleted ? (
              <select value={lead.assignedTo?._id || ''} onChange={(e) => assign(e.target.value)} aria-label="Assigned to"><option value="">Unassigned</option>{team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</select>
            ) : <b>{lead.assignedTo?.name || 'Unassigned'}</b>}
          </section>

          {(lead.booking || status?.isBooked) && <BookingCard lead={lead} payments={payments} onChanged={load} />}

          <section className="card">
            <header className="card-head"><h3>Lead information</h3></header>
            <InfoRow icon={Phone} label="Phone">{lead.phone && <a href={`tel:${lead.phone}`}>{lead.phone}</a>}</InfoRow>
            <InfoRow icon={Mail} label="Email">{lead.email && <a href={`mailto:${lead.email}`}>{lead.email}</a>}</InfoRow>
            <InfoRow icon={Building2} label="Company">{lead.company}</InfoRow>
            <InfoRow icon={Sparkles} label="Service">{lead.service?.label}</InfoRow>
            <InfoRow icon={Globe} label="Source">{lead.source?.label}</InfoRow>
            <InfoRow icon={Megaphone} label="Campaign">{lead.campaign?.name || utm.campaign}</InfoRow>
            <InfoRow icon={FileText} label="Form used">{FORM_LABEL[lead.formUsed] || lead.formUsed}</InfoRow>
            <InfoRow icon={MessageCircle} label="Prefers">{lead.preferredContact}</InfoRow>
            <InfoRow icon={Clock} label="Last contacted">{lead.lastContactedAt ? `${fmtDateTime(lead.lastContactedAt)} (${relTime(lead.lastContactedAt)})` : 'Never'}</InfoRow>
            {lead.message && <div className="lead-msg"><p className="field-label">Message</p><p>{lead.message}</p></div>}
            <details className="utm">
              <summary>Tracking & attribution <ChevronRight size={14} /></summary>
              <InfoRow icon={Link2} label="Landing page">{lead.landingPage && <a href={lead.landingPage} target="_blank" rel="noopener noreferrer">{lead.landingPage.replace(/^https?:\/\//, '')}</a>}</InfoRow>
              <InfoRow icon={Link2} label="Referrer">{lead.referrer}</InfoRow>
              {['source', 'medium', 'campaign', 'content', 'term'].map((k) => <InfoRow key={k} icon={CircleDot} label={`utm_${k}`}>{utm[k]}</InfoRow>)}
              {utm.gclid && <InfoRow icon={CircleDot} label="gclid">{utm.gclid.slice(0, 24)}…</InfoRow>}
              {utm.fbclid && <InfoRow icon={CircleDot} label="fbclid">{utm.fbclid.slice(0, 24)}…</InfoRow>}
            </details>
          </section>
        </div>

        <div className="lead-main">
          {!lead.isDeleted && (
            <form className="card composer" onSubmit={addNote}>
              <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note about this lead… (e.g. budget discussed, wants proposal by Friday)" aria-label="New note" />
              <div className="composer-actions">
                <div className="composer-quick">
                  {can('followups:manage') && <Button type="button" size="sm" variant="ghost" icon={CalendarPlus} onClick={() => setModal({ type: 'followup' })}>Follow-up</Button>}
                  <Button type="button" size="sm" variant="ghost" icon={PhoneCall} onClick={() => setModal({ type: 'comm', channel: 'call' })}>Log call</Button>
                </div>
                <Button type="submit" size="sm" icon={Send} loading={noteBusy} disabled={!note.trim()}>Add note</Button>
              </div>
            </form>
          )}

          <div className="tabs" role="tablist">
            {TABS.map(([k, l, n]) => <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'is-on' : ''} onClick={() => setTab(k)}>{l}<em>{n}</em></button>)}
          </div>

          <section className="card tab-card">
            {tab === 'timeline' && (
              <ol className="timeline">
                {activities.map((a) => {
                  const Icon = ACT_ICON[a.type] || CircleDot;
                  return (
                    <li key={a._id} className={`tl tl--${ACT_TONE[a.type] || 'default'}`}>
                      <span className="tl-ico"><Icon size={15} /></span>
                      <div className="tl-body">
                        <div className="tl-head"><b>{a.title}</b><time title={fmtDateTime(a.createdAt)}>{fmtDateTime(a.createdAt)}</time></div>
                        {a.description && <p className="tl-desc">{a.description}</p>}
                        <span className="tl-by">{a.user?.name || 'Website / system'}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}

            {tab === 'notes' && (notes.length ? (
              <ul className="notes">
                {notes.map((n) => <li key={n._id}><p>{n.text}</p><span className="muted small">{n.createdBy?.name} · {fmtDateTime(n.createdAt)}</span></li>)}
              </ul>
            ) : <Empty icon={StickyNote} title="No notes yet" text="Use the box above to add the first note." />)}

            {tab === 'followups' && (followups.length ? (
              <ul className="fu-list">
                {followups.map((f) => (
                  <li key={f._id} className={`fu fu--${f.status} ${f.status === 'pending' && isPastDay(f.dueAt) ? 'fu--overdue' : ''}`}>
                    <div className="fu-when"><b>{fmtDate(f.dueAt)}</b><small>{splitTz(f.dueAt).time}</small></div>
                    <div className="fu-main">
                      <b>{followupTypeByKey[f.type]?.label || f.type} <span className={`pill pill--${f.priority}`}>{PRIORITY[f.priority]}</span> <span className={`pill pill--st-${f.status}`}>{f.status}</span></b>
                      {f.notes && <p>{f.notes}</p>}
                      {f.outcome && <p className="fu-outcome"><CheckCircle2 size={13} /> {f.outcome}</p>}
                      <small className="muted">{f.assignedTo?.name || 'Unassigned'}{f.rescheduleCount ? ` · rescheduled ${f.rescheduleCount}×` : ''}{f.completedAt ? ` · done ${fmtDateTime(f.completedAt)}` : ''}</small>
                    </div>
                    {f.status === 'pending' && can('followups:manage') && (
                      <div className="fu-actions">
                        <Button size="sm" icon={CheckCircle2} onClick={() => setModal({ type: 'complete', followup: f })}>Complete</Button>
                        <Button size="sm" variant="ghost" onClick={() => setModal({ type: 'reschedule', followup: f })}>Reschedule</Button>
                        <Button size="sm" variant="ghost" onClick={() => cancelFu(f)}>Cancel</Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            ) : <Empty icon={CalendarClock} title="No follow-ups" action={can('followups:manage') && <Button icon={CalendarPlus} onClick={() => setModal({ type: 'followup' })}>Schedule follow-up</Button>} />)}

            {tab === 'enquiries' && (
              <ul className="enq-list">
                {enquiries.map((e) => (
                  <li key={e._id}>
                    <div className="tl-head"><b>{FORM_LABEL[e.formUsed] || e.formUsed || 'Enquiry'}{e.merged && <span className="pill pill--default">merged</span>}</b><time>{fmtDateTime(e.createdAt)}</time></div>
                    <p className="muted small">{[e.service?.label, e.budgetLabel, e.source?.label, e.utm?.campaign && `Campaign: ${e.utm.campaign}`].filter(Boolean).join(' · ') || '—'}</p>
                    {e.message && <p>{e.message}</p>}
                    {e.pageUrl && <a className="small" href={e.pageUrl} target="_blank" rel="noopener noreferrer">{e.pageUrl.replace(/^https?:\/\//, '')}</a>}
                  </li>
                ))}
              </ul>
            )}

            {tab === 'comms' && (communications.length ? (
              <ul className="notes">
                {communications.map((c) => (
                  <li key={c._id}><b className="cap">{c.direction === 'inbound' ? 'Incoming' : 'Outgoing'} {c.channel}{c.outcome ? ` · ${c.outcome.replace(/_/g, ' ')}` : ''}</b>{c.subject && <p><b>{c.subject}</b></p>}{c.message && <p>{c.message}</p>}<span className="muted small">{c.user?.name} · {fmtDateTime(c.createdAt)}</span></li>
                ))}
              </ul>
            ) : <Empty icon={MessageCircle} title="No communication logged" text="Calls, WhatsApp messages and emails sent from here are logged automatically." />)}
          </section>
        </div>
      </div>

      {/* Mobile quick actions */}
      <nav className="lead-mobile-bar" aria-label="Quick actions">
        <a href={`tel:${lead.phone}`} onClick={(e) => { e.preventDefault(); setModal({ type: 'comm', channel: 'call' }); }}><Phone size={19} />Call</a>
        <button onClick={() => setModal({ type: 'comm', channel: 'whatsapp' })}><MessageCircle size={19} />WhatsApp</button>
        <label className="lm-status"><Flag size={19} />Status
          <select value={lead.status} onChange={(e) => changeStatus(e.target.value)} disabled={!editable} aria-label="Change status">
            {lookups.statuses.filter((s) => s.active || s.key === lead.status).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </label>
        <button onClick={() => setModal({ type: 'followup' })}><CalendarPlus size={19} />Follow-up</button>
        <button onClick={() => { setTab('notes'); document.querySelector('.composer textarea')?.focus(); }}><StickyNote size={19} />Note</button>
      </nav>

      {modal?.type === 'status' && <StatusModal lead={lead} status={modal.status} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'comm' && <CommModal lead={lead} channel={modal.channel} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'edit' && <LeadFormModal open lead={lead} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.type === 'budget' && <BudgetModal lead={lead} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'followup' && <FollowupModal lead={lead} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'reschedule' && <FollowupModal lead={lead} followup={modal.followup} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'complete' && <CompleteFollowupModal lead={lead} followup={modal.followup} onClose={() => setModal(null)} onDone={done} />}
      <Confirm open={modal?.type === 'delete'} title="Delete this lead?" danger confirmLabel="Delete" text="The lead moves to trash. Its full history is kept and it can be restored."
        onClose={() => setModal(null)} onConfirm={async () => { await api(`/leads/${lead._id}`, { method: 'DELETE' }); toast.success('Lead deleted'); nav('/leads'); }} />
    </div>
  );
}
