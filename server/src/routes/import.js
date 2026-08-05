import { Router } from 'express';
import crypto from 'node:crypto';
import XLSX from 'xlsx';
import { query, pool } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap } from '../util.js';
import { noAccent } from '../lib/codes.js';

// Import is deliberately a two-phase operation.  Preview never writes data;
// commit accepts only the reviewed batch and is recorded for audit/rollback.
const router = Router();
router.use(authRequired, requireRole('admin'));

const text = (v) => (v === undefined || v === null ? '' : String(v)).normalize('NFC').trim().replace(/\s+/g, ' ');
const key = (v) => noAccent(text(v)).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
const code = (v) => text(v).toUpperCase();
const email = (v) => text(v).toLowerCase();
const url = (v) => { const x = text(v); if (!x) return ''; try { const p = new URL(x); return ['http:', 'https:'].includes(p.protocol) ? x : ''; } catch { return ''; } };
function number(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const raw = text(v).replace(/\s/g, ''); if (!raw) return null;
  const normalized = raw.includes(',') && raw.includes('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(',', '.');
  const parsed = Number(normalized.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}
function rate(v) {
  const parsed = number(v);
  // Spreadsheets commonly store VAT/discount as 8 instead of 0.08.
  return parsed !== null && parsed > 1 && parsed <= 100 ? parsed / 100 : parsed;
}
function formatDateParts(year, month, day) {
  const out = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  return Number.isNaN(new Date(`${out}T00:00:00Z`).getTime()) ? null : out;
}
function date(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); if (d && d.y >= 1900 && d.y <= 2200) return formatDateParts(d.y, d.m, d.d); }
  const x = text(v); let m = /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/.exec(x);
  if (!m) { m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(x); if (m) m = [m[0], m[3], m[2], m[1]]; }
  if (m) return formatDateParts(m[1], m[2], m[3]);
  const english = /(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})/i.exec(x);
  if (!english) return null;
  const months = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  return formatDateParts(english[3], months[english[1].toLowerCase()], english[2]);
}
function status(raw) {
  const x = noAccent(raw).toLowerCase();
  if (/huy|cancel/.test(x)) return 'cancelled'; if (/hoan thanh|hoan tat/.test(x)) return 'completed';
  if (/thanh toan/.test(x)) return 'paid'; if (/nhap kho/.test(x)) return 'warehoused';
  if (/nhan hang|da nhan/.test(x)) return 'received'; if (/dat hang/.test(x)) return 'ordered';
  if (/bao gia/.test(x)) return 'quoted'; if (/dang|lam mau/.test(x)) return 'in_progress'; return 'new';
}
function readSheet(sheet, headerRow = 0) {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
  const headers = (rows[headerRow] || []).map(key); const seen = new Set();
  const records = rows.slice(headerRow + 1).map((row, index) => {
    const value = {}; headers.forEach((h, col) => { if (h) value[h] = row[col]; });
    return { row: index + headerRow + 2, value };
  }).filter(({ value }) => Object.values(value).some((v) => text(v)));
  return { headers, duplicateHeaders: headers.filter((h) => h && (seen.has(h) || !seen.add(h))), records };
}
function issue(row, field, severity, message) { row.issues.push({ field, severity, message }); }
function computedLine(row) {
  const q = number(row.quantity), price = number(row.unit_price), vat = number(row.vat_rate) ?? 0, discount = number(row.discount_rate) ?? 0;
  if (q === null || price === null) return null;
  const subtotal = Math.round(q * price * (1 - discount)); const tax = Math.round(subtotal * vat);
  return { thanh_tien: subtotal, tien_thue: tax, line_total: subtotal + tax };
}
function parseData(data) {
  const groups = new Map(); const rows = [];
  for (const { row: rowNumber, value: r } of data.records) {
    if (text(r.DA_XOA)) continue;
    const item = { source_row: rowNumber, order_code: code(r.MA_DH), item_name: text(r.TEN_HANG), quantity: number(r.SO_LUONG), unit_price: number(r.DON_GIA), vat_rate: rate(r.VAT) ?? 0, discount_rate: rate(r.CHIET_KHAU) ?? 0, issues: [] };
    if (!item.order_code) issue(item, 'MA_DH', 'error', 'Thiếu mã đơn hàng.');
    if (!item.item_name) issue(item, 'TEN_HANG', 'error', 'Thiếu tên hàng.');
    if (!(item.quantity > 0)) issue(item, 'SO_LUONG', 'error', 'Số lượng phải lớn hơn 0.');
    if (!(item.unit_price >= 0)) issue(item, 'DON_GIA', 'error', 'Đơn giá phải là số không âm.');
    if (item.vat_rate < 0 || item.vat_rate > 1) issue(item, 'VAT', 'error', 'VAT phải nằm trong khoảng 0–100%.');
    item.request_date = date(r.NGAY_YC); item.expected_date = date(r.NGAY_NHAN); item.actual_date = date(r.NGAY_THUC_NHAN); item.handover_date = date(r.NGAY_BAN_GIAO);
    for (const f of ['NGAY_YC', 'NGAY_NHAN', 'NGAY_THUC_NHAN', 'NGAY_BAN_GIAO']) if (text(r[f]) && !date(r[f])) issue(item, f, 'error', 'Ngày không hợp lệ.');
    if (item.request_date && item.expected_date && item.expected_date < item.request_date) issue(item, 'NGAY_NHAN', 'warning', 'Ngày nhận dự kiến trước ngày yêu cầu.');
    item.quotation_url = url(r.FILE_BG); item.design_link = url(r.THIET_KE) || url(r.LINK_THIET_KE); item.image_url = url(r.IMAGE_URL);
    for (const f of ['FILE_BG', 'THIET_KE', 'LINK_THIET_KE', 'IMAGE_URL']) if (text(r[f]) && !(url(r[f]))) issue(item, f, 'warning', 'URL không hợp lệ; sẽ không được lưu.');
    Object.assign(item, { requester_email: email(r.EMAIL), requester_name: text(r.TEN) || text(r.TEN_NGUOI_YEU_CAU), team_code: code(r.TEAM), project_name: text(r.TEN_DU_AN), pm: text(r.PM), hang_muc: text(r.HANG_MUC), status_raw: text(r.TIEN_TRINH), status: status(r.TIEN_TRINH), supplier_name: text(r.NCC), supplier_tax_code: text(r.MA_SO_THUE), loai_hh: text(r.LOAI_HH), item_code: code(r.MA_HANG), description: text(r.MO_TA_NGAN), unit: text(r.DVT), master_contract: text(r.MASTER_CONTRACT), pr_no: text(r.SO_PR), payment_method: text(r.HINH_THUC_TT), payment_term: text(r.THOI_HAN_TT), receiving_point: text(r.DIEM_NHAN), contract_no: text(r.SO_HOP_DONG), vendor_link: url(r.LINK_VENDOR), qdnb_link: url(r.QDNB_TBKM), warehouse_status: text(r.NHAP_KHO), note: text(r.GHI_CHU), progress: text(r.TIEN_TRINH) });
    const calc = computedLine(item); if (calc) { const supplied = number(r.TONG_TIEN); item.recalculated_total = supplied !== null && Math.abs(supplied - calc.line_total) > 1; Object.assign(item, calc); }
    rows.push(item); if (item.order_code) { if (!groups.has(item.order_code)) groups.set(item.order_code, []); groups.get(item.order_code).push(item); }
  }
  // A repeated order code identifies one order header with independent item
  // rows. Retain the source order so the preview can show that grouping.
  for (const lines of groups.values()) lines.forEach((item, index) => {
    item.order_line_no = index + 1;
    item.order_line_count = lines.length;
  });
  return { rows, groups };
}

