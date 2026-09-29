import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, FileSpreadsheet } from 'lucide-react';
import { api, downloadUrl } from '../lib/api';
import { useAuth, useData, useToast } from '../lib/context';
import { fmtDate, fmtINR, PAYMENT_STATUS } from '../lib/format';
import { Empty, MultiSelect, Spinner, StatusBadge } from '../components/ui';

export default function Booked() {
  const { lookups } = useData();
  const { can } = useAuth();
  const toast = useToast();
  const [items, setItems] = useState(null);
  const [pay, setPay] = useState([]);
  const wonKeys = useMemo(() => (lookups ? lookups.statuses.filter((s) => s.isBooked || s.isWon).map((s) => s.key) : []), [lookups]);

  useEffect(() => {
    if (!wonKeys.length) return;
    api('/leads', { query: { status: wonKeys, paymentStatus: pay, limit: 200, sort: 'updatedAt' } }).then((r) => setItems(r.items)).catch((e) => toast.error(e.message));
  }, [wonKeys, pay, toast]);

  if (!items) return <div className="page"><Spinner /></div>;
  const total = items.reduce((a, l) => a + (l.booking?.finalBudget || 0), 0);
  const byPay = Object.keys(PAYMENT_STATUS).map((k) => ({ k, n: items.filter((l) => l.booking?.paymentStatus === k).length }));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Booked clients</h1><p className="muted">Leads that converted — final budgets and payment status.</p></div>
        <div className="head-actions">
          <MultiSelect label="Payment status" value={pay} onChange={setPay} options={Object.entries(PAYMENT_STATUS).map(([value, label]) => ({ value, label }))} />
          {can('leads:export') && <a className="btn btn--secondary" href={downloadUrl('/leads/export', { status: wonKeys, paymentStatus: pay, format: 'xlsx' })}><FileSpreadsheet size={16} /> Export</a>}
        </div>
      </div>
      <div className="kpis kpis--4">
        <div className="kpi kpi--green"><span className="kpi-label">Booked clients</span><b className="kpi-value">{items.length}</b></div>
        <div className="kpi kpi--purple"><span className="kpi-label">Total agreed value</span><b className="kpi-value">{fmtINR(total, { compact: true })}</b></div>
        {byPay.filter((p) => p.k !== 'pending').slice(0, 2).map((p) => <div key={p.k} className="kpi"><span className="kpi-label">{PAYMENT_STATUS[p.k]}</span><b className="kpi-value">{p.n}</b></div>)}
      </div>
      {!items.length ? <Empty icon={BadgeCheck} title="No booked clients yet" text="Leads moved to Booked appear here with their deal details." /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Client</th><th>Service booked</th><th>Final budget</th><th>Booked on</th><th>Project start</th><th>Payment</th><th>Team member</th><th>Stage</th></tr></thead>
            <tbody>
              {items.map((l) => (
                <tr key={l._id}>
                  <td data-label="Client"><Link to={`/leads/${l._id}`}><b>{l.name}</b></Link><small className="muted block">{l.leadId} · {l.company || l.phone}</small></td>
                  <td data-label="Service">{l.booking?.serviceBooked?.label || l.service?.label || '—'}</td>
                  <td data-label="Final budget" className="nowrap"><b>{fmtINR(l.booking?.finalBudget)}</b></td>
                  <td data-label="Booked on" className="nowrap">{fmtDate(l.booking?.bookingDate)}</td>
                  <td data-label="Start" className="nowrap">{fmtDate(l.booking?.projectStartDate)}</td>
                  <td data-label="Payment"><span className={`pay pay--${l.booking?.paymentStatus}`}>{PAYMENT_STATUS[l.booking?.paymentStatus] || '—'}</span></td>
                  <td data-label="Team">{l.booking?.assignedTo?.name || l.assignedTo?.name || '—'}</td>
                  <td data-label="Stage"><StatusBadge status={l.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
