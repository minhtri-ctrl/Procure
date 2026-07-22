import { Router } from 'express';
import XLSX from 'xlsx';
import { query, pool } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';
import { nextOrderCode, nextItemCode } from '../lib/codes.js';
import { normalizeLineStatus, LINE_STATUS_CODES } from '../lib/lineStatus.js';
import { createNotification } from '../lib/notify.js';
import { runAutomationSweep, runOrderAutomation } from '../lib/orderAutomation.js';

const router = Router();
router.use(authRequired);

// Giới hạn dữ liệu theo vai trò: requester -> email của mình; pm -> team của mình.
function scopeClause(user, alias = 'o') {
  if (user.role === 'requester') return { sql: `${alias}.requester_email = ?`, params: [user.email] };
  if (user.role === 'pm') return { sql: `${alias}.team_id = ?`, params: [user.team_id || 0] };
  return null;
}

const HEADER_FIELDS = [
  'order_code', 'requester_email', 'requester_name', 'team_id', 'supplier_id', 'project_name',
  'pm', 'status', 'status_raw', 'hang_muc', 'qdnb_tbkm', 'qdnb_link', 'request_date', 'expected_date', 'actual_date', 'handover_date',
  'receiving_point', 'pr_no', 'contract_no', 'payment_method', 'payment_term', 'warehouse_status', 'note', 'custom_fields',
];
function normHeader(h) {
  if (h.custom_fields && typeof h.custom_fields === 'object') h.custom_fields = JSON.stringify(h.custom_fields);
  return h;
}
const ITEM_FIELDS = [
  'product_id', 'category_id', 'loai_hh', 'item_name', 'item_code', 'description', 'unit', 'quantity',
  'unit_price', 'vat_rate', 'discount_rate', 'image_url', 'quotation_url', 'design_link', 'reason_choose',
  'progress', 'note', 'supplier_id', 'master_contract', 'so_pr', 'rental_start', 'rental_end',
];

// Tính tiền cho 1 dòng: THANH_TIEN = SL×giá×(1-CK); TIEN_THUE = THANH_TIEN×VAT; TONG = cộng thuế.
function computeLine(it) {
  const qty = Number(it.quantity || 0);
  const price = Number(it.unit_price || 0);
  const vat = Number(it.vat_rate || 0);
  const disc = Number(it.discount_rate || 0);
  const thanhTien = Math.round(qty * price * (1 - disc));
  const tienThue = Math.round(thanhTien * vat);
  return { thanh_tien: thanhTien, tien_thue: tienThue, line_total: thanhTien + tienThue };
}

function deriveStatus(items) {
  const active = items.map((item) => normalizeLineStatus(item.progress)).filter((code) => code !== 'huy');
  if (!items.length) return null;
  if (!active.length) return 'cancelled';
  if (active.every((code) => ['da_nhan', 'da_nhap_kho', 'da_giao'].includes(code))) return 'received';
  if (active.some((code) => code === 'cho_bao_gia')) return 'in_progress';
  return 'ordered';
}

async function syncOrderStatusFromItems(orderId, actorEmail = 'automation') {
  const items = await query('SELECT progress FROM order_items WHERE order_id = ?', [orderId]);
  const derived = deriveStatus(items);
  if (!derived) return { changed: false, reason: 'no_items' };
  const [order] = await query('SELECT status FROM orders WHERE id = ?', [orderId]);
  if (!order || order.status === derived) return { changed: false, status: order?.status || null };
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [derived, orderId]);
    await logStatus(conn, orderId, order.status, derived, actorEmail, 'Tự đồng bộ từ tiến trình dòng hàng');
    await conn.commit();
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
  await runOrderAutomation(orderId, { fromStatus: order.status, toStatus: derived, actorEmail });
  return { changed: true, from: order.status, to: derived };
}

async function teamCodeOf(teamId) {
  if (!teamId) return '';
  const [t] = await query('SELECT code FROM teams WHERE id = ?', [teamId]);
  return t?.code || '';
}

async function logStatus(conn, orderId, from, to, by, note) {
  await conn.query(
    'INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note) VALUES (?,?,?,?,?)',
    [orderId, from || null, to, by || null, note || null]
  );
}

