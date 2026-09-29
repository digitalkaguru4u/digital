import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Wallet, AlertCircle, Check, Phone, MessageCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth, useData, useToast } from '../lib/context';
import { fmtDue, fmtINR, initials, isPastDay, amountOf } from '../lib/format';
import { Empty, Spinner, StageSelect } from '../components/ui';
import { CommModal, StatusModal } from '../components/modals';

/** Inline ₹ amount editor: type and press Enter (or tap ✓). */
function AmountInput({ lead, onSaved, autoFocus }) {
  const toast = useToast();
  const current = amountOf(lead.budget);
  const [v, setV] = useState(current ? String(current) : '');
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e?.preventDefault();
    if (busy || (v.trim() || null) === (current ? String(current) : null)) return;
    setBusy(true);
    try {
      const r = await api(`/leads/${lead._id}/budget`, { method: 'POST', body: { amount: v.trim() || null } });
      toast.success(`${lead.name}: ${r.lead.budget ? fmtINR(r.lead.budget) : 'budget cleared'}`);
      onSaved?.(r.lead);
    } catch (e2) { toast.error(e2.message); } finally { setBusy(false); }
  };
  return (
    <form className="amount-input" onSubmit={save}>
      <span>₹</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => current && save()} inputMode="numeric" placeholder="Amount e.g. 25000, 35k, 1.5L" autoFocus={autoFocus} aria-label={`Budget for ${lead.name}`} />
      <button type="submit" className="icon-btn icon-btn--sm" disabled={busy || !v.trim()} aria-label="Save budget"><Check size={15} /></button>
    </form>
  );
}

export default function PipelineValue() {
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') === 'missing' ? 'missing' : 'value';
  const stage = sp.get('stage') || '';
  const { can } = useAuth();
  const { statusByKey } = useData();
  const toast = useToast();
  const [d, setD] = useState(null);
  const [modal, setModal] = useState(null);

  const load = useCallback(() => api('/dashboard/pipeline-value').then(setD).catch((e) => toast.error(e.message)), [toast]);
  useEffect(() => { load(); }, [load]);

  const changeStage = async (lead, status) => {
    if (statusByKey[status]?.requiresReason) { setModal({ type: 'status', lead, status }); return; }
    try { await api(`/leads/${lead._id}/status`, { method: 'POST', body: { status } }); toast.success(`${lead.name} → ${statusByKey[status]?.label}`); load(); }
    catch (e) { toast.error(e.message); }
  };
  const go = (t, s = '') => { const n = new URLSearchParams(); if (t === 'missing') n.set('tab', 'missing'); if (s) n.set('stage', s); setSp(n, { replace: true }); };

  if (!d) return <div className="page"><Spinner /></div>;
  const rows = (tab === 'value' ? d.leads : d.needBudget).filter((l) => !stage || l.status === stage);
  const shownTotal = rows.reduce((a, l) => a + (amountOf(l.budget) || 0), 0);
  const editable = can('leads:edit');

  return (
    <div className="page">
      <div className="page-head"><div><h1>Pipeline value</h1><p className="muted">Open leads (not Booked or Lost) and the budget each one is worth.</p></div></div>

      <div className="pv-tabs">
        <button className={`pv-tab ${tab === 'value' ? 'is-on' : ''}`} onClick={() => go('value')}>
          <Wallet size={20} /><span><small>Open pipeline value</small><b>{fmtINR(d.total)}</b><small>{d.leads.length} lead{d.leads.length === 1 ? '' : 's'} with a budget</small></span>
        </button>
        <button className={`pv-tab pv-tab--warn ${tab === 'missing' ? 'is-on' : ''}`} onClick={() => go('missing')}>
          <AlertCircle size={20} /><span><small>Hot / Warm / Cold without budget</small><b>{d.needBudget.length}</b><small>Add amounts so the value is complete</small></span>
        </button>
      </div>

      <div className="stage-chips">
        <button className={!stage ? 'is-on' : ''} onClick={() => go(tab)}>All <em>{tab === 'value' ? fmtINR(d.total, { compact: true }) : d.needBudget.length}</em></button>
        {(tab === 'value' ? d.byStage : d.needBudgetStages).map((s) => (
          <button key={s.key} className={stage === s.key ? 'is-on' : ''} style={{ '--c': s.color }} onClick={() => go(tab, stage === s.key ? '' : s.key)}>
            {s.label} <em>{tab === 'value' ? `${fmtINR(s.value, { compact: true })} · ${s.count}` : s.count}</em>
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        tab === 'value'
          ? <Empty icon={Wallet} title="No budgets yet" text="Add a budget amount to open leads to see your pipeline value here." />
          : <Empty icon={Check} title="All Hot, Warm and Cold leads have a budget 🎉" />
      ) : (
        <>
          {tab === 'value' && stage && <p className="muted small" style={{ margin: '0 0 10px' }}>{rows.length} leads · {fmtINR(shownTotal)}</p>}
          <ul className="pv-list">
            {rows.map((l, i) => (
              <li key={l._id} className="pv-row">
                <Link to={`/leads/${l._id}`} className="lcard-avatar" style={{ background: statusByKey[l.status]?.color }}>{initials(l.name)}</Link>
                <div className="pv-main">
                  <Link to={`/leads/${l._id}`}><b>{l.name}</b></Link>
                  <small>#{l.leadId.replace('DG-', '')} · {l.service?.label || l.company || '—'}{l.assignedTo ? ` · ${l.assignedTo.name}` : ''}</small>
                  <small className={l.nextFollowUpAt && isPastDay(l.nextFollowUpAt) ? 't-red' : 'muted'}>{l.nextFollowUpAt ? `Follow-up ${fmtDue(l.nextFollowUpAt)}` : 'No follow-up'}</small>
                </div>
                <div className="pv-stage">{editable ? <StageSelect value={l.status} onChange={(v) => changeStage(l, v)} size="sm" /> : statusByKey[l.status]?.label}</div>
                <div className="pv-amount">
                  {editable ? <AmountInput key={`${l._id}-${l.budget}`} lead={l} onSaved={load} autoFocus={tab === 'missing' && i === 0} /> : <b>{fmtINR(l.budget)}</b>}
                </div>
                <div className="pv-acts">
                  {l.phone && <button className="icon-btn icon-btn--ghost" onClick={() => setModal({ type: 'comm', channel: 'call', lead: l })} aria-label="Call"><Phone size={16} /></button>}
                  {l.phone && <button className="icon-btn icon-btn--ghost icon-btn--wa" onClick={() => setModal({ type: 'comm', channel: 'whatsapp', lead: l })} aria-label="WhatsApp"><MessageCircle size={16} /></button>}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {modal?.type === 'status' && <StatusModal lead={modal.lead} status={modal.status} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
      {modal?.type === 'comm' && <CommModal lead={modal.lead} channel={modal.channel} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); }} />}
    </div>
  );
}
