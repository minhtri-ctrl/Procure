import { Router } from 'express';
import { query, pool } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';
import { nextOrderCode, nextItemCode } from '../lib/codes.js';

const router = Router();
router.use(authRequired);

const HEADER_FIELDS = [
  'order_code', 'requester_email', 'requester_name', 'team_id', 'supplier_id', 'project_name',
  'pm', 'status', 'status_raw', 'hang_muc', 'request_date', 'expected_date', 'actual_date', 'handover_date',
  'receiving_point', 'pr_no', 'contract_no', 'payment_method', 'payment_term', 'warehouse_status', 'note',
];
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
  // Requester chỉ thấy đơn của mình.
  if (req.user.role === 'requester') { where.push('o.requester_email = ?'); params.push(req.user.email); }
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
  res.json({ ...rows[0], items, history });
}));

// CREATE order + items (transaction) — sinh MA_DH & MA_HANG chuẩn.
router.post('/', wrap(async (req, res) => {
  const header = pick(req.body, HEADER_FIELDS);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  header.requester_email = header.requester_email || req.user.email;
  header.requester_name = header.requester_name || req.user.name;
  header.status = header.status || 'new';
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
      if (!it.item_code) it.item_code = await nextItemCode(teamCode, it.loai_hh);
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
  const header = pick(req.body, HEADER_FIELDS.filter((f) => f !== 'status')); // status đổi qua endpoint riêng
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
  const [o] = await query('SELECT team_id FROM orders WHERE id = ?', [req.params.id]);
  if (!it.item_code) it.item_code = await nextItemCode(await teamCodeOf(o?.team_id), it.loai_hh);
  Object.assign(it, computeLine(it));
  const ic = Object.keys(it);
  const r = await query(
    `INSERT INTO order_items (order_id, ${ic.map((c) => `\`${c}\``).join(',')}) VALUES (?, ${ic.map(() => '?').join(',')})`,
    [req.params.id, ...ic.map((c) => it[c])]
  );
  await recalcTotal(req.params.id);
  res.status(201).json({ id: r.insertId, item_code: it.item_code });
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

async function getItem(id) { const [r] = await query('SELECT * FROM order_items WHERE id = ?', [id]); return r; }
async function recalcTotal(orderId) {
  await query('UPDATE orders SET total_amount = (SELECT COALESCE(SUM(line_total),0) FROM order_items WHERE order_id = ?) WHERE id = ?', [orderId, orderId]);
}

export default router;
