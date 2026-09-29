import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Upload, Download, FileSpreadsheet, Filter, MoreVertical, Phone, MessageCircle, Mail, Eye, Pencil, Trash2, StickyNote, CalendarPlus, X, RotateCcw, Users, Search, CheckSquare, ArrowDownUp } from 'lucide-react';
import { api, downloadUrl } from '../lib/api';
import { useAuth, useData, useToast } from '../lib/context';
import { fmtDate, fmtDue, fmtINR, isPastDay, isToday, initials, amountOf } from '../lib/format';
import { Button, Confirm, Empty, Field, Modal, MultiSelect, Pagination, Spinner, StageSelect } from '../components/ui';
import { BudgetModal, CommModal, FollowupModal, LeadFormModal, StatusModal } from '../components/modals';
import ImportModal from '../components/ImportModal';

const FILTER_KEYS = ['q', 'status', 'service', 'source', 'campaign', 'assignedTo', 'budget', 'paymentStatus', 'from', 'to', 'followup', 'deleted'];
const SORTS = [['createdAt:desc', 'Newest first'], ['createdAt:asc', 'Oldest first'], ['nextFollowUpAt:asc', 'Next follow-up'], ['budget:desc', 'Budget: high → low'], ['budget:asc', 'Budget: low → high'], ['name:asc', 'Name A → Z'], ['updatedAt:desc', 'Recently updated']];
const list = (v) => (v ? v.split(',').filter(Boolean) : []);

function NoteModal({ lead, onClose, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const save = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try { await api(`/leads/${lead._id}/notes`, { method: 'POST', body: { text } }); toast.success('Note added'); onDone(); }
    catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title="Add note" subtitle={`${lead.name} · ${lead.leadId}`} size="sm"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save note</Button></>}>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a note…" />
    </Modal>
  );
}

function CardMenu({ lead, onAction, can }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const item = (key, Icon, label, danger) => <button className={danger ? 'danger' : ''} onClick={() => { setOpen(false); onAction(key, lead); }}><Icon size={15} /> {label}</button>;
  return (
    <div className="row-menu" ref={ref}>
      <button className="icon-btn icon-btn--ghost" onClick={() => setOpen((o) => !o)} aria-label="More actions"><MoreVertical size={18} /></button>
      {open && (
        <div className="pop pop--menu">
          {item('view', Eye, 'Open lead')}
          {can('leads:edit') && item('edit', Pencil, 'Edit details')}
          {item('email', Mail, 'Email')}
          {item('note', StickyNote, 'Add note')}
          {can('followups:manage') && item('followup', CalendarPlus, 'Add follow-up')}
          {can('leads:delete') && !lead.isDeleted && item('delete', Trash2, 'Delete', true)}
          {can('leads:delete') && lead.isDeleted && item('restore', RotateCcw, 'Restore')}
        </div>
      )}
    </div>
  );
}

function LeadCard({ lead, selecting, selected, onSelect, onAction, onStage, can }) {
  const { statusByKey } = useData();
  const color = statusByKey[lead.status]?.color || '#807CB0';
  const due = lead.nextFollowUpAt;
  const editable = can('leads:edit') && !lead.isDeleted;
  return (
    <article className={`lcard ${selected ? 'is-sel' : ''} ${lead.isDeleted ? 'is-deleted' : ''}`}>
      <div className="lcard-top">
        {selecting && <input type="checkbox" checked={selected} onChange={onSelect} aria-label={`Select ${lead.name}`} />}
        <Link to={`/leads/${lead._id}`} className="lcard-avatar" style={{ background: color }}>{initials(lead.name)}</Link>
        <Link to={`/leads/${lead._id}`} className="lcard-name">
          <b>{lead.name}</b>
          <small>#{lead.leadId.replace('DG-', '')} · {lead.company || lead.service?.label || lead.phone || '—'}</small>
        </Link>
        <div className="lcard-acts">
          {lead.phone && <button className="icon-btn icon-btn--ghost" onClick={() => onAction('call', lead)} aria-label="Call"><Phone size={17} /></button>}
          {lead.phone && <button className="icon-btn icon-btn--ghost icon-btn--wa" onClick={() => onAction('whatsapp', lead)} aria-label="WhatsApp"><MessageCircle size={17} /></button>}
          <CardMenu lead={lead} onAction={onAction} can={can} />
        </div>
      </div>
      <div className="lcard-box">
        <button className="lcard-cell" onClick={() => editable && onAction('budget', lead)} disabled={!editable} title="Edit budget">
          <small>Budget</small>
          <b className={amountOf(lead.budget) ? '' : 'muted'}>{amountOf(lead.budget) ? fmtINR(amountOf(lead.budget)) : editable ? '+ Add amount' : '—'}</b>
        </button>
        <button className="lcard-cell" onClick={() => (due ? onAction('view', lead) : can('followups:manage') && onAction('followup', lead))} title="Follow-up">
          <small>Next follow-up</small>
          <b className={due && isPastDay(due) ? 't-red' : due && isToday(due) ? 't-amber' : due ? '' : 'muted'}>{due ? fmtDue(due) : '+ Schedule'}</b>
        </button>
      </div>
      <div className="lcard-foot">
        {editable ? <StageSelect value={lead.status} onChange={(v) => onStage(lead, v)} size="sm" /> : <span className="chip">{statusByKey[lead.status]?.label}</span>}
        {lead.source && <span className="chip chip--grey">{lead.source.label}</span>}
        {lead.enquiryCount > 1 && <span className="chip chip--purple">{lead.enquiryCount}×</span>}
        <span className="lcard-meta">{lead.assignedTo?.name ? `${lead.assignedTo.name} · ` : ''}{fmtDate(lead.createdAt)}</span>
      </div>
    </article>
  );
}

