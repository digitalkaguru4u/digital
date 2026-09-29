/**
 * Lead import from CSV / Excel.
 *  parseFile()  → { headers, rows } (all values as trimmed strings)
 *  suggestMapping(headers) → { columnIndex: fieldKey }
 *  importRows() → creates / updates / skips leads with the same dedup rules as the website
 */
const ExcelJS = require('exceljs');
const { DateTime } = require('luxon');
const M = require('../models');
const { TZ } = require('../utils/dates');
const { cleanText, normalizePhone } = require('../utils/text');
const { logActivity } = require('./activity');
const { getLookups } = require('./lookups');
const S = require('./leadService');

const MAX_ROWS = 5000;

/* ───────── parsing ───────── */
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] || '';
  const delim = [',', ';', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"' && field === '') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return DateTime.fromJSDate(v, { zone: 'utc' }).toFormat('yyyy-LL-dd HH:mm');
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return cellText(v.result);
    if (v.hyperlink) return String(v.hyperlink).replace(/^mailto:/, '');
    return '';
  }
  if (typeof v === 'number' && Number.isInteger(v) && String(v).length >= 10) return String(v); // phone numbers
  return String(v);
}

async function parseFile(fileName, buffer) {
  let rows;
  if (/\.xlsx$/i.test(fileName)) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets.find((w) => w.actualRowCount > 0);
    if (!ws) throw new Error('The workbook has no data');
    rows = [];
    ws.eachRow({ includeEmpty: false }, (r) => {
      const vals = [];
      for (let c = 1; c <= ws.columnCount; c++) vals.push(cellText(r.getCell(c).value));
      rows.push(vals);
    });
  } else if (/\.(csv|txt)$/i.test(fileName)) {
    rows = parseCsv(buffer.toString('utf8'));
  } else {
    throw new Error('Upload a .csv or .xlsx file (for .xls, open it and “Save as” .xlsx)');
  }
  rows = rows.map((r) => r.map((v) => String(v ?? '').trim())).filter((r) => r.some((v) => v));
  if (rows.length < 2) throw new Error('The file needs a header row and at least one lead');
  const headers = rows[0].map((h, i) => h || `Column ${i + 1}`);
  const data = rows.slice(1);
  if (data.length > MAX_ROWS) throw new Error(`Maximum ${MAX_ROWS} rows per import — split the file`);
  return { headers, rows: data.map((r) => headers.map((_, i) => r[i] || '')) };
}

/* ───────── mapping ───────── */
const FIELDS = {
  name: ['name', 'full name', 'lead name', 'customer name', 'client name', 'contact name', 'full_name'],
  firstName: ['first name', 'first_name', 'firstname', 'given name'],
  lastName: ['last name', 'last_name', 'lastname', 'surname'],
  phone: ['phone', 'phone number', 'mobile', 'mobile number', 'contact', 'contact number', 'whatsapp', 'whatsapp number', 'phone_number', 'cell'],
  email: ['email', 'email address', 'e-mail', 'mail', 'email_address'],
  company: ['company', 'company name', 'business', 'business name', 'organization', 'organisation', 'firm'],
  service: ['service', 'services', 'service required', 'interested in', 'requirement', 'product'],
  source: ['source', 'lead source', 'channel', 'platform'],
  campaign: ['campaign', 'campaign name', 'utm campaign', 'utm_campaign', 'ad campaign'],
  budget: ['budget', 'budget range', 'amount', 'deal value', 'value'],
  status: ['status', 'stage', 'lead status', 'pipeline stage', 'lead stage', 'temperature', 'temp', 'rating', 'lead temperature'],
  message: ['message', 'description', 'comments', 'comment', 'details', 'query', 'enquiry', 'inquiry'],
  notes: ['notes', 'note', 'remarks', 'remark', 'follow up notes'],
  assignedTo: ['assigned to', 'owner', 'assignee', 'sales person', 'salesperson', 'executive', 'lead owner'],
  createdAt: ['created', 'created at', 'date', 'lead date', 'enquiry date', 'created date', 'created_time', 'timestamp'],
  city: ['city', 'location', 'area'],
};
const n = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function suggestMapping(headers) {
  const mapping = {};
  const used = new Set();
  headers.forEach((h, i) => {
    const hn = n(h);
    const exact = Object.entries(FIELDS).find(([k, al]) => !used.has(k) && al.map(n).includes(hn));
    const fuzzy = exact || Object.entries(FIELDS).find(([k, al]) => !used.has(k) && al.some((a) => hn.includes(n(a)) && n(a).length > 3));
    if (fuzzy) { mapping[i] = fuzzy[0]; used.add(fuzzy[0]); }
  });
  return mapping;
}

