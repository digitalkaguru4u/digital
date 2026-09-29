import { useMemo, useState } from 'react';
import { Upload, FileSpreadsheet, Download, CheckCircle2, AlertTriangle } from 'lucide-react';
import { api, downloadUrl } from '../lib/api';
import { useAuth, useData } from '../lib/context';
import { Button, Field, Modal } from './ui';

const FIELD_LABELS = {
  '': '— Ignore this column —', name: 'Name', firstName: 'First name', lastName: 'Last name', phone: 'Phone / WhatsApp', email: 'Email',
  company: 'Company', service: 'Service', source: 'Source', campaign: 'Campaign', budget: 'Budget (₹ amount)', status: 'Stage (Open / Hot / Warm / Cold…)',
  message: 'Message / requirement', notes: 'Notes (saved as a note)', assignedTo: 'Assigned to (name or email)',
  createdAt: 'Enquiry date', city: 'City',
};

const toBase64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result).split(',')[1]);
  r.onerror = () => reject(new Error('Could not read the file'));
  r.readAsDataURL(file);
});

export default function ImportModal({ onClose, onDone }) {
  const { activeSources, activeStatuses, team } = useData();
  const { can } = useAuth();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [mapping, setMapping] = useState({});
  const [opt, setOpt] = useState({ duplicate: 'skip', defaultSource: '', defaultStatus: 'NEW', assignTo: '' });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [over, setOver] = useState(false);

  const pick = async (f) => {
    if (!f) return;
    setErr('');
    if (!/\.(csv|xlsx|txt)$/i.test(f.name)) { setErr('Please choose a .csv or .xlsx file (Excel: File → Save As → .xlsx or CSV).'); return; }
    if (f.size > 10 * 1024 * 1024) { setErr('File is larger than 10 MB — split it into smaller files.'); return; }
    setBusy(true);
    try {
      const r = await api('/leads/import/preview', { method: 'POST', body: { fileName: f.name, data: await toBase64(f) } });
      setFile(f); setPreview(r);
      setMapping(Object.fromEntries(r.headers.map((_, i) => [i, r.mapping[i] || ''])));
      setStep(2);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const mapped = Object.values(mapping);
  const dupField = (f) => f && mapped.filter((x) => x === f).length > 1;
  const canImport = (mapped.includes('phone') || mapped.includes('email')) && (mapped.includes('name') || mapped.includes('firstName') || mapped.includes('phone'));
  const sample = useMemo(() => (preview ? preview.headers.map((_, i) => preview.rows.slice(0, 3).map((r) => r[i]).filter(Boolean).join(' · ')) : []), [preview]);

  const run = async () => {
    if (Object.values(mapping).some(dupField)) { setErr('Each CRM field can be used for one column only.'); return; }
    setBusy(true); setErr('');
    try {
      const clean = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
      const r = await api('/leads/import', { method: 'POST', body: { rows: preview.rows, mapping: clean, options: { ...opt, fileName: file.name } } });
      setResult(r); setStep(3);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  const downloadErrors = () => {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv = ['Row,Name,Problem', ...result.errors.map((e) => [e.row, esc(e.name), esc(e.reason)].join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = `import-problems-${file.name.replace(/\.\w+$/, '')}.csv`;
    a.click();
  };

  const footer = step === 1 ? <Button variant="ghost" onClick={onClose}>Cancel</Button>
    : step === 2 ? <><Button variant="ghost" onClick={() => { setStep(1); setPreview(null); }}>Back</Button><Button icon={Upload} loading={busy} disabled={!canImport} onClick={run}>Import {preview.rows.length} rows</Button></>
      : <><Button variant="secondary" onClick={() => { setStep(1); setResult(null); setPreview(null); setFile(null); }}>Import another file</Button><Button onClick={() => onDone(result)}>View leads</Button></>;

  return (
    <Modal open onClose={step === 3 ? () => onDone(result) : onClose} title="Import leads" subtitle={step === 2 ? `${file.name} · ${preview.rows.length} rows` : 'Upload a CSV or Excel file'} size="lg" footer={footer}>
      <div className="step-dots"><span className="on" /><span className={step >= 2 ? 'on' : ''} /><span className={step >= 3 ? 'on' : ''} /></div>

      {step === 1 && (
        <>
          <label className={`drop ${over ? 'is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files[0]); }}>
            <input type="file" accept=".csv,.xlsx,.txt" onChange={(e) => pick(e.target.files[0])} />
            <div className="drop-ico"><FileSpreadsheet size={24} /></div>
            <b>{busy ? 'Reading file…' : 'Drop your file here or click to choose'}</b>
            <p className="muted small">.csv or .xlsx · up to 5,000 leads · first row must be column headings</p>
          </label>
          <p className="muted small" style={{ marginTop: 12 }}>
            Works with exports from Excel, Google Sheets, JustDial, IndiaMART, Meta Leads Center, other CRMs… Columns are matched automatically and you can adjust them in the next step.
          </p>
          <div className="head-actions" style={{ marginTop: 10 }}>
            <a className="btn btn--secondary btn--sm" href={downloadUrl('/leads/import/template', { format: 'xlsx' })}><Download size={14} /> Excel template</a>
            <a className="btn btn--secondary btn--sm" href={downloadUrl('/leads/import/template')}><Download size={14} /> CSV template</a>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="table-wrap table-wrap--flat" style={{ maxHeight: 340 }}>
            <table className="table map-table">
              <thead><tr><th>Column in your file</th><th>Sample</th><th>Import as</th></tr></thead>
              <tbody>
                {preview.headers.map((h, i) => (
                  <tr key={i}>
                    <td data-label="Column"><b>{h}</b></td>
                    <td data-label="Sample" className="map-sample" title={sample[i]}>{sample[i] || '—'}</td>
                    <td data-label="Import as">
                      <select value={mapping[i] || ''} onChange={(e) => setMapping((m) => ({ ...m, [i]: e.target.value }))} style={dupField(mapping[i]) ? { borderColor: 'var(--red)' } : undefined} aria-label={`Map ${h}`}>
                        {Object.entries(FIELD_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!canImport && <p className="form-err"><AlertTriangle size={14} /> Map at least a Name and a Phone or Email column.</p>}
          <div className="grid-2" style={{ marginTop: 14 }}>
            <Field label="If a lead already exists (same phone or email)">
              <select value={opt.duplicate} onChange={(e) => setOpt((o) => ({ ...o, duplicate: e.target.value }))}>
                <option value="skip">Skip it (recommended)</option>
                <option value="update">Update the existing lead with file values</option>
                <option value="create">Create a separate lead anyway</option>
              </select>
            </Field>
            <Field label="Source when the file has none">
              <select value={opt.defaultSource} onChange={(e) => setOpt((o) => ({ ...o, defaultSource: e.target.value }))}>
                <option value="">Other</option>{activeSources.map((s) => <option key={s._id} value={s._id}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Status when the file has none">
              <select value={opt.defaultStatus} onChange={(e) => setOpt((o) => ({ ...o, defaultStatus: e.target.value }))}>
                {activeStatuses.filter((s) => !s.requiresReason).map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </Field>
            {can('leads:assign') && (
              <Field label="Assign to (when not in the file)">
                <select value={opt.assignTo} onChange={(e) => setOpt((o) => ({ ...o, assignTo: e.target.value }))}>
                  <option value="">Leave unassigned</option>{team.map((u) => <option key={u._id} value={u._id}>{u.name}</option>)}
                </select>
              </Field>
            )}
          </div>
        </>
      )}

      {step === 3 && result && (
        <>
          <p className="ok-note" style={{ marginBottom: 12 }}><CheckCircle2 size={18} /> Import finished for {file.name}</p>
          <div className="import-result">
            <div><b className="t-green">{result.created}</b><span>New leads</span></div>
            <div><b className="t-purple">{result.updated}</b><span>Updated</span></div>
            <div><b>{result.skipped}</b><span>Skipped</span></div>
            <div><b className={result.failed ? 't-red' : ''}>{result.failed}</b><span>Failed</span></div>
          </div>
          {result.errors.length > 0 && (
            <>
              <div className="pay-head"><b>Rows that need attention</b><button className="link small" onClick={downloadErrors}><Download size={13} /> Download list</button></div>
              <div className="err-list">{result.errors.slice(0, 200).map((e, i) => <div key={i}><b>Row {e.row}</b>{e.name ? ` · ${e.name}` : ''} — {e.reason}</div>)}</div>
            </>
          )}
        </>
      )}
      {err && <p className="form-err">{err}</p>}
    </Modal>
  );
}
