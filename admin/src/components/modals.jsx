import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Phone, MessageCircle, Mail, ExternalLink } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useData, useToast } from '../lib/context';
import { Button, Field, Modal, StatusBadge } from './ui';
import { dateInTz, fillTemplate, fmtDateTime, splitTz, waNumber, fmtINR, amountOf } from '../lib/format';

const idOf = (x) => (x && typeof x === 'object' ? x._id : x) || '';

/* ───────────────────── Create / edit lead (with duplicate detection) ───────────────────── */
export function LeadFormModal({ open, onClose, lead, onSaved }) {
  const { activeServices, activeSources, activeStatuses, team } = useData();
  const { can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const editing = !!lead;
  const [f, setF] = useState(() => ({
    name: lead?.name || '', phone: lead?.phone || '', email: lead?.email || '', company: lead?.company || '',
    service: idOf(lead?.service), source: idOf(lead?.source), message: lead?.message || '', preferredContact: lead?.preferredContact || '',
    budget: '', status: 'NEW', assignedTo: '',
    utmCampaign: '',
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [dups, setDups] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const payload = (force = false) => {
    const body = {
      name: f.name, phone: f.phone, email: f.email, company: f.company, service: f.service || null, source: f.source || null,
      message: f.message, preferredContact: f.preferredContact, force,
    };
    if (!editing) {
      Object.assign(body, {
        budget: f.budget || null, status: f.status, assignedTo: f.assignedTo || null, utm: f.utmCampaign ? { campaign: f.utmCampaign } : undefined,
      });
    }
    return body;
  };

  const save = async (force = false) => {
    setErr(''); setBusy(true);
    try {
      const r = editing
        ? await api(`/leads/${lead._id}`, { method: 'PATCH', body: payload(force) })
        : await api('/leads', { method: 'POST', body: payload(force) });
      toast.success(editing ? 'Lead updated' : `Lead ${r.lead.leadId} created`);
      onSaved?.(r.lead);
    } catch (e) {
      if (e.status === 409 && e.body?.duplicates) setDups(e.body.duplicates);
      else setErr(e.message);
    } finally { setBusy(false); }
  };

  const addEnquiryToExisting = async (d) => {
    setBusy(true);
    try {
      await api(`/leads/${d._id}/enquiries`, { method: 'POST', body: { service: f.service || null, source: f.source || null, message: f.message, budget: f.budget || null } });
      toast.success(`Enquiry added to ${d.leadId}`);
      onClose(); nav(`/leads/${d._id}`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const updateExisting = async (d) => {
    setBusy(true);
    try {
      const body = { force: true };
      ['company', 'message'].forEach((k) => { if (f[k]) body[k] = f[k]; });
      if (f.email && !d.email) body.email = f.email;
      if (f.phone && !d.phone) body.phone = f.phone;
      if (f.service) body.service = f.service;
      if (f.source) body.source = f.source;
      await api(`/leads/${d._id}`, { method: 'PATCH', body });
      if (f.budget) await api(`/leads/${d._id}/budget`, { method: 'POST', body: { amount: f.budget } });
      toast.success(`${d.leadId} updated`);
      onClose(); nav(`/leads/${d._id}`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  if (dups) {
    return (
      <Modal open={open} onClose={onClose} title="Existing lead found" subtitle="A lead with this phone number or email already exists." size="md"
        footer={<>
          <Button variant="ghost" onClick={() => setDups(null)}>Back to form</Button>
          {!editing && <Button variant="secondary" loading={busy} onClick={() => save(true)}>Create separate lead anyway</Button>}
          {editing && <Button variant="secondary" loading={busy} onClick={() => save(true)}>Save anyway</Button>}
        </>}>
        <div className="dup-list">
          {dups.map((d) => (
            <div key={d._id} className="dup">
              <div className="dup-head">
                <div><b>{d.name}</b> <span className="muted">· {d.leadId}</span></div>
                <StatusBadge status={d.status} />
              </div>
              <p className="muted small">{[d.phone, d.email, d.service?.label, d.assignedTo?.name && `Owner: ${d.assignedTo.name}`].filter(Boolean).join(' · ')} · Created {fmtDateTime(d.createdAt)}</p>
              {!editing && (
                <div className="dup-actions">
                  <Button size="sm" loading={busy} onClick={() => updateExisting(d)}>Update existing lead</Button>
                  <Button size="sm" variant="secondary" loading={busy} onClick={() => addEnquiryToExisting(d)}>Add as new enquiry</Button>
                  <Button size="sm" variant="ghost" onClick={() => { onClose(); nav(`/leads/${d._id}`); }}>Open <ExternalLink size={14} /></Button>
                </div>
              )}
            </div>
          ))}
        </div>
        {err && <p className="form-err">{err}</p>}
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? `Edit ${lead.leadId}` : 'New lead'} size="lg"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => save(false)}>{editing ? 'Save changes' : 'Create lead'}</Button></>}>
      <form className="grid-2" onSubmit={(e) => { e.preventDefault(); save(false); }}>
        <Field label="Name *"><input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Phone"><input value={f.phone} onChange={set('phone')} inputMode="tel" placeholder="+91…" /></Field>
        <Field label="Email"><input type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Company"><input value={f.company} onChange={set('company')} /></Field>
        <Field label="Service">
          <select value={f.service} onChange={set('service')}><option value="">—</option>{activeServices?.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}</select>
        </Field>
        <Field label="Source">
          <select value={f.source} onChange={set('source')}><option value="">—</option>{activeSources?.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}</select>
        </Field>
        {!editing && (
          <>
            <Field label="Stage">
              <select value={f.status} onChange={set('status')}>{activeStatuses?.filter((x) => !x.requiresReason).map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
            </Field>
            <Field label="Budget (₹)" hint="e.g. 25000, 35k or 1.5L"><input value={f.budget} onChange={set('budget')} inputMode="numeric" placeholder="Amount" /></Field>
            {can('leads:assign') && (
              <Field label="Assign to"><select value={f.assignedTo} onChange={set('assignedTo')}><option value="">Unassigned</option>{team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</select></Field>
            )}
            <Field label="Campaign (optional)" hint="Matches UTM campaign names used in ads"><input value={f.utmCampaign} onChange={set('utmCampaign')} /></Field>
          </>
        )}
        <Field label="Preferred contact">
          <select value={f.preferredContact} onChange={set('preferredContact')}><option value="">—</option><option value="call">Call</option><option value="whatsapp">WhatsApp</option><option value="email">Email</option></select>
        </Field>
        <Field label="Message / requirement" full><textarea rows={3} value={f.message} onChange={set('message')} /></Field>
        <button type="submit" hidden />
      </form>
      {err && <p className="form-err">{err}</p>}
    </Modal>
  );
}

/* ───────────────────── Status change (asks for reason when required) ───────────────────── */
export function StatusModal({ lead, status, onClose, onDone }) {
  const { statusByKey, activeLostReasons } = useData();
  const toast = useToast();
  const def = statusByKey[status];
  const [reason, setReason] = useState('');
  const [reasonText, setReasonText] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async () => {
    if (def?.requiresReason && !reason) { setErr('Please select a reason'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api(`/leads/${lead._id}/status`, { method: 'POST', body: { status, lostReason: reason || null, lostReasonText: reasonText, note } });
      toast.success(`Moved to ${def?.label || status}`);
      onDone?.(r.lead);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`Mark as ${def?.label || status}`} subtitle={`${lead.name} · ${lead.leadId}`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={def?.isLost ? 'danger' : 'primary'} loading={busy} onClick={submit}>Confirm</Button></>}>
      {def?.requiresReason && (
        <>
          <Field label="Reason *">
            <select value={reason} onChange={(e) => setReason(e.target.value)} autoFocus>
              <option value="">Select a reason…</option>
              {activeLostReasons.map((r) => <option key={r._id} value={r._id}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Details (optional)"><input value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="e.g. Chose a local freelancer" /></Field>
          <p className="muted small">The reason is saved permanently in the lead history. Pending follow-ups will be cancelled.</p>
        </>
      )}
      {def?.isBooked && <p className="muted small">Booking details (final budget, payment status, start date) open on the lead profile after this step.</p>}
      <Field label="Note (optional)"><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      {err && <p className="form-err">{err}</p>}
    </Modal>
  );
}

/* ───────────────────── Schedule / reschedule follow-up ───────────────────── */
export function FollowupModal({ lead, followup, onClose, onDone }) {
  const { activeFollowupTypes, team, app } = useData();
  const toast = useToast();
  const reschedule = !!followup;
  const init = followup ? splitTz(followup.dueAt) : { date: dateInTz(1), time: app.settings?.defaultFollowupTime || '11:00' };
  const [f, setF] = useState({
    date: init.date, time: init.time, type: followup?.type || activeFollowupTypes?.[0]?.key || 'call',
    assignedTo: idOf(lead?.assignedTo) || '', priority: 'medium', reminderMinutes: app.settings?.defaultReminderMinutes ?? 15, notes: '', reason: '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const quick = (days) => setF((x) => ({ ...x, date: dateInTz(days) }));
  const submit = async () => {
    setBusy(true); setErr('');
    try {
      if (reschedule) await api(`/followups/${followup._id}/reschedule`, { method: 'POST', body: { date: f.date, time: f.time, reason: f.reason } });
      else await api('/followups', { method: 'POST', body: { lead: lead._id, date: f.date, time: f.time, type: f.type, assignedTo: f.assignedTo || null, priority: f.priority, reminderMinutes: Number(f.reminderMinutes), notes: f.notes } });
      toast.success(reschedule ? 'Follow-up rescheduled' : 'Follow-up scheduled');
      onDone?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={reschedule ? 'Reschedule follow-up' : 'Schedule follow-up'} subtitle={lead ? `${lead.name} · ${lead.leadId}` : ''} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>{reschedule ? 'Reschedule' : 'Schedule'}</Button></>}>
      <div className="quick-dates">
        {[['Today', 0], ['Tomorrow', 1], ['In 3 days', 3], ['Next week', 7]].map(([l, d]) => (
          <button key={l} type="button" className={`chip ${f.date === dateInTz(d) ? 'chip--on' : ''}`} onClick={() => quick(d)}>{l}</button>
        ))}
      </div>
      <div className="grid-2">
        <Field label="Date"><input type="date" value={f.date} onChange={set('date')} /></Field>
        <Field label="Time"><input type="time" value={f.time} onChange={set('time')} /></Field>
        {!reschedule && (
          <>
            <Field label="Type"><select value={f.type} onChange={set('type')}>{activeFollowupTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
            <Field label="Priority"><select value={f.priority} onChange={set('priority')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
            <Field label="Assigned to"><select value={f.assignedTo} onChange={set('assignedTo')}><option value="">Lead owner / me</option>{team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}</select></Field>
            <Field label="Reminder"><select value={f.reminderMinutes} onChange={set('reminderMinutes')}><option value="0">No reminder</option><option value="5">5 min before</option><option value="15">15 min before</option><option value="30">30 min before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></Field>
            <Field label="Notes" full><textarea rows={2} value={f.notes} onChange={set('notes')} placeholder="What should be discussed?" /></Field>
          </>
        )}
        {reschedule && <Field label="Reason (optional)" full><input value={f.reason} onChange={set('reason')} /></Field>}
      </div>
      {err && <p className="form-err">{err}</p>}
    </Modal>
  );
}

/* ───────────────────── Complete follow-up (+ status, temp, next) ───────────────────── */
export function CompleteFollowupModal({ followup, lead, onClose, onDone }) {
  const { activeStatuses, activeLostReasons, activeFollowupTypes, statusByKey, app } = useData();
  const toast = useToast();
  const [f, setF] = useState({ outcome: '', addAsNote: true, status: '', lostReason: '', lostReasonText: '', budget: amountOf(lead?.budget) ? String(amountOf(lead.budget)) : '', next: false, nDate: dateInTz(2), nTime: app.settings?.defaultFollowupTime || '11:00', nType: followup.type, nPriority: 'medium' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const needsReason = f.status && statusByKey[f.status]?.requiresReason;
  const submit = async () => {
    if (needsReason && !f.lostReason) { setErr('Select a reason'); return; }
    setBusy(true); setErr('');
    try {
      await api(`/followups/${followup._id}/complete`, {
        method: 'POST',
        body: {
          outcome: f.outcome, addAsNote: f.addAsNote && !!f.outcome, status: f.status, lostReason: f.lostReason || null, lostReasonText: f.lostReasonText,
          budget: f.budget === '' ? undefined : f.budget,
          next: f.next ? { date: f.nDate, time: f.nTime, type: f.nType, priority: f.nPriority } : null,
        },
      });
      toast.success('Follow-up completed');
      onDone?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Complete follow-up" subtitle={lead ? `${lead.name} · due ${fmtDateTime(followup.dueAt)}` : ''} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Mark completed</Button></>}>
      <Field label="Outcome / what happened"><textarea rows={3} value={f.outcome} onChange={set('outcome')} placeholder="e.g. Spoke to client, wants proposal by Friday" /></Field>
      <label className="check"><input type="checkbox" checked={f.addAsNote} onChange={set('addAsNote')} /> Also save outcome as a note</label>
      <div className="grid-2">
        <Field label="Change stage"><select value={f.status} onChange={set('status')}><option value="">Keep {lead ? statusByKey[lead.status]?.label : 'current'}</option>{activeStatuses.filter((s) => s.key !== lead?.status).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></Field>
        <Field label="Budget (₹)"><input value={f.budget} onChange={set('budget')} inputMode="numeric" placeholder="Amount, e.g. 25000" /></Field>
        {needsReason && <Field label="Reason *"><select value={f.lostReason} onChange={set('lostReason')}><option value="">Select…</option>{activeLostReasons.map((r) => <option key={r._id} value={r._id}>{r.label}</option>)}</select></Field>}
        {needsReason && <Field label="Details"><input value={f.lostReasonText} onChange={set('lostReasonText')} /></Field>}
      </div>
      <label className="check"><input type="checkbox" checked={f.next} onChange={set('next')} /> Create next follow-up</label>
      {f.next && (
        <div className="grid-2 sub-box">
          <Field label="Date"><input type="date" value={f.nDate} onChange={set('nDate')} /></Field>
          <Field label="Time"><input type="time" value={f.nTime} onChange={set('nTime')} /></Field>
          <Field label="Type"><select value={f.nType} onChange={set('nType')}>{activeFollowupTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></Field>
          <Field label="Priority"><select value={f.nPriority} onChange={set('nPriority')}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option></select></Field>
        </div>
      )}
      {err && <p className="form-err">{err}</p>}
    </Modal>
  );
}

/* ───────────────────── Call / WhatsApp / Email ───────────────────── */
const CALL_OUTCOMES = [['connected', 'Connected'], ['no_answer', 'No answer'], ['busy', 'Busy'], ['switched_off', 'Switched off'], ['callback_requested', 'Call back requested'], ['wrong_number', 'Wrong number'], ['interested', 'Interested'], ['not_interested', 'Not interested']];

export function CommModal({ lead, channel, onClose, onDone }) {
  const { app } = useData();
  const { user } = useAuth();
  const toast = useToast();
  const vars = useMemo(() => ({
    name: (lead.name || '').replace(/^\[Demo\]\s*/, '').split(' ')[0],
    full_name: lead.name, service: lead.service?.label || '', service_for: lead.service?.label ? ` for ${lead.service.label}` : '',
    user: user?.name || 'Digital Guru', lead_id: lead.leadId,
  }), [lead, user]);
  const [msg, setMsg] = useState(() => fillTemplate(channel === 'email' ? app.settings?.emailTemplate : app.settings?.whatsappTemplate, vars));
  const [subject, setSubject] = useState(() => fillTemplate(app.settings?.emailSubject, vars));
  const [outcome, setOutcome] = useState(channel === 'call' ? 'connected' : 'sent');
  const [direction, setDirection] = useState('outbound');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const log = async () => api(`/leads/${lead._id}/communications`, { method: 'POST', body: { channel, direction, message: msg, subject: channel === 'email' ? subject : '', outcome } });

  const primary = async () => {
    setBusy(true); setErr('');
    try {
      if (channel === 'whatsapp') {
        window.open(`https://wa.me/${waNumber(lead.phone)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
      } else if (channel === 'email') {
        window.location.href = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
      }
      await log();
      toast.success(channel === 'call' ? 'Call logged' : channel === 'whatsapp' ? 'WhatsApp opened & logged' : 'Email drafted & logged');
      onDone?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const title = { call: 'Log a call', whatsapp: 'Send WhatsApp message', email: 'Send email' }[channel];
  const cta = { call: 'Save call log', whatsapp: 'Open WhatsApp & log', email: 'Open email app & log' }[channel];
  const Icon = { call: Phone, whatsapp: MessageCircle, email: Mail }[channel];
  const missing = (channel === 'email' && !lead.email) || (channel !== 'email' && !lead.phone);

  return (
    <Modal open onClose={onClose} title={title} subtitle={`${lead.name} · ${channel === 'email' ? lead.email || 'no email' : lead.phone || 'no phone'}`} size="md"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button icon={Icon} loading={busy} disabled={missing} onClick={primary}>{cta}</Button></>}>
      {missing && <p className="form-err"><AlertTriangle size={14} /> This lead has no {channel === 'email' ? 'email address' : 'phone number'}.</p>}
      {channel === 'call' && (
        <>
          <a className="btn btn--secondary btn--block call-now" href={`tel:${lead.phone}`}><Phone size={16} /> Call {lead.phone}</a>
          <div className="grid-2">
            <Field label="Direction"><select value={direction} onChange={(e) => setDirection(e.target.value)}><option value="outbound">Outgoing</option><option value="inbound">Incoming</option></select></Field>
            <Field label="Outcome"><select value={outcome} onChange={(e) => setOutcome(e.target.value)}>{CALL_OUTCOMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
          <Field label="Call notes"><textarea rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="What was discussed?" /></Field>
        </>
      )}
      {channel === 'whatsapp' && (
        <>
          <Field label="Message" hint="Edit before sending. Opens WhatsApp with this text — you press send there."><textarea rows={5} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
          <Field label="Log as"><select value={outcome} onChange={(e) => setOutcome(e.target.value)}><option value="sent">Sent</option><option value="replied">Customer replied</option></select></Field>
        </>
      )}
      {channel === 'email' && (
        <>
          <Field label="Subject"><input value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
          <Field label="Message" hint="Opens your email app with this draft; the email is logged on the timeline."><textarea rows={7} value={msg} onChange={(e) => setMsg(e.target.value)} /></Field>
        </>
      )}
      {err && <p className="form-err">{err}</p>}
    </Modal>
  );
}

/* ───────────────────── Budget (amount) ───────────────────── */
export function BudgetModal({ lead, onClose, onDone }) {
  const toast = useToast();
  const [amount, setAmount] = useState(amountOf(lead.budget) ? String(amountOf(lead.budget)) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true); setErr('');
    try {
      const r = await api(`/leads/${lead._id}/budget`, { method: 'POST', body: { amount: amount.trim() || null } });
      toast.success(r.lead.budget ? `Budget set to ${fmtINR(r.lead.budget)}` : 'Budget cleared');
      onDone?.(r.lead);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Budget" subtitle={`${lead.name} · ${lead.leadId}`} size="sm" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={submit}>Save</Button></>}>
      <form onSubmit={submit}>
        <Field label="Budget amount (₹)" hint="Type 25000, 25,000, 35k, 1.5L or 1cr. Leave empty to clear.">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" autoFocus placeholder="e.g. 50000" />
        </Field>
      </form>
      {err && <p className="form-err">{err}</p>}
    </Modal>
  );
}