/* ───────── value resolvers ───────── */
/** Amount or a range like "₹10,000 – ₹15,000" (→ midpoint). */
function parseBudget(v) {
  const direct = S.parseAmount(v);
  if (direct) return direct;
  const parts = String(v).split(/\s*(?:-|–|—|to)\s*/i).map((x) => S.parseAmount(x.replace(/\+$/, ''))).filter(Boolean);
  if (parts.length === 2) return Math.round((parts[0] + parts[1]) / 2);
  const plus = String(v).match(/^(.*?)\+$/);
  return plus ? S.parseAmount(plus[1]) : null;
}
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  const fmts = ['yyyy-LL-dd HH:mm', 'yyyy-LL-dd', 'dd/LL/yyyy', 'dd/LL/yyyy HH:mm', 'd/L/yyyy', 'dd-LL-yyyy', 'd-L-yyyy', 'dd.LL.yyyy', 'dd LLL yyyy', 'd LLL yyyy', 'dd/LL/yy'];
  let d = DateTime.fromISO(s, { zone: TZ });
  for (const f of fmts) { if (d.isValid) break; d = DateTime.fromFormat(s, f, { zone: TZ }); }
  if (!d.isValid && /^\d{5}(\.\d+)?$/.test(s)) d = DateTime.fromMillis(Math.round((parseFloat(s) - 25569) * 86400000), { zone: 'utc' }); // Excel serial
  if (!d.isValid) return null;
  const js = d.toJSDate();
  return js > new Date(Date.now() + 86400000) ? null : js;
}
const findBy = (list, v, keys) => {
  const t = n(v);
  if (!t) return null;
  return list.find((x) => keys.some((k) => n(x[k]) === t)) || list.find((x) => keys.some((k) => x[k] && (n(x[k]).includes(t) || t.includes(n(x[k])))));
};

/**
 * rows: string[][]; mapping: { [colIndex]: fieldKey }
 * options: { duplicate: 'skip'|'update'|'create', defaultSource, defaultStatus, assignTo, fileName }
 * A “Temperature” column (Hot/Warm/Cold) is read as the stage.
 */
