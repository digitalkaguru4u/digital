import { useEffect, useRef, useState } from 'react';
import { X, Loader2, ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import { useData } from '../lib/context';

export function Button({ variant = 'primary', size, icon: Icon, children, loading, className = '', ...rest }) {
  return (
    <button className={`btn btn--${variant} ${size ? 'btn--' + size : ''} ${className}`} disabled={loading || rest.disabled} {...rest}>
      {loading ? <Loader2 size={16} className="spin" /> : Icon ? <Icon size={16} /> : null}
      {children}
    </button>
  );
}

export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setTimeout(() => ref.current?.querySelector('input:not([type=hidden]),select,textarea')?.focus(), 30);
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <div className={`modal modal--${size}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head">
          <div><h2>{title}</h2>{subtitle && <p className="muted">{subtitle}</p>}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children, full }) {
  return (
    <label className={`field ${full ? 'field--full' : ''} ${error ? 'has-error' : ''}`}>
      {label && <span className="field-label">{label}</span>}
      {children}
      {error ? <span className="field-err">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function StatusBadge({ status }) {
  const { statusByKey } = useData();
  const s = statusByKey?.[status];
  const color = s?.color || '#807CB0';
  return <span className="badge" style={{ '--b': color }}><i style={{ background: color }} />{s?.label || status}</span>;
}

/** Coloured stage dropdown — change a lead's stage in place. */
export function StageSelect({ value, onChange, disabled, size = 'md', includeInactive }) {
  const { lookups, statusByKey } = useData();
  const color = statusByKey?.[value]?.color || '#807CB0';
  return (
    <select className={`stage-select stage-select--${size}`} value={value} disabled={disabled} style={{ '--b': color }}
      onChange={(e) => onChange(e.target.value)} onClick={(e) => e.stopPropagation()} aria-label="Stage">
      {lookups.statuses.filter((s) => s.active || s.key === value || includeInactive).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
    </select>
  );
}

export function Pill({ children, tone = 'default' }) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function Empty({ title = 'Nothing here yet', text, action, icon: Icon = Inbox }) {
  return (
    <div className="empty">
      <div className="empty-ico"><Icon size={26} /></div>
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return <div className="spinner-wrap"><Loader2 className="spin" size={22} /> <span>{label}</span></div>;
}

export function Pagination({ page, pages, total, onPage, limit, onLimit }) {
  return (
    <div className="pager">
      <span className="muted">{total} result{total === 1 ? '' : 's'}</span>
      <div className="pager-ctrl">
        {onLimit && (
          <select value={limit} onChange={(e) => onLimit(Number(e.target.value))} aria-label="Rows per page">
            {[25, 50, 100].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        )}
        <button className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft size={18} /></button>
        <span className="pager-n">{page} / {pages}</span>
        <button className="icon-btn" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight size={18} /></button>
      </div>
    </div>
  );
}

export function Confirm({ open, title, text, confirmLabel = 'Confirm', danger, onConfirm, onClose }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={busy} onClick={async () => { setBusy(true); try { await onConfirm(); onClose(); } finally { setBusy(false); } }}>{confirmLabel}</Button>
      </>}>
      <p>{text}</p>
    </Modal>
  );
}

/** Multi-select dropdown used by filters */
export function MultiSelect({ label, options, value = [], onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  return (
    <div className={`ms ${value.length ? 'ms--active' : ''}`} ref={ref}>
      <button type="button" className="ms-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {label}{value.length ? <b>{value.length}</b> : null}
      </button>
      {open && (
        <div className="ms-pop">
          {options.map((o) => (
            <label key={o.value} className="ms-opt">
              <input type="checkbox" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
              {o.color && <i style={{ background: o.color }} />}
              <span>{o.label}</span>
            </label>
          ))}
          {value.length > 0 && <button type="button" className="ms-clear" onClick={() => onChange([])}>Clear</button>}
        </div>
      )}
    </div>
  );
}

export function Avatar({ name, size = 32 }) {
  const i = (name || '?').replace(/\[Demo\]\s*/, '').split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
  return <span className="avatar" style={{ width: size, height: size, fontSize: size * 0.38 }}>{i}</span>;
}
