import { Router } from 'express';
import XLSX from 'xlsx';
import { query, pool } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';
import { nextOrderCode, nextItemCode } from '../lib/codes.js';

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
  'pm', 'status', 'status_raw', 'hang_muc', 'qdnb_tbkm', 'request_date', 'expected_date', 'actual_date', 'handover_date',
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
  const { q, status, team_id, supplier_id, page = 1, limit = 50 } = req.query;
  const lim = Math.min(Number(limit) || 50, 200);
  const off = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const where = [];
  const params = [];
  const sc = scopeClause(req.user);
  if (sc) { where.push(sc.sql); params.push(...sc.params); }
  if (q) { where.push('(o.order_code LIKE ? OR o.project_name LIKE ? OR o.requester_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (team_id) { where.push('o.team_id = ?'); params.push(team_id); }
  if (supplier_id) { where.push('o.supplier_id = ?'); params.push(supplier_id); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(
    `SELECT o.*, t.name AS team_name, s.name AS supplier_name, w.name AS status_name, w.color AS status_color,
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
  const where = [];
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
  res.json({ ...rows[0], custom_fields: custom, items, history });
}));

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
    res.json({ ok: true });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

router.get('/:id/history', wrap(async (req, res) => {
  res.json({ data: await query('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id', [req.params.id]) });
}));

router.delete('/:id', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  await query('DELETE FROM orders WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// --- Line items (buyer nhập giá/NCC/BG…) ---
router.post('/:id/items', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const it = pick(req.body, ITEM_FIELDS);
  Object.assign(it, computeLine(it));
  const ic = Object.keys(it);
  const r = await query(
    `INSERT INTO order_items (order_id, ${ic.map((c) => `\`${c}\``).join(',')}) VALUES (?, ${ic.map(() => '?').join(',')})`,
    [req.params.id, ...ic.map((c) => it[c])]
  );
  await recalcTotal(req.params.id);
  res.status(201).json({ id: r.insertId });
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
  res.json({ ok: true });
}));

router.delete('/items/:itemId', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const row = await getItem(req.params.itemId);
  await query('DELETE FROM order_items WHERE id = ?', [req.params.itemId]);
  if (row) await recalcTotal(row.order_id);
  res.json({ ok: true });
}));

// Cập nhật tiến trình theo TỪNG dòng hàng.
router.patch('/items/:itemId/progress', requireRole('admin', 'purchasing', 'warehouse'), wrap(async (req, res) => {
  await query('UPDATE order_items SET progress = ? WHERE id = ?', [req.body.progress || '', req.params.itemId]);
  res.json({ ok: true });
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
  res.json({ ok: true, item_code: code });
}));

// Bàn giao trực tiếp cho Requester (không nhập kho).
router.post('/items/:itemId/handover', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  await query('UPDATE order_items SET progress = ?, nhap_kho = ? WHERE id = ?', ['Đã bàn giao', 'Đã bàn giao', req.params.itemId]);
  res.json({ ok: true });
}));

async function getItem(id) { const [r] = await query('SELECT * FROM order_items WHERE id = ?', [id]); return r; }
async function recalcTotal(orderId) {
  await query('UPDATE orders SET total_amount = (SELECT COALESCE(SUM(line_total),0) FROM order_items WHERE order_id = ?) WHERE id = ?', [orderId, orderId]);
}

export default router;