export default function Leads() {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const { can } = useAuth();
  const { lookups, activeStatuses, activeLostReasons, statusByKey, team } = useData();
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({ counts: {}, total: 0 });
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState([]);
  const [selecting, setSelecting] = useState(false);
  const [showFilters, setShowFilters] = useState(() => FILTER_KEYS.some((k) => !['q', 'status'].includes(k) && sp.get(k)));
  const [q, setQ] = useState(sp.get('q') || '');
  const [modal, setModal] = useState(null);
  const [bulkLost, setBulkLost] = useState(null);

  const query = useMemo(() => {
    const o = {};
    FILTER_KEYS.forEach((k) => { if (sp.get(k)) o[k] = sp.get(k); });
    o.sort = sp.get('sort') || 'createdAt';
    o.order = sp.get('order') || 'desc';
    o.page = sp.get('page') || 1;
    o.limit = sp.get('limit') || 30;
    return o;
  }, [sp]);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api('/leads', { query }), api('/leads/stage-counts', { query: { ...query, status: '' } })])
      .then(([r, c]) => { setData(r); setCounts(c); setSel([]); })
      .catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, [query, toast]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setQ(sp.get('q') || ''); }, [sp]);
  // live search
  useEffect(() => {
    const t = setTimeout(() => { if ((sp.get('q') || '') !== q.trim()) setParam('q', q.trim()); }, 400);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  const setParam = (k, v, keepPage = false) => {
    const n = new URLSearchParams(sp);
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) n.delete(k); else n.set(k, Array.isArray(v) ? v.join(',') : v);
    if (!keepPage) n.delete('page');
    setSp(n, { replace: true });
  };
  const activeFilterCount = FILTER_KEYS.filter((k) => !['q', 'status'].includes(k) && sp.get(k)).length;
  const clearFilters = () => { const n = new URLSearchParams(); if (sp.get('status')) n.set('status', sp.get('status')); setSp(n, { replace: true }); };

  const changeStage = async (lead, status) => {
    if (status === lead.status) return;
    if (statusByKey[status]?.requiresReason) { setModal({ type: 'status', lead, status }); return; }
    try { await api(`/leads/${lead._id}/status`, { method: 'POST', body: { status } }); toast.success(`${lead.name} → ${statusByKey[status]?.label}`); load(); }
    catch (e) { toast.error(e.message); }
  };

  const onAction = (key, lead) => {
    if (key === 'view') nav(`/leads/${lead._id}`);
    else if (['call', 'whatsapp', 'email'].includes(key)) setModal({ type: 'comm', channel: key, lead });
    else if (key === 'restore') api(`/leads/${lead._id}/restore`, { method: 'POST' }).then(() => { toast.success('Lead restored'); load(); });
    else setModal({ type: key, lead });
  };

  const bulk = async (action, value, lostReason) => {
    if (action === 'status' && statusByKey[value]?.requiresReason && !lostReason) { setBulkLost(value); return; }
    try {
      const r = await api('/leads/bulk', { method: 'POST', body: { ids: sel, action, value: value || null, lostReason: lostReason || null } });
      toast.success(`${r.updated} lead${r.updated === 1 ? '' : 's'} updated${r.errors?.length ? ` · ${r.errors.length} skipped` : ''}`);
      setBulkLost(null); setSelecting(false);
      load();
    } catch (e) { toast.error(e.message); }
  };

  const exportQuery = { ...query, page: undefined, limit: undefined };
  const items = data?.items || [];
  const stageNow = sp.get('status') || '';
  const done = () => { setModal(null); load(); };

  if (!lookups) return <div className="page"><Spinner /></div>;

  return (
    <div className="page leads-page">
      <div className="page-head">
        <div><h1>{sp.get('deleted') === '1' ? 'Deleted leads' : 'Leads'}</h1></div>
        <div className="head-actions">
          {can('leads:create') && <Button variant="secondary" icon={Upload} onClick={() => setModal({ type: 'import' })}>Import</Button>}
          {can('leads:export') && <a className="btn btn--secondary" href={downloadUrl('/leads/export', { ...exportQuery, format: 'xlsx' })}><FileSpreadsheet size={16} /> <span className="hide-sm">Excel</span></a>}
          {can('leads:export') && <a className="btn btn--secondary hide-sm" href={downloadUrl('/leads/export', { ...exportQuery, format: 'csv' })}><Download size={16} /> CSV</a>}
        </div>
      </div>

      <label className="big-search">
        <Search size={20} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone, email, lead ID…" aria-label="Search leads" />
        {q && <button className="icon-btn icon-btn--ghost" onClick={() => setQ('')} aria-label="Clear"><X size={16} /></button>}
      </label>

      <div className="stage-chips" role="tablist" aria-label="Stages">
        <button role="tab" aria-selected={!stageNow} className={!stageNow ? 'is-on' : ''} onClick={() => setParam('status', '')}>All <em>{counts.total}</em></button>
        {lookups.statuses.filter((s) => s.active).map((s) => (
          <button key={s.key} role="tab" aria-selected={stageNow === s.key} className={stageNow === s.key ? 'is-on' : ''} style={{ '--c': s.color }} onClick={() => setParam('status', stageNow === s.key ? '' : s.key)}>
            {s.label} <em>{counts.counts[s.key] || 0}</em>
          </button>
        ))}
      </div>

      <div className="list-bar">
        <span className="count-pill">{data ? data.total : '…'}</span><b>Leads</b>
        <div className="list-bar-acts">
          <button className={`text-btn ${showFilters || activeFilterCount ? 'is-on' : ''}`} onClick={() => setShowFilters((s) => !s)}><Filter size={16} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ''}</button>
          <label className="text-btn sort-btn"><ArrowDownUp size={16} />
            <select value={`${query.sort}:${query.order}`} onChange={(e) => { const [s, o] = e.target.value.split(':'); const n = new URLSearchParams(sp); n.set('sort', s); n.set('order', o); setSp(n, { replace: true }); }} aria-label="Sort">
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <button className={`text-btn ${sp.get('budget') === 'none' ? 'is-on' : ''}`} onClick={() => setParam('budget', sp.get('budget') === 'none' ? '' : 'none')}>No budget</button>
          {(can('leads:edit') || can('leads:assign')) && <button className={`text-btn ${selecting ? 'is-on' : ''}`} onClick={() => { setSelecting((s) => !s); setSel([]); }}><CheckSquare size={16} /> Select</button>}
        </div>
      </div>

      {showFilters && (
        <div className="filters">
          <MultiSelect label="Service" value={list(sp.get('service'))} onChange={(v) => setParam('service', v)} options={lookups.services.map((s) => ({ value: s._id, label: s.label }))} />
          <MultiSelect label="Source" value={list(sp.get('source'))} onChange={(v) => setParam('source', v)} options={lookups.sources.map((s) => ({ value: s._id, label: s.label }))} />
          <MultiSelect label="Campaign" value={list(sp.get('campaign'))} onChange={(v) => setParam('campaign', v)} options={lookups.campaigns.map((c) => ({ value: c._id, label: c.name }))} />
          <MultiSelect label="Assigned to" value={list(sp.get('assignedTo'))} onChange={(v) => setParam('assignedTo', v)} options={[{ value: 'unassigned', label: 'Unassigned' }, ...team.map((u) => ({ value: u._id, label: u.name }))]} />
          <select className="select-sm" value={sp.get('budget') || ''} onChange={(e) => setParam('budget', e.target.value)} aria-label="Budget"><option value="">Budget: any</option><option value="has">Has budget</option><option value="none">No budget</option></select>
          <select className="select-sm" value={sp.get('followup') || ''} onChange={(e) => setParam('followup', e.target.value)} aria-label="Follow-up"><option value="">Follow-up: any</option><option value="today">Due today</option><option value="overdue">Overdue</option><option value="upcoming">Upcoming</option><option value="none">No follow-up</option></select>
          <MultiSelect label="Payment" value={list(sp.get('paymentStatus'))} onChange={(v) => setParam('paymentStatus', v)} options={[['pending', 'Pending'], ['advance_received', 'Advance received'], ['partially_paid', 'Partially paid'], ['fully_paid', 'Fully paid']].map(([value, label]) => ({ value, label }))} />
          <label className="date-mini">Created <input type="date" value={sp.get('from') || ''} onChange={(e) => setParam('from', e.target.value)} /></label>
          <label className="date-mini">to <input type="date" value={sp.get('to') || ''} onChange={(e) => setParam('to', e.target.value)} /></label>
          {can('leads:delete') && <label className="check"><input type="checkbox" checked={sp.get('deleted') === '1'} onChange={(e) => setParam('deleted', e.target.checked ? '1' : '')} /> Deleted</label>}
          {activeFilterCount > 0 && <button className="link" onClick={clearFilters}>Clear filters</button>}
        </div>
      )}

      {selecting && (
        <div className="bulkbar">
          <label className="check" style={{ margin: 0 }}><input type="checkbox" checked={items.length > 0 && sel.length === items.length} onChange={() => setSel(sel.length === items.length ? [] : items.map((l) => l._id))} /> <b>{sel.length} selected</b></label>
          {sel.length > 0 && can('leads:edit') && (
            <select value="" onChange={(e) => e.target.value && bulk('status', e.target.value)} aria-label="Change stage">
              <option value="">Change stage…</option>{activeStatuses.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          )}
          {sel.length > 0 && can('leads:assign') && (
            <select value="" onChange={(e) => e.target.value && bulk('assign', e.target.value === 'none' ? '' : e.target.value)} aria-label="Assign">
              <option value="">Assign to…</option>{team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}<option value="none">Unassign</option>
            </select>
          )}
          {sel.length > 0 && can('leads:export') && <a className="btn btn--secondary btn--sm" href={downloadUrl('/leads/export', { ids: sel, format: 'xlsx', deleted: sp.get('deleted') })}><FileSpreadsheet size={14} /> Export</a>}
          {sel.length > 0 && can('leads:delete') && sp.get('deleted') !== '1' && <Button size="sm" variant="danger" icon={Trash2} onClick={() => setModal({ type: 'bulkDelete' })}>Delete</Button>}
          <button className="link" onClick={() => { setSelecting(false); setSel([]); }}>Done</button>
        </div>
      )}

      {loading && !data ? <Spinner /> : items.length === 0 ? (
        <Empty icon={Users} title="No leads found" text={activeFilterCount || sp.get('q') || stageNow ? 'Try another stage, filter or search.' : 'Leads from your website, Meta ads and imports appear here.'}
          action={activeFilterCount ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button> : null} />
      ) : (
        <div className={`lcards ${loading ? 'is-loading' : ''}`}>
          {items.map((l) => (
            <LeadCard key={l._id} lead={l} can={can} selecting={selecting} selected={sel.includes(l._id)}
              onSelect={() => setSel((s) => (s.includes(l._id) ? s.filter((x) => x !== l._id) : [...s, l._id]))}
              onAction={onAction} onStage={changeStage} />
          ))}
        </div>
      )}
      {data && data.total > Number(query.limit) && (
        <Pagination page={data.page} pages={data.pages} total={data.total} limit={Number(query.limit)} onPage={(p) => { setParam('page', String(p), true); window.scrollTo(0, 0); }} />
      )}

      {modal?.type === 'import' && <ImportModal onClose={() => setModal(null)} onDone={() => { setModal(null); setSp(new URLSearchParams(), { replace: true }); load(); }} />}
      {modal?.type === 'status' && <StatusModal lead={modal.lead} status={modal.status} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'edit' && <LeadFormModal open lead={modal.lead} onClose={() => setModal(null)} onSaved={done} />}
      {modal?.type === 'budget' && <BudgetModal lead={modal.lead} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'note' && <NoteModal lead={modal.lead} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'followup' && <FollowupModal lead={modal.lead} onClose={() => setModal(null)} onDone={done} />}
      {modal?.type === 'comm' && <CommModal lead={modal.lead} channel={modal.channel} onClose={() => setModal(null)} onDone={done} />}
      <Confirm open={modal?.type === 'delete'} title="Delete lead?" danger confirmLabel="Delete"
        text={`${modal?.lead?.name} will be moved to trash. Its history is kept and it can be restored.`}
        onClose={() => setModal(null)} onConfirm={async () => { await api(`/leads/${modal.lead._id}`, { method: 'DELETE' }); toast.success('Lead deleted'); load(); }} />
      <Confirm open={modal?.type === 'bulkDelete'} title={`Delete ${sel.length} leads?`} danger confirmLabel="Delete"
        text="Selected leads will be moved to trash. Their history is kept and they can be restored."
        onClose={() => setModal(null)} onConfirm={() => bulk('delete')} />
      {bulkLost && (
        <Modal open title={`Mark ${sel.length} leads as ${statusByKey[bulkLost]?.label}`} size="sm" onClose={() => setBulkLost(null)}>
          <Field label="Reason *">
            <select defaultValue="" onChange={(e) => e.target.value && bulk('status', bulkLost, e.target.value)}>
              <option value="">Select a reason…</option>{activeLostReasons.map((r) => <option key={r._id} value={r._id}>{r.label}</option>)}
            </select>
          </Field>
        </Modal>
      )}
    </div>
  );
}