router.post('/preview', wrap(async (req, res) => {
  const { fileBase64, filename = 'import.xlsx', mapping = {} } = req.body || {};
  if (!fileBase64) return res.status(400).json({ error: 'Thiếu file Excel.' });
  const buffer = Buffer.from(fileBase64, 'base64'); if (buffer.length > 12 * 1024 * 1024) return res.status(413).json({ error: 'File vượt giới hạn 12 MB.' });
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: true });
  if (!wb.Sheets.DATA) return res.status(400).json({ error: 'Không tìm thấy sheet DATA.' });
  const data = readSheet(wb.Sheets.DATA, 1); const parsed = parseData(data);
  // Equal item lines can be intentional (for example separate receipts in one order),
  // so retain every source row without turning that pattern into an import warning.
  const existing = parsed.groups.size ? await query(`SELECT order_code FROM orders WHERE deleted_at IS NULL AND order_code IN (${[...parsed.groups.keys()].map(() => '?').join(',')})`, [...parsed.groups.keys()]) : [];
  const existingCodes = new Set(existing.map((x) => x.order_code)); for (const row of parsed.rows) if (existingCodes.has(row.order_code)) issue(row, 'MA_DH', 'warning', 'Mã đơn đã tồn tại; mặc định sẽ bỏ qua khi commit.');
  const categorySheet = wb.Sheets.DM_SP ? readSheet(wb.Sheets.DM_SP, 0) : null; const supplierSheet = wb.Sheets.NCC ? readSheet(wb.Sheets.NCC, 0) : null;
  const errors = parsed.rows.filter((r) => r.issues.some((x) => x.severity === 'error')).length; const warnings = parsed.rows.filter((r) => r.issues.some((x) => x.severity === 'warning')).length;
  const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
  const payload = { version: 2, filename: text(filename), checksum, mapping, data_headers: data.headers, source: { data: parsed.rows, categories: categorySheet?.records.map((x) => ({ source_row: x.row, ...x.value })) || [], suppliers: supplierSheet?.records.map((x) => ({ source_row: x.row, ...x.value })) || [] } };
  const result = await query('INSERT INTO import_batches (checksum, filename, mapping_json, preview_json, status, created_by) VALUES (?,?,?,?,?,?)', [checksum, text(filename), JSON.stringify(mapping), JSON.stringify(payload), 'previewed', req.user.email]);
  const groupedLines = [...parsed.groups.values()];
  res.status(201).json({ batch_id: result.insertId, checksum, headers: data.headers, summary: { total_rows: parsed.rows.length, valid_rows: parsed.rows.length - errors, error_rows: errors, warning_rows: warnings, recalculated_total_rows: parsed.rows.filter((row) => row.recalculated_total).length, orders: parsed.groups.size, multi_line_orders: groupedLines.filter((lines) => lines.length > 1).length, max_lines_per_order: Math.max(0, ...groupedLines.map((lines) => lines.length)), existing_orders: existingCodes.size, suppliers: new Set(parsed.rows.map((x) => key(x.supplier_name)).filter(Boolean)).size, categories: new Set(parsed.rows.map((x) => key(x.loai_hh)).filter(Boolean)).size, master_supplier_rows: supplierSheet?.records.length || 0, master_category_rows: categorySheet?.records.length || 0 }, rows: parsed.rows, sheets: wb.SheetNames, sheet_previews: { DATA: { headers: data.headers, rows: parsed.rows }, NCC: { headers: supplierSheet?.headers || [], rows: supplierSheet?.records.map((x) => ({ source_row: x.row, ...x.value })) || [] }, DM_SP: { headers: categorySheet?.headers || [], rows: categorySheet?.records.map((x) => ({ source_row: x.row, ...x.value })) || [] } } });
}));

