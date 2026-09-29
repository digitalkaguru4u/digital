import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, PointerSensor, TouchSensor, KeyboardSensor, useDraggable, useDroppable, useSensor, useSensors, closestCorners } from '@dnd-kit/core';
import { CalendarClock, Globe } from 'lucide-react';
import { api } from '../lib/api';
import { useData, useToast, useAuth } from '../lib/context';
import { fmtDate, fmtINR, isPastDay, isToday, amountOf } from '../lib/format';
import { MultiSelect, Spinner } from '../components/ui';
import { StatusModal } from '../components/modals';

function LeadCard({ lead, overlay }) {
  const due = lead.nextFollowUpAt;
  return (
    <div className={`kcard ${overlay ? 'kcard--overlay' : ''}`} style={{ '--t': 'transparent' }}>
      <div className="kcard-top"><b>{lead.name}</b>{amountOf(lead.budget) ? <span className="pill">{fmtINR(amountOf(lead.budget), { compact: true })}</span> : null}</div>
      <p className="kcard-svc">{lead.service?.label || 'No service'}</p>
      <div className="kcard-meta">
        <span><Globe size={13} /> {lead.source?.label || '—'}</span>
        <span className={due && isPastDay(due) ? 't-red' : due && isToday(due) ? 't-amber' : ''}><CalendarClock size={13} /> {due ? fmtDate(due) : 'No follow-up'}</span>
      </div>
    </div>
  );
}

function Draggable({ lead, disabled }) {
  const nav = useNavigate();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead._id, data: { lead }, disabled });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={`kdrag ${isDragging ? 'is-dragging' : ''}`}
      onClick={() => nav(`/leads/${lead._id}`)} onKeyDown={(e) => { if (e.key === 'Enter') nav(`/leads/${lead._id}`); }}>
      <LeadCard lead={lead} />
    </div>
  );
}

function Column({ status, leads }) {
  const { setNodeRef, isOver } = useDroppable({ id: status.key });
  const { can } = useAuth();
  const value = leads.reduce((a, l) => a + (status.isBooked ? l.booking?.finalBudget || amountOf(l.budget) || 0 : amountOf(l.budget) || 0), 0);
  return (
    <section className={`kcol ${isOver ? 'is-over' : ''}`} style={{ '--c': status.color }} aria-label={status.label}>
      <header className="kcol-head"><span><i />{status.label}</span><b>{leads.length}</b></header>
      <p className="kcol-sum">{fmtINR(value, { compact: true })}</p>
      <div className="kcol-body" ref={setNodeRef}>
        {leads.map((l) => <Draggable key={l._id} lead={l} disabled={!can('leads:edit')} />)}
        {!leads.length && <p className="kcol-empty">Drop leads here</p>}
      </div>
    </section>
  );
}

export default function Pipeline() {
  const { lookups, statusByKey, team } = useData();
  const toast = useToast();
  const [leads, setLeads] = useState(null);
  const [total, setTotal] = useState(0);
  const [f, setF] = useState({ service: [], source: [], assignedTo: [] });
  const [active, setActive] = useState(null);
  const [pending, setPending] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const columns = useMemo(() => (lookups ? lookups.statuses.filter((s) => s.active && s.showOnBoard) : []), [lookups]);

  const load = useCallback(() => {
    if (!columns.length) return;
    api('/leads', { query: { status: columns.map((c) => c.key), ...f, limit: 200, sort: 'updatedAt', order: 'desc' } })
      .then((r) => { setLeads(r.items); setTotal(r.total); }).catch((e) => toast.error(e.message));
  }, [columns, f, toast]);
  useEffect(() => { load(); }, [load]);

  const move = async (lead, to) => {
    const from = lead.status;
    setLeads((ls) => ls.map((l) => (l._id === lead._id ? { ...l, status: to } : l)));
    try {
      await api(`/leads/${lead._id}/status`, { method: 'POST', body: { status: to } });
      toast.success(`${lead.name} → ${statusByKey[to]?.label}`);
      if (statusByKey[to]?.isBooked) load();
    } catch (e) {
      setLeads((ls) => ls.map((l) => (l._id === lead._id ? { ...l, status: from } : l)));
      toast.error(e.message);
    }
  };

  const onDragEnd = ({ active: a, over }) => {
    setActive(null);
    if (!over) return;
    const lead = a.data.current.lead;
    const to = over.id;
    if (lead.status === to) return;
    if (statusByKey[to]?.requiresReason) { setPending({ lead, to }); return; }
    move(lead, to);
  };

  if (!lookups || !leads) return <div className="page"><Spinner /></div>;
  const byCol = Object.fromEntries(columns.map((c) => [c.key, leads.filter((l) => l.status === c.key)]));

  return (
    <div className="page page--wide">
      <div className="page-head">
        <div><h1>Pipeline</h1><p className="muted">Drag a card to move the lead to another stage. {total > 200 ? `Showing the 200 most recently updated of ${total}.` : `${total} leads on the board.`}</p></div>
        <div className="filters filters--inline">
          <MultiSelect label="Service" value={f.service} onChange={(v) => setF((x) => ({ ...x, service: v }))} options={lookups.services.map((s) => ({ value: s._id, label: s.label }))} />
          <MultiSelect label="Source" value={f.source} onChange={(v) => setF((x) => ({ ...x, source: v }))} options={lookups.sources.map((s) => ({ value: s._id, label: s.label }))} />
          <MultiSelect label="Assigned" value={f.assignedTo} onChange={(v) => setF((x) => ({ ...x, assignedTo: v }))} options={[{ value: 'unassigned', label: 'Unassigned' }, ...team.map((u) => ({ value: u._id, label: u.name }))]} />
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={({ active: a }) => setActive(a.data.current.lead)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
        <div className="kanban">
          {columns.map((c) => <Column key={c.key} status={c} leads={byCol[c.key]} />)}
        </div>
        <DragOverlay>{active ? <LeadCard lead={active} overlay /> : null}</DragOverlay>
      </DndContext>
      {pending && <StatusModal lead={pending.lead} status={pending.to} onClose={() => setPending(null)} onDone={() => { setPending(null); load(); }} />}
    </div>
  );
}