// LIST
router.get('/', wrap(async (req, res) => {
  const { q, status, team_id, supplier_id, date_from, date_to, date_field = 'request_date', page = 1, limit = 50 } = req.query;
  const lim = Math.min(Number(limit) || 50, 200);
  const off = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const where = ['o.deleted_at IS NULL'];
  const params = [];
  const sc = scopeClause(req.user);
  if (sc) { where.push(sc.sql); params.push(...sc.params); }
  if (q) { where.push('(o.order_code LIKE ? OR o.project_name LIKE ? OR o.requester_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (team_id) { where.push('o.team_id = ?'); params.push(team_id); }
  if (supplier_id) { where.push('o.supplier_id = ?'); params.push(supplier_id); }
  const dateColumn = { request_date: 'o.request_date', expected_date: 'o.expected_date', created_at: 'o.created_at' }[date_field] || 'o.request_date';
  if (date_from) { where.push(`${dateColumn} >= ?`); params.push(date_from); }
  if (date_to) { where.push(`${dateColumn} < DATE_ADD(?, INTERVAL 1 DAY)`); params.push(date_to); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(
    `SELECT o.*, t.name AS team_name,
            COALESCE(
              NULLIF((SELECT GROUP_CONCAT(DISTINCT line_supplier.name ORDER BY line_supplier.name SEPARATOR ', ')
                      FROM order_items line_item
                      JOIN suppliers line_supplier ON line_supplier.id = line_item.supplier_id
                      WHERE line_item.order_id = o.id), ''),
              s.name
            ) AS supplier_name,
            w.name AS status_name, w.color AS status_color,
            (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
     FROM orders o
     LEFT JOIN teams t ON t.id = o.team_id
     LEFT JOIN suppliers s ON s.id = o.supplier_id
     LEFT JOIN workflow_states w ON w.code = o.status
     ${whereSql} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    [...params, lim, off]
  );
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM orders o ${whereSql}`, params);
  res.json({ data: rows, total, page: Number(page), limit: lim });
}));

// EXPORT CSV/Excel dữ liệu mua hàng (phẳng theo dòng hàng).
router.get('/export', wrap(async (req, res) => {
  const format = (req.query.format || 'xlsx').toLowerCase();
  const where = ['o.deleted_at IS NULL'];
  const params = [];
  const sc = scopeClause(req.user);
  if (sc) { where.push(sc.sql); params.push(...sc.params); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(
    `SELECT o.order_code, o.request_date, o.expected_date, t.name AS team, o.requester_name, o.requester_email,
            o.project_name, o.hang_muc, o.receiving_point, o.qdnb_tbkm, o.po_no, o.status_raw,
            i.loai_hh, i.item_code, i.item_name, i.description, i.quantity, i.unit, i.unit_price, i.vat_rate,
            i.tien_thue, i.thanh_tien, i.line_total, i.so_pr, i.master_contract, s.name AS ncc, i.nhap_kho, i.progress
     FROM orders o LEFT JOIN order_items i ON i.order_id=o.id LEFT JOIN teams t ON t.id=o.team_id LEFT JOIN suppliers s ON s.id=i.supplier_id
     ${whereSql} ORDER BY o.id DESC, i.id`, params);
  const data = rows.map((r) => ({
    'Mã đơn': r.order_code, 'Ngày YC': r.request_date || '', 'Ngày nhận': r.expected_date || '', 'Team': r.team || '',
    'Người YC': r.requester_name || '', 'Email': r.requester_email || '', 'Dự án': r.project_name || '', 'Hạng mục': r.hang_muc || '',
    'Điểm nhận': r.receiving_point || '', 'QĐNB': r.qdnb_tbkm || '', 'PO': r.po_no || '', 'Tiến trình': r.status_raw || '',
    'Loại HH': r.loai_hh || '', 'Mã hàng': r.item_code || '', 'Tên hàng': r.item_name || '', 'Mô tả': r.description || '',
    'SL': Number(r.quantity || 0), 'ĐVT': r.unit || '', 'Đơn giá': Number(r.unit_price || 0), 'VAT%': Math.round(Number(r.vat_rate || 0) * 100),
    'Tiền thuế': Number(r.tien_thue || 0), 'Thành tiền': Number(r.thanh_tien || 0), 'Tổng': Number(r.line_total || 0),
    'Số PR': r.so_pr || '', 'Master Contract': r.master_contract || '', 'NCC': r.ncc || '', 'Nhập kho': r.nhap_kho || '',
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="procureos-orders.csv"');
    return res.send('﻿' + XLSX.utils.sheet_to_csv(ws)); // BOM để Excel đọc UTF-8
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'DonHang');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="procureos-orders.xlsx"');
  res.send(buf);
}));

// Đếm số đơn hàng hiện có (trong phạm vi của user) — dùng cho hộp thoại xác nhận "xóa toàn bộ".
router.get('/count', wrap(async (req, res) => {
  const where = ['o.deleted_at IS NULL'];
  const params = [];
  const sc = scopeClause(req.user);
  if (sc) { where.push(sc.sql); params.push(...sc.params); }
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM orders o WHERE ${where.join(' AND ')}`, params);
  res.json({ total });
}));

// LIST tất cả DÒNG HÀNG (mọi đơn, theo scope) — cho màn "Xử lý mặt hàng" của Buyer.
// Trả line_status (code chuẩn hoá từ order_items.progress) để gom nhóm theo trạng thái.
const DUE_SOON_RECEIPT_DAYS = 3;
const DUE_SOON_PAYMENT_DAYS = 7;
const CONTRACT_REQUIRED_AMOUNT = 20000000;

// Cờ cảnh báo tính theo ĐƠN (dùng chung cho counts và data) — so ngày theo mốc 00:00 hôm nay.
function computeOrderFlags(o) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const flags = { overdue_receipt: false, due_soon_receipt: false, due_soon_payment: false, missing_contract: false };
  if (o.expected_date && !o.actual_date) {
    const exp = new Date(o.expected_date); exp.setHours(0, 0, 0, 0);
    const diffDays = Math.round((exp - today) / 86400000);
    if (diffDays < 0) flags.overdue_receipt = true;
    else if (diffDays <= DUE_SOON_RECEIPT_DAYS) flags.due_soon_receipt = true;
  }
  if (o.actual_date) {
    const due = new Date(o.actual_date); due.setHours(0, 0, 0, 0);
    due.setDate(due.getDate() + (o.payment_term_days ?? 14));
    const diffDays = Math.round((due - today) / 86400000);
    if (diffDays >= 0 && diffDays <= DUE_SOON_PAYMENT_DAYS) flags.due_soon_payment = true;
  }
  const hasPoOrContract = !!(o.po_no || o.contract_no) || Number(o.contract_count) > 0;
  if (Number(o.total_amount) > CONTRACT_REQUIRED_AMOUNT && !hasPoOrContract) flags.missing_contract = true;
  return flags;
}

router.get('/items/all', wrap(async (req, res) => {
  const { q, line_status, flag, team_id, supplier_id, date_from, date_to } = req.query;
  const where = ['o.deleted_at IS NULL'];
  const params = [];
  const sc = scopeClause(req.user);
  if (sc) { where.push(sc.sql); params.push(...sc.params); }
  if (q) { where.push('(o.order_code LIKE ? OR i.item_name LIKE ? OR o.project_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (team_id) { where.push('o.team_id = ?'); params.push(team_id); }
  if (supplier_id) { where.push('i.supplier_id = ?'); params.push(supplier_id); }
  if (date_from) { where.push('o.expected_date >= ?'); params.push(date_from); }
  if (date_to) { where.push('o.expected_date < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(date_to); }
  const rows = await query(
    `SELECT i.id, i.order_id, i.item_name, i.loai_hh, i.unit, i.quantity, i.unit_price, i.line_total, i.vat_rate, i.discount_rate,
            i.progress, i.nhap_kho, i.in_catalog, i.item_code, i.so_pr, i.design_link, i.note, i.description, i.quotation_url,
            o.order_code, o.project_name, o.status AS order_status, o.requester_name,
            o.expected_date, o.actual_date, o.total_amount, o.po_no, o.contract_no,
            COALESCE(hs.payment_term_days, 14) AS payment_term_days,
            (SELECT COUNT(*) FROM contracts c WHERE c.order_id = o.id) AS contract_count,
            t.name AS team_name, s.name AS supplier_name
     FROM order_items i
     JOIN orders o ON o.id = i.order_id
     LEFT JOIN teams t ON t.id = o.team_id
     LEFT JOIN suppliers s ON s.id = i.supplier_id
     LEFT JOIN suppliers hs ON hs.id = o.supplier_id
     WHERE ${where.join(' AND ')}
     ORDER BY o.id DESC, i.id`, params);

  // Gom cờ cảnh báo + số dòng theo trạng thái theo từng đơn (order_id) — mỗi đơn chỉ tính 1 lần.
  const orderFlags = new Map();
  for (const r of rows) {
    if (!orderFlags.has(r.order_id)) orderFlags.set(r.order_id, computeOrderFlags(r));
  }

  let data = rows.map((r) => ({ ...r, line_status: normalizeLineStatus(r.progress), flags: { ...orderFlags.get(r.order_id), missing_supplier: !r.supplier_name, missing_pr: !r.so_pr, missing_design_link: !r.design_link, missing_price: !Number(r.unit_price) } }));
  if (line_status) data = data.filter((r) => r.line_status === line_status);
  if (flag) data = data.filter((r) => r.flags[flag]);

  // Đếm theo từng nhóm trạng thái dòng (trước khi lọc) để hiển thị số trên tab.
  const counts = {};
  for (const r of rows) { const c = normalizeLineStatus(r.progress); counts[c] = (counts[c] || 0) + 1; }

  // Đếm theo cờ cảnh báo — đếm số ĐƠN (không phải số dòng) khớp mỗi cờ.
  const flagCounts = { overdue_receipt: 0, due_soon_receipt: 0, due_soon_payment: 0, missing_contract: 0, missing_supplier: 0, missing_pr: 0, missing_design_link: 0, missing_price: 0 };
  for (const f of orderFlags.values()) {
    for (const k of Object.keys(flagCounts)) if (f[k]) flagCounts[k]++;
  }
  for (const r of data) for (const k of ['missing_supplier', 'missing_pr', 'missing_design_link', 'missing_price']) if (r.flags[k]) flagCounts[k]++;

  res.json({ data, counts, flagCounts, total: rows.length });
}));

// GET one + items + lịch sử
router.get('/:id', wrap(async (req, res) => {
  const rows = await query(
    `SELECT o.*, t.name AS team_name, t.code AS team_code, s.name AS supplier_name, w.name AS status_name, w.color AS status_color
     FROM orders o LEFT JOIN teams t ON t.id=o.team_id LEFT JOIN suppliers s ON s.id=o.supplier_id
     LEFT JOIN workflow_states w ON w.code=o.status WHERE o.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  const items = await query(
    `SELECT i.*, s.name AS supplier_name FROM order_items i LEFT JOIN suppliers s ON s.id=i.supplier_id
     WHERE i.order_id = ? ORDER BY i.id`, [req.params.id]);
  const history = await query('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id', [req.params.id]);
  let custom = {};
  try { custom = rows[0].custom_fields ? JSON.parse(rows[0].custom_fields) : {}; } catch { custom = {}; }
  res.json({ ...rows[0], custom_fields: custom, items, order_suppliers: await loadOrderSuppliers(req.params.id), history });
}));

async function loadOrderSuppliers(orderId) {
  const links = await query(
    `SELECT os.*, s.name AS supplier_name, s.contact_name, s.contact_email FROM order_suppliers os
     JOIN suppliers s ON s.id = os.supplier_id WHERE os.order_id = ? ORDER BY s.name`, [orderId]
  );
  const lineOnly = await query(
    `SELECT DISTINCT i.supplier_id, s.name AS supplier_name, s.contact_name, s.contact_email FROM order_items i
     JOIN suppliers s ON s.id = i.supplier_id WHERE i.order_id = ? AND i.supplier_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM order_suppliers os WHERE os.order_id = i.order_id AND os.supplier_id = i.supplier_id)`, [orderId]
  );
  const headerOnly = await query(
    `SELECT o.supplier_id, s.name AS supplier_name, s.contact_name, s.contact_email FROM orders o
     JOIN suppliers s ON s.id = o.supplier_id WHERE o.id = ? AND o.supplier_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM order_suppliers os WHERE os.order_id = o.id AND os.supplier_id = o.supplier_id)
     AND NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id AND i.supplier_id = o.supplier_id)`, [orderId]
  );
  const subtotals = await query('SELECT supplier_id, COALESCE(SUM(line_total),0) AS subtotal FROM order_items WHERE order_id = ? AND supplier_id IS NOT NULL GROUP BY supplier_id', [orderId]);
  const subtotalBySupplier = new Map(subtotals.map((r) => [String(r.supplier_id), Number(r.subtotal || 0)]));
  return [...links, ...lineOnly, ...headerOnly].map((row) => {
    let custom_fields = {};
    try { custom_fields = row.custom_fields ? JSON.parse(row.custom_fields) : {}; } catch { /* optional legacy data */ }
    const supplier_subtotal = subtotalBySupplier.get(String(row.supplier_id)) || 0;
    const discount_amount = Math.min(Number(row.discount_amount || 0), supplier_subtotal);
    return { ...row, supplier_subtotal, discount_amount, supplier_total: supplier_subtotal - discount_amount, custom_fields };
  });
}

// CREATE order + items (transaction) — sinh MA_DH & MA_HANG chuẩn.
router.post('/', wrap(async (req, res) => {
  const header = pick(req.body, HEADER_FIELDS);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  header.requester_email = header.requester_email || req.user.email;
  header.requester_name = header.requester_name || req.user.name;
  header.status = header.status || 'new';
  normHeader(header);
  const teamCode = await teamCodeOf(header.team_id);
  if (!header.order_code) header.order_code = await nextOrderCode(teamCode);

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const cols = Object.keys(header);
    await conn.query(
      `INSERT INTO orders (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => header[c])
    );
    const [[{ id: orderId }]] = await conn.query('SELECT LAST_INSERT_ID() AS id');
    let total = 0;
    for (const raw of items) {
      const it = pick(raw, ITEM_FIELDS);
      if (!it.item_name) continue;
      // Mã hàng (MA_HANG) sinh khi đẩy sang danh mục SP, không sinh lúc tạo đơn.
      Object.assign(it, computeLine(it));
      total += it.line_total;
      const ic = Object.keys(it);
      await conn.query(
        `INSERT INTO order_items (order_id, ${ic.map((c) => `\`${c}\``).join(',')}) VALUES (?, ${ic.map(() => '?').join(',')})`,
        [orderId, ...ic.map((c) => it[c])]
      );
    }
    await conn.query('UPDATE orders SET total_amount = ? WHERE id = ?', [total, orderId]);
    await logStatus(conn, orderId, null, header.status, req.user.email, 'Tạo đơn');
    await conn.commit();
    res.status(201).json({ id: orderId, order_code: header.order_code });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// UPDATE header
router.put('/:id', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const header = normHeader(pick(req.body, HEADER_FIELDS.filter((f) => f !== 'status'))); // status đổi qua endpoint riêng
  if (Object.keys(header).length) {
    const clause = Object.keys(header).map((k) => `\`${k}\` = ?`).join(', ');
    await query(`UPDATE orders SET ${clause} WHERE id = ?`, [...Object.values(header), req.params.id]);
  }
  res.json({ ok: true });
}));

router.get('/:id/suppliers', wrap(async (req, res) => {
  res.json({ data: await loadOrderSuppliers(req.params.id) });
}));

router.put('/:id/suppliers/:supplierId', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const supplierId = Number(req.params.supplierId);
  const [supplier] = await query('SELECT id FROM suppliers WHERE id = ?', [supplierId]);
  if (!supplier) return res.status(404).json({ error: 'Không tìm thấy nhà cung cấp' });
  const fields = pick(req.body || {}, ['payment_method', 'payment_time', 'contract_no', 'vendor_link', 'discount_type', 'discount_value', 'custom_fields']);
  if (fields.discount_type && !['percent', 'amount'].includes(fields.discount_type)) return res.status(400).json({ error: 'Loại chiết khấu không hợp lệ' });
  if (fields.discount_value !== undefined) {
    const value = Number(fields.discount_value);
    if (!Number.isFinite(value) || value < 0 || (fields.discount_type === 'percent' && value > 100)) return res.status(400).json({ error: 'Giá trị chiết khấu không hợp lệ' });
    const [subtotal] = await query('SELECT COALESCE(SUM(line_total),0) AS total FROM order_items WHERE order_id = ? AND supplier_id = ?', [req.params.id, supplierId]);
    fields.discount_value = value;
    fields.discount_amount = fields.discount_type === 'percent' ? Math.round(Number(subtotal.total || 0) * value / 100) : Math.min(value, Number(subtotal.total || 0));
  }
  if (fields.custom_fields && typeof fields.custom_fields === 'object') fields.custom_fields = JSON.stringify(fields.custom_fields);
  const cols = Object.keys(fields);
  const updates = cols.length ? cols.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(', ') : 'supplier_id = VALUES(supplier_id)';
  await query(
    `INSERT INTO order_suppliers (order_id, supplier_id${cols.length ? `, ${cols.map((c) => `\`${c}\``).join(', ')}` : ''}) VALUES (?, ?${cols.map(() => ', ?').join('')}) ON DUPLICATE KEY UPDATE ${updates}`,
    [req.params.id, supplierId, ...cols.map((c) => fields[c])]
  );
  await recalcTotal(req.params.id);
  res.json({ ok: true });
}));

// Chuyển tiến trình (workflow) — kiểm soát theo vai trò.
router.patch('/:id/status', wrap(async (req, res) => {
  const { status, note } = req.body || {};
  if (!status) return res.status(400).json({ error: 'Thiếu trạng thái' });
  const [ord] = await query('SELECT id, status, requester_email FROM orders WHERE id = ?', [req.params.id]);
  if (!ord) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  const [st] = await query('SELECT code FROM workflow_states WHERE code = ?', [status]);
  if (!st) return res.status(400).json({ error: 'Trạng thái không hợp lệ' });

  const role = req.user.role;
  const allowed =
    role === 'admin' || role === 'purchasing' ? true
      : role === 'requester' ? (ord.requester_email === req.user.email && ['confirmed', 'rejected'].includes(status))
        : role === 'warehouse' ? ['warehoused', 'received'].includes(status)
          : false;
  if (!allowed) return res.status(403).json({ error: 'Không đủ quyền chuyển trạng thái này' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
    if (status === 'warehoused') await conn.query('UPDATE orders SET warehouse_status = ? WHERE id = ?', ['Đã nhập kho', req.params.id]);
    await logStatus(conn, req.params.id, ord.status, status, req.user.email, note);
    await conn.commit();
    let automation;
    try {
      automation = await runOrderAutomation(req.params.id, { fromStatus: ord.status, toStatus: status, actorEmail: req.user.email });
    } catch (e) {
      automation = { error: e.message };
    }
    res.json({ ok: true, automation });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

router.post('/automation/run', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  res.json(await runAutomationSweep());
}));

router.get('/:id/history', wrap(async (req, res) => {
  res.json({ data: await query('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id', [req.params.id]) });
}));

const fmtVnd = (n) => new Intl.NumberFormat('vi-VN').format(Number(n || 0)) + '₫';

// Buyer/Admin GỬI BÁO GIÁ để Requester xác nhận -> đơn sang "Chờ xác nhận báo giá" + tạo tác vụ (notification).
router.post('/:id/send-quote', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const [ord] = await query(
    'SELECT id, order_code, status, requester_email, project_name, total_amount FROM orders WHERE id = ? AND deleted_at IS NULL',
    [req.params.id]
  );
  if (!ord) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  if (!ord.requester_email) return res.status(400).json({ error: 'Đơn chưa có email người yêu cầu để gửi xác nhận' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', ['pending_confirmation', ord.id]);
    await logStatus(conn, ord.id, ord.status, 'pending_confirmation', req.user.email, req.body?.note || 'Gửi báo giá chờ Requester xác nhận');
    await createNotification({
      recipient_email: ord.requester_email,
      type: 'quote_confirm',
      title: `Báo giá cần xác nhận — ${ord.order_code}`,
      body: `${ord.project_name || 'Đơn hàng'} • Tổng tạm tính ${fmtVnd(ord.total_amount)}. Vui lòng xác nhận hoặc từ chối.`,
      order_id: ord.id,
      link: `/orders/${ord.id}`,
      requires_action: true,
      created_by: req.user.email,
    }, conn);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// Requester (hoặc admin thay mặt) XÁC NHẬN / TỪ CHỐI báo giá.
router.post('/:id/quote-response', wrap(async (req, res) => {
  const { decision, note } = req.body || {};
  if (!['confirm', 'reject'].includes(decision)) return res.status(400).json({ error: 'decision phải là confirm hoặc reject' });
  const [ord] = await query('SELECT id, order_code, status, requester_email FROM orders WHERE id = ? AND deleted_at IS NULL', [req.params.id]);
  if (!ord) return res.status(404).json({ error: 'Không tìm thấy đơn' });
  const isOwner = ord.requester_email && ord.requester_email === req.user.email;
  if (!(req.user.role === 'admin' || isOwner)) return res.status(403).json({ error: 'Chỉ người yêu cầu mới được xác nhận báo giá' });
  if (ord.status !== 'pending_confirmation') return res.status(400).json({ error: 'Đơn không ở trạng thái Chờ xác nhận báo giá' });
  const newStatus = decision === 'confirm' ? 'confirmed' : 'in_progress';
  // Ai đã gửi báo giá (để báo lại kết quả) — lấy từ tác vụ đang chờ.
  const [pending] = await query(
    "SELECT created_by FROM notifications WHERE order_id = ? AND type = 'quote_confirm' AND action_status = 'pending' ORDER BY id DESC LIMIT 1",
    [ord.id]
  );
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('UPDATE orders SET status = ? WHERE id = ?', [newStatus, ord.id]);
    const label = decision === 'confirm' ? 'Xác nhận báo giá' : 'Từ chối báo giá';
    await logStatus(conn, ord.id, ord.status, newStatus, req.user.email, note ? `${label} — ${note}` : label);
    // Đóng tác vụ chờ xác nhận.
    await conn.query(
      "UPDATE notifications SET action_status = ?, action_note = ?, resolved_at = NOW(), is_read = 1, read_at = COALESCE(read_at, NOW()) WHERE order_id = ? AND type = 'quote_confirm' AND action_status = 'pending'",
      [decision === 'confirm' ? 'confirmed' : 'rejected', note || null, ord.id]
    );
    // Báo lại cho người gửi báo giá.
    if (pending?.created_by) {
      await createNotification({
        recipient_email: pending.created_by,
        type: 'quote_result',
        title: `${decision === 'confirm' ? '✅ Đã xác nhận' : '❌ Bị từ chối'} báo giá — ${ord.order_code}`,
        body: note ? `Ghi chú: ${note}` : (decision === 'confirm' ? 'Requester đã xác nhận, có thể đặt hàng.' : 'Requester từ chối, đơn quay lại Đang xử lý.'),
        order_id: ord.id,
        link: `/orders/${ord.id}`,
        created_by: req.user.email,
      }, conn);
    }
    await conn.commit();
    let automation;
    try {
      automation = await runOrderAutomation(ord.id, { fromStatus: ord.status, toStatus: newStatus, actorEmail: req.user.email });
    } catch (e) {
      automation = { error: e.message };
    }
    res.json({ ok: true, status: newStatus, automation });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

// Xóa TOÀN BỘ đơn hàng (soft delete) — chỉ admin/PM. PM chỉ xóa trong phạm vi team mình.
// Yêu cầu body { confirm: true } để tránh gọi nhầm.
router.delete('/', requireRole('admin', 'pm'), wrap(async (req, res) => {
  if (!req.body || req.body.confirm !== true) {
    return res.status(400).json({ error: 'Cần xác nhận (confirm: true) để xóa toàn bộ' });
  }
  const where = ['deleted_at IS NULL'];
  const params = [];
  const sc = scopeClause(req.user, 'orders');
  if (sc) { where.push(sc.sql); params.push(...sc.params); }
  const r = await query(
    `UPDATE orders SET deleted_at = NOW(), deleted_by = ? WHERE ${where.join(' AND ')}`,
    [req.user.email, ...params]
  );
  res.json({ ok: true, deleted: r.affectedRows });
}));

// Xóa 1 đơn hàng (soft delete) — có thể khôi phục.
router.delete('/:id', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const r = await query(
    'UPDATE orders SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL',
    [req.user.email, req.params.id]
  );
  res.json({ ok: true, deleted: r.affectedRows });
}));

// Khôi phục đơn hàng đã xóa mềm — admin/PM.
router.post('/:id/restore', requireRole('admin', 'pm'), wrap(async (req, res) => {
  await query('UPDATE orders SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// --- Line items (buyer nhập giá/NCC/BG…) ---
router.post('/:id/items', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const it = pick(req.body, ITEM_FIELDS);
  if (!String(it.item_name || '').trim()) return res.status(400).json({ error: 'Tên hàng là bắt buộc' });
  Object.assign(it, computeLine(it));
  const ic = Object.keys(it);
  const r = await query(
    `INSERT INTO order_items (order_id, ${ic.map((c) => `\`${c}\``).join(',')}) VALUES (?, ${ic.map(() => '?').join(',')})`,
    [req.params.id, ...ic.map((c) => it[c])]
  );
  await recalcTotal(req.params.id);
  res.status(201).json({ id: r.insertId, sync: await syncOrderStatusFromItems(req.params.id, req.user.email) });
}));

router.put('/items/:itemId', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const it = pick(req.body, ITEM_FIELDS);
  Object.assign(it, computeLine({ ...(await getItem(req.params.itemId)), ...it }));
  if (Object.keys(it).length) {
    const clause = Object.keys(it).map((k) => `\`${k}\` = ?`).join(', ');
    await query(`UPDATE order_items SET ${clause} WHERE id = ?`, [...Object.values(it), req.params.itemId]);
  }
  const row = await getItem(req.params.itemId);
  if (row) await recalcTotal(row.order_id);
  res.json({ ok: true, sync: row ? await syncOrderStatusFromItems(row.order_id, req.user.email) : null });
}));

router.delete('/items/:itemId', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const row = await getItem(req.params.itemId);
  await query('DELETE FROM order_items WHERE id = ?', [req.params.itemId]);
  if (row) await recalcTotal(row.order_id);
  res.json({ ok: true, sync: row ? await syncOrderStatusFromItems(row.order_id, req.user.email) : null });
}));

// Cập nhật tiến trình theo TỪNG dòng hàng.
router.patch('/items/:itemId/progress', requireRole('admin', 'purchasing', 'warehouse'), wrap(async (req, res) => {
  const progress = normalizeLineStatus(req.body.progress);
  const row = await getItem(req.params.itemId);
  if (!row) return res.status(404).json({ error: 'Không tìm thấy dòng hàng' });
  await query('UPDATE order_items SET progress = ? WHERE id = ?', [progress, req.params.itemId]);
  res.json({ ok: true, sync: await syncOrderStatusFromItems(row.order_id, req.user.email) });
}));

router.patch('/items/progress/bulk', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const itemIds = [...new Set((Array.isArray(req.body.item_ids) ? req.body.item_ids : []).map(Number).filter(Number.isFinite))].slice(0, 200);
  const progress = normalizeLineStatus(req.body.progress);
  if (!itemIds.length || !LINE_STATUS_CODES.includes(progress)) return res.status(400).json({ error: 'Chọn dòng hàng và trạng thái hợp lệ' });
  const marks = itemIds.map(() => '?').join(',');
  const rows = await query(`SELECT id, order_id FROM order_items WHERE id IN (${marks})`, itemIds);
  await query(`UPDATE order_items SET progress = ? WHERE id IN (${marks})`, [progress, ...itemIds]);
  for (const orderId of [...new Set(rows.map((r) => r.order_id))]) await syncOrderStatusFromItems(orderId, req.user.email);
  res.json({ ok: true, updated: rows.length });
}));

// Đẩy dòng hàng sang Danh mục SP (sinh MA_HANG) -> chờ nhập kho.
router.post('/items/:itemId/to-catalog', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const it = await getItem(req.params.itemId);
  if (!it) return res.status(404).json({ error: 'Không tìm thấy dòng hàng' });
  let code = it.item_code;
  if (!code) {
    const [o] = await query('SELECT team_id FROM orders WHERE id = ?', [it.order_id]);
    code = await nextItemCode(await teamCodeOf(o?.team_id), it.item_name, it.loai_hh);
  }
  // upsert vào products
  await query(
    `INSERT INTO products (sku, name, unit, default_price, vat_rate, supplier_id, image_url)
     VALUES (?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), default_price=VALUES(default_price), vat_rate=VALUES(vat_rate)`,
    [code, it.item_name, it.unit, it.unit_price, it.vat_rate, it.supplier_id || null, it.image_url || null]
  );
  await query('UPDATE order_items SET item_code = ?, in_catalog = 1, nhap_kho = ?, progress = ? WHERE id = ?',
    [code, 'Chờ nhập kho', 'Chờ nhập kho', req.params.itemId]);
  res.json({ ok: true, item_code: code, sync: await syncOrderStatusFromItems(it.order_id, req.user.email) });
}));

// Bàn giao trực tiếp cho Requester (không nhập kho).
router.post('/items/:itemId/handover', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const it = await getItem(req.params.itemId);
  if (!it) return res.status(404).json({ error: 'Không tìm thấy dòng hàng' });
  await query('UPDATE order_items SET progress = ?, nhap_kho = ? WHERE id = ?', ['da_giao', 'Đã bàn giao', req.params.itemId]);
  res.json({ ok: true, sync: await syncOrderStatusFromItems(it.order_id, req.user.email) });
}));

async function getItem(id) { const [r] = await query('SELECT * FROM order_items WHERE id = ?', [id]); return r; }
async function recalcTotal(orderId) {
  const [lines] = await query('SELECT COALESCE(SUM(line_total),0) AS total FROM order_items WHERE order_id = ?', [orderId]);
  const discounts = await query(`SELECT os.discount_amount, COALESCE((SELECT SUM(i.line_total) FROM order_items i WHERE i.order_id=os.order_id AND i.supplier_id=os.supplier_id),0) AS subtotal FROM order_suppliers os WHERE os.order_id = ?`, [orderId]);
  const discount = discounts.reduce((sum, r) => sum + Math.min(Number(r.discount_amount || 0), Number(r.subtotal || 0)), 0);
  await query('UPDATE orders SET total_amount = ? WHERE id = ?', [Math.max(0, Number(lines.total || 0) - discount), orderId]);
}

export default router;