router.get('/batches', wrap(async (req, res) => res.json({ data: await query('SELECT id, filename, checksum, status, created_by, created_at, committed_at, rolled_back_at, summary_json FROM import_batches ORDER BY id DESC LIMIT 50') })));
router.get('/batches/:id', wrap(async (req, res) => { const [batch] = await query('SELECT * FROM import_batches WHERE id=?', [req.params.id]); if (!batch) return res.status(404).json({ error: 'Không tìm thấy batch.' }); const preview = JSON.parse(batch.preview_json || '{}'); res.json({ batch: { ...batch, preview_json: undefined }, rows: (preview.source?.data || []).slice(0, 250), total_rows: preview.source?.data?.length || 0 }); }));

router.post('/batches/:id/commit', wrap(async (req, res) => {
  const [batch] = await query('SELECT * FROM import_batches WHERE id=? FOR UPDATE', [req.params.id]); if (!batch) return res.status(404).json({ error: 'Không tìm thấy batch.' }); if (batch.status === 'committed') return res.json({ ok: true, idempotent: true, summary: JSON.parse(batch.summary_json || '{}') }); if (batch.status === 'rolled_back') return res.status(409).json({ error: 'Batch đã rollback.' });
  const preview = JSON.parse(batch.preview_json || '{}'); const rows = preview.source?.data || []; if (!rows.length) return res.status(400).json({ error: 'Batch không có dữ liệu để nhập.' });
  const blockers = rows.filter((r) => r.issues?.some((x) => x.severity === 'error')); if (blockers.length) return res.status(422).json({ error: `Còn ${blockers.length} dòng lỗi cần xử lý trước khi nhập.` });
  const conn = await pool.getConnection(); const summary = { created_orders: 0, skipped_orders: 0, created_items: 0, created_suppliers: 0, created_categories: 0, warning_rows: rows.filter((r) => r.issues?.some((x) => x.severity === 'warning')).length };
  try {
    await conn.beginTransaction(); const orderGroups = new Map(); for (const row of rows) { if (!orderGroups.has(row.order_code)) orderGroups.set(row.order_code, []); orderGroups.get(row.order_code).push(row); }
    const [statuses] = await conn.query('SELECT code FROM workflow_states WHERE is_active=1'); const allowedStatuses = new Set(statuses.map((x) => x.code));
    const categoryRows = (await conn.query('SELECT id, code, name, aliases, abbr2 FROM categories'))[0];
    const categoryMap = new Map(categoryRows.flatMap((x) => [[key(x.name), x.id], ...text(x.aliases).split(';').filter(Boolean).map((a) => [key(a), x.id])]));
    const supplierRows = (await conn.query('SELECT id, name, tax_code, address, representative, contact_phone, contact_email, bank_name, bank_account, bank_branch, rep_title, delivery_person, delivery_phone, delivery_email, master_contract FROM suppliers'))[0];
    const supplierByName = new Map(supplierRows.map((x) => [key(x.name), x])); const supplierByTax = new Map(supplierRows.filter((x) => text(x.tax_code)).map((x) => [text(x.tax_code), x]));
    const onlyBlank = (current, incoming) => text(current) || !text(incoming) ? current || null : incoming;
    async function categoryId(name, source = {}) {
      const aliases = [...new Set(String(source.aliases || name).split(';').map(text).filter(Boolean))]; const displayName = text(name) || aliases[0]; const k = key(displayName); if (!k) return null;
      if (categoryMap.has(k)) { const id = categoryMap.get(k); const existing = categoryRows.find((x) => x.id === id); if (existing && (!text(existing.aliases) || !text(existing.abbr2))) await conn.query('UPDATE categories SET aliases=?, abbr2=? WHERE id=?', [onlyBlank(existing.aliases, aliases.join(';')), onlyBlank(existing.abbr2, text(source.abbr2)), id]); for (const alias of aliases.length ? aliases : [displayName]) categoryMap.set(key(alias), id); return id; }
      const [r] = await conn.query('INSERT INTO categories (code,name,aliases,abbr2) VALUES (?,?,?,?)', [`IMP_${k}`.slice(0, 64), displayName, aliases.join(';') || displayName, text(source.abbr2) || null]); categoryRows.push({ id: r.insertId, name: displayName, aliases: aliases.join(';'), abbr2: text(source.abbr2) }); for (const alias of aliases.length ? aliases : [displayName]) categoryMap.set(key(alias), r.insertId); summary.created_categories++; return r.insertId;
    }
    async function supplierId(row) {
      const tax = text(row.supplier_tax_code || row.MA_SO_THUE); const supplierName = text(row.supplier_name || row.NCC); const k = key(supplierName); if (!k) return null;
      const source = { address: text(row.address || row.DIA_CHI), representative: text(row.representative || row.NGUOI_DAI_DIEN_NCC), contact_phone: text(row.contact_phone || row.SO_DIEN_THOAI_NGUOI_DAI_DIEN), contact_email: text(row.contact_email || row.EMAIL_NGUOI_DAI_DIEN), bank_name: text(row.bank_name || row.NGAN_HANG), bank_account: text(row.bank_account || row.SO_TAI_KHOAN), bank_branch: text(row.bank_branch || row.CHI_NHANH_NGAN_HANG), rep_title: text(row.rep_title || row.CHUC_VU_DAI_DIEN_NCC), delivery_person: text(row.delivery_person || row.NHAN_SU_PHU_TRACH), delivery_phone: text(row.delivery_phone || row.DIEN_THOAI_NHAN_SU_PHU_TRACH), delivery_email: text(row.delivery_email || row.EMAIL_NHAN_SU_PHU_TRACH), master_contract: text(row.master_contract || row.LINK_MASTER_CONTRACT || row.SO_MASTER_CONTRACT) };
      const existing = (tax && supplierByTax.get(tax)) || supplierByName.get(k);
      if (existing) { const fields = ['tax_code', ...Object.keys(source)]; const values = fields.map((field) => onlyBlank(existing[field], field === 'tax_code' ? tax : source[field])); if (values.some((value, index) => value !== (existing[fields[index]] || null))) await conn.query(`UPDATE suppliers SET ${fields.map((field) => `${field}=?`).join(', ')} WHERE id=?`, [...values, existing.id]); const refreshed = { ...existing }; fields.forEach((field, index) => { refreshed[field] = values[index]; }); supplierByName.set(k, refreshed); if (tax) supplierByTax.set(tax, refreshed); return existing.id; }
      const fields = ['name', 'tax_code', ...Object.keys(source)]; const values = [supplierName, tax || null, ...Object.values(source).map((value) => value || null)]; const [r] = await conn.query(`INSERT INTO suppliers (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`, values); const created = { id: r.insertId, name: supplierName, tax_code: tax, ...source }; supplierByName.set(k, created); if (tax) supplierByTax.set(tax, created); summary.created_suppliers++; return r.insertId;
    }
    for (const master of preview.source?.categories || []) { const aliases = String(master.LOAI_HH || '').split(';').map(text).filter(Boolean); if (aliases.length) await categoryId(aliases[0], { aliases: aliases.join(';'), abbr2: master.ABBR2 }); }
    for (const master of preview.source?.suppliers || []) await supplierId(master);
    const teamRows = (await conn.query('SELECT id, code FROM teams'))[0]; const teams = new Map(teamRows.map((x) => [code(x.code), x.id])); async function teamId(teamCode) { if (!teamCode) return null; if (teams.has(teamCode)) return teams.get(teamCode); const [r] = await conn.query('INSERT INTO teams (code,name) VALUES (?,?)', [teamCode, teamCode]); teams.set(teamCode, r.insertId); return r.insertId; }
    for (const [orderCode, lines] of orderGroups) {
      const h = lines[0]; const supplierIdValue = await supplierId(h);
      // `INSERT IGNORE` makes the import safe when another batch creates the
      // same order after this batch was previewed.  Existing orders must be
      // preserved, never treated as a database error or imported twice.
      const [created] = await conn.query(`INSERT IGNORE INTO orders (order_code,requester_email,requester_name,team_id,supplier_id,project_name,pm,status,status_raw,hang_muc,qdnb_link,request_date,expected_date,actual_date,handover_date,receiving_point,pr_no,contract_no,payment_method,payment_term,warehouse_status,note,import_batch_id,total_amount) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`, [orderCode,h.requester_email,h.requester_name,await teamId(h.team_code),supplierIdValue,h.project_name,h.pm,allowedStatuses.has(h.status) ? h.status : 'new',h.status_raw,h.hang_muc,h.qdnb_link || null,h.request_date,h.expected_date,h.actual_date,h.handover_date,h.receiving_point,h.pr_no,h.contract_no,h.payment_method,h.payment_term,h.warehouse_status,h.note,batch.id]);
      if (!created.affectedRows) { summary.skipped_orders++; continue; }
      let total = 0; for (const line of lines) { const categoryIdValue = await categoryId(line.loai_hh); const lineSupplier = await supplierId(line); total += Number(line.line_total || 0); await conn.query(`INSERT INTO order_items (order_id,category_id,loai_hh,item_name,item_code,description,unit,quantity,unit_price,vat_rate,discount_rate,thanh_tien,tien_thue,line_total,image_url,quotation_url,design_link,progress,note,supplier_id,master_contract,so_pr) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [created.insertId,categoryIdValue,line.loai_hh,line.item_name,line.item_code || null,line.description || null,line.unit || null,line.quantity,line.unit_price,line.vat_rate,line.discount_rate,line.thanh_tien,line.tien_thue,line.line_total,line.image_url || null,line.quotation_url || null,line.design_link || null,line.progress || null,line.note || null,lineSupplier,line.master_contract || null,line.pr_no || null]); summary.created_items++; }
      await conn.query('UPDATE orders SET total_amount=? WHERE id=?', [total, created.insertId]); if (supplierIdValue) await conn.query('INSERT INTO order_suppliers (order_id,supplier_id,payment_method,payment_time,contract_no,vendor_link) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE payment_method=VALUES(payment_method),payment_time=VALUES(payment_time),contract_no=VALUES(contract_no),vendor_link=VALUES(vendor_link)', [created.insertId,supplierIdValue,h.payment_method,h.payment_term,h.contract_no,h.vendor_link || null]); summary.created_orders++;
    }
    await conn.query('UPDATE import_batches SET status=?, committed_at=NOW(), committed_by=?, summary_json=? WHERE id=?', ['committed', req.user.email, JSON.stringify(summary), batch.id]); await conn.commit(); res.json({ ok: true, summary });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

router.post('/batches/:id/rollback', wrap(async (req, res) => {
  const conn = await pool.getConnection(); try { await conn.beginTransaction(); const [batch] = await conn.query('SELECT * FROM import_batches WHERE id=? FOR UPDATE', [req.params.id]); if (!batch[0]) return res.status(404).json({ error: 'Không tìm thấy batch.' }); if (batch[0].status !== 'committed') return res.status(409).json({ error: 'Chỉ rollback batch đã commit.' }); const [r] = await conn.query('UPDATE orders SET deleted_at=NOW(), deleted_by=? WHERE import_batch_id=? AND deleted_at IS NULL', [req.user.email, req.params.id]); await conn.query('UPDATE import_batches SET status=?, rolled_back_at=NOW(), rolled_back_by=? WHERE id=?', ['rolled_back', req.user.email, req.params.id]); await conn.commit(); res.json({ ok: true, rolled_back_orders: r.affectedRows }); } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

export default router;