async function importRows({ rows, mapping, options, user }) {
  const L = await getLookups(true);
  const users = await M.User.find({ active: true }).lean();
  const statusFlags = Object.fromEntries(L.statuses.map((s) => [s.key, s]));
  const otherReason = L.lostReasons.find((r) => /other/i.test(r.label)) || L.lostReasons[0];
  const defaultSource = L.sources.find((s) => String(s._id) === String(options.defaultSource)) || L.sources.find((s) => s.key === 'import') || L.sources.find((s) => s.key === 'other');
  const col = Object.fromEntries(Object.entries(mapping).filter(([, f]) => f).map(([i, f]) => [f, Number(i)]));
  const get = (r, f) => (col[f] !== undefined ? cleanText(r[col[f]] || '') : '');
  const result = { total: rows.length, created: 0, updated: 0, skipped: 0, failed: 0, errors: [], createdIds: [] };
  const seen = new Map(); // phone/email seen earlier in this file → lead id
  const fileLabel = options.fileName ? ` (${options.fileName})` : '';

  for (let idx = 0; idx < rows.length; idx++) {
    const r = rows[idx];
    const rowNo = idx + 2; // spreadsheet row number (header = 1)
    try {
      const name = get(r, 'name') || [get(r, 'firstName'), get(r, 'lastName')].filter(Boolean).join(' ');
      let phone = get(r, 'phone').replace(/[^\d+\s-]/g, '').trim();
      const email = get(r, 'email').toLowerCase();
      if (!name && !phone && !email) { result.skipped += 1; continue; } // blank line
      if (!phone && !email) throw new Error('No phone or email');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error(`Invalid email “${email}”`);
      if (phone && normalizePhone(phone).length < 8) throw new Error(`Invalid phone “${phone}”`);
      if (phone && /^\d{10}$/.test(phone)) phone = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;

      const service = findBy(L.services, get(r, 'service'), ['label', 'slug']);
      const source = findBy(L.sources, get(r, 'source'), ['label', 'key']) || defaultSource;
      const statusVal = get(r, 'status');
      const status = (findBy(L.statuses, statusVal, ['key', 'label']) || statusFlags[options.defaultStatus] || statusFlags.NEW).key;
      const owner = get(r, 'assignedTo') ? findBy(users, get(r, 'assignedTo'), ['name', 'email']) : null;
      const assignedTo = owner?._id || options.assignTo || null;

      const bRaw = get(r, 'budget');
      const budget = bRaw ? parseBudget(bRaw) : null;
      if (bRaw && !budget) throw new Error(`Budget “${bRaw}” is not an amount`);
      const message = [get(r, 'message'), get(r, 'city') && `City: ${get(r, 'city')}`].filter(Boolean).join('\n');
      const notes = get(r, 'notes');
      const createdAt = parseDate(get(r, 'createdAt'));
      const campaignName = get(r, 'campaign');
      const campaign = campaignName ? await S.upsertCampaign({ campaign: campaignName, source: source?.key || '', medium: 'import' }) : null;

      // duplicates: earlier row in this file, then the database
      const keyP = normalizePhone(phone);
      const inFile = (keyP && seen.get(`p:${keyP}`)) || (email && seen.get(`e:${email}`));
      const dbDup = inFile ? null : (await S.findDuplicates({ phone, email }))[0];
      const existingId = inFile || dbDup?._id;

      if (existingId && options.duplicate !== 'create') {
        if (options.duplicate === 'skip' && !inFile) { result.skipped += 1; result.errors.push({ row: rowNo, name, reason: `Skipped — already exists as ${dbDup.leadId}` }); continue; }
        if (options.duplicate === 'skip' && inFile) { result.skipped += 1; result.errors.push({ row: rowNo, name, reason: 'Skipped — duplicate of an earlier row in this file' }); continue; }
        // update: fill/overwrite with the non-empty values from the file
        const lead = await M.Lead.findById(existingId);
        const changed = [];
        const setIf = (k, v) => { if (v && String(lead[k] || '') !== String(v)) { lead[k] = v; changed.push(k); } };
        setIf('name', name); setIf('company', get(r, 'company'));
        if (email && !lead.email) setIf('email', email);
        if (phone && !lead.phone) { setIf('phone', phone); lead.phoneNormalized = keyP; }
        if (service) setIf('service', service._id);
        if (campaign) setIf('campaign', campaign._id);
        if (budget) setIf('budget', budget);
        if (statusVal && status !== lead.status && !statusFlags[status]?.requiresReason) setIf('status', status);
        if (message) lead.message = [lead.message, message].filter(Boolean).join('\n---\n');
        await lead.save();
        await M.Enquiry.create({ lead: lead._id, name, phone, email, service: service?._id, source: source?._id, message, formUsed: 'import', merged: true, budgetLabel: budget ? S.fmtINR(budget) : '' });
        await logActivity(lead._id, 'lead_updated', `Updated from import${fileLabel}`, { description: changed.length ? `Changed: ${changed.join(', ')}` : 'No field changes; enquiry added', user });
        if (notes) { await M.LeadNote.create({ lead: lead._id, text: notes, createdBy: user._id }); await logActivity(lead._id, 'note_added', 'Note added (import)', { description: notes.slice(0, 500), user }); }
        if (keyP) seen.set(`p:${keyP}`, lead._id);
        if (email) seen.set(`e:${email}`, lead._id);
        result.updated += 1;
        continue;
      }

      const def = statusFlags[status];
      const lead = await M.Lead.create({
        leadId: await S.nextLeadId(), name: name || phone || email, phone, phoneNormalized: keyP, email, company: get(r, 'company'),
        service: service?._id || null, source: source?._id || null, campaign: campaign?._id || null,
        utm: campaignName ? { campaign: campaignName } : {}, formUsed: 'import', message, status,
        budget: budget || null, assignedTo, createdBy: user._id,
        ...(def?.requiresReason ? { lostReason: otherReason?._id || null, lostReasonText: 'Imported', lostAt: new Date() } : {}),
        ...(def?.isBooked ? { booking: { serviceBooked: service?._id || null, finalBudget: budget || null, bookingDate: createdAt || new Date(), paymentStatus: 'pending', assignedTo } } : {}),
      });
      if (createdAt) await M.Lead.collection.updateOne({ _id: lead._id }, { $set: { createdAt, lastEnquiryAt: createdAt, statusChangedAt: createdAt } });
      await M.Enquiry.create({ lead: lead._id, name, phone, email, service: service?._id, source: source?._id, message, formUsed: 'import', budgetLabel: budget ? S.fmtINR(budget) : '' });
      await logActivity(lead._id, 'lead_created', `Lead imported${fileLabel}`, {
        description: [`Row ${rowNo}`, status !== 'NEW' && `Stage: ${status}`, statusVal && !findBy(L.statuses, statusVal, ['key', 'label']) && `Unknown stage “${statusVal}” → ${status}`].filter(Boolean).join(' · '),
        user,
      });
      if (notes) { await M.LeadNote.create({ lead: lead._id, text: notes, createdBy: user._id }); await logActivity(lead._id, 'note_added', 'Note added (import)', { description: notes.slice(0, 500), user }); }
      if (keyP) seen.set(`p:${keyP}`, lead._id);
      if (email) seen.set(`e:${email}`, lead._id);
      result.created += 1;
      if (result.createdIds.length < 5000) result.createdIds.push(lead._id);
    } catch (e) {
      result.failed += 1;
      result.errors.push({ row: rowNo, name: r[col.name] || '', reason: e.message });
    }
  }
  return result;
}

module.exports = { parseFile, parseCsv, suggestMapping, importRows, FIELDS, MAX_ROWS };
