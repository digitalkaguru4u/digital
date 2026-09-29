const express = require('express');
const { z } = require('zod');
const ExcelJS = require('exceljs');
const { asyncHandler, HttpError } = require('../utils/http');
const validate = require('../middleware/validate');
const { requirePermission, can } = require('../middleware/auth');
const { parseFile, suggestMapping, importRows, FIELDS, MAX_ROWS } = require('../services/importer');
const { notify } = require('../services/notify');

const router = express.Router();
router.use(requirePermission('leads:create'));

const TEMPLATE = [
  ['Name', 'Phone', 'Email', 'Company', 'Service', 'Source', 'Campaign', 'Budget', 'Stage', 'Message', 'Notes', 'Assigned To', 'Created Date'],
  ['Priya Sharma', '+91 98765 43210', 'priya@example.com', 'Sharma Clinic', 'SEO', 'Google Ads', 'seo-mumbai-sept', '15000', 'Warm', 'Wants local SEO for 2 clinics', 'Called once, asked to call back Monday', '', '2026-09-20'],
  ['Rahul Verma', '9812345678', '', 'Verma Traders', 'Website Development', 'Referral', '', '35k', 'Hot', 'Needs 5-page website', '', '', '21/09/2026'],
];

router.get('/template', asyncHandler(async (req, res) => {
  if (req.query.format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Leads');
    TEMPLATE.forEach((r) => ws.addRow(r));
    ws.getRow(1).font = { bold: true };
    ws.columns.forEach((c) => { c.width = 20; });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="digital-guru-lead-import-template.xlsx"');
    await wb.xlsx.write(res);
    return res.end();
  }
  const esc = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="digital-guru-lead-import-template.csv"');
  res.send('﻿' + TEMPLATE.map((r) => r.map(esc).join(',')).join('\r\n'));
}));

router.post('/preview', validate(z.object({ fileName: z.string().min(1).max(200), data: z.string().min(4) })), asyncHandler(async (req, res) => {
  const buf = Buffer.from(req.body.data, 'base64');
  if (buf.length > 10 * 1024 * 1024) throw new HttpError(413, 'File is larger than 10 MB');
  let parsed;
  try { parsed = await parseFile(req.body.fileName, buf); } catch (e) { throw new HttpError(422, e.message); }
  res.json({ ...parsed, mapping: suggestMapping(parsed.headers), fields: Object.keys(FIELDS), maxRows: MAX_ROWS });
}));

router.post('/', validate(z.object({
  rows: z.array(z.array(z.string().max(5000))).min(1).max(MAX_ROWS),
  mapping: z.record(z.string(), z.string()),
  options: z.object({
    duplicate: z.enum(['skip', 'update', 'create']).default('skip'),
    defaultSource: z.string().optional().default(''),
    defaultStatus: z.string().optional().default('NEW'),
    assignTo: z.string().regex(/^[a-f0-9]{24}$/i).or(z.literal('')).optional().default(''),
    fileName: z.string().max(200).optional().default(''),
  }),
})), asyncHandler(async (req, res) => {
  const { rows, mapping, options } = req.body;
  const fields = Object.values(mapping);
  if (!fields.includes('phone') && !fields.includes('email')) throw new HttpError(422, 'Map at least a Phone or Email column');
  if (!fields.includes('name') && !fields.includes('firstName') && !fields.includes('phone')) throw new HttpError(422, 'Map a Name column');
  if (options.assignTo && !can(req.user, 'leads:assign')) options.assignTo = String(req.user._id);
  if (!options.assignTo && !can(req.user, 'leads:view_all')) options.assignTo = String(req.user._id); // so the importer can see them
  const result = await importRows({ rows, mapping, options: { ...options, assignTo: options.assignTo || null }, user: req.user });
  notify({
    users: [req.user._id], type: 'import',
    title: `Import finished: ${result.created} new, ${result.updated} updated`,
    body: `${options.fileName || 'File'} · ${result.skipped} skipped · ${result.failed} failed`, url: '/leads?sort=createdAt',
  });
  res.json(result);
}));

module.exports = router;
