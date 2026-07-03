import { Router } from 'express';
import { query, pool } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';

const router = Router();
router.use(authRequired);

const HEADER_FIELDS = [
  'order_code', 'requester_email', 'requester_name', 'team_id', 'supplier_id', 'project_name',
  'pm', 'status', 'status_raw', 'request_date', 'expected_date', 'actual_date', 'handover_date',
  'receiving_point', 'pr_no', 'contract_no', 'payment_method', 'payment_term', 'warehouse_status', 'note',
];
const ITEM_FIELDS = [
  'product_id', 'category_id', 'item_name', 'item_code', 'description', 'unit', 'quantity',
  'unit_price', 'vat_rate', 'discount_rate', 'image_url', 'quotation_url', 'reason_choose', 'progress', 'note',
];

function lineTotal(it) {
  const qty = Number(it.quantity || 0);
  const price = Number(it.unit_price || 0);
  const vat = Number(it.vat_rate || 0);
  const disc = Number(it.discount_rate || 0);
  return Math.round(qty * price * (1 - disc) * (1 + vat));
}

// LIST orders với join team/supplier + số dòng
router.get('/', wrap(async (req, res) => {
  const { q, status, team_id, supplier_id, page = 1, limit = 50 } = req.query;
  const lim = Math.min(Number(limit) || 50, 200);
  const off = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const where = [];
  const params = [];
  if (q) { where.push('(o.order_code LIKE ? OR o.project_name LIKE ? OR o.requester_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (status) { where.push('o.status = ?'); params.push(status); }
  if (team_id) { where.push('o.team_id = ?'); params.push(team_id); }
  if (supplier_id) { where.push('o.supplier_id = ?'); params.push(supplier_id); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(
    `SELECT o.*, t.name AS team_name, s.name AS supplier_name,
            (SELECT COUNT(*) FROM order_items i WHERE i.order_id = o.id) AS item_count
     FROM orders o
     LEFT JOIN teams t ON t.id = o.team_id
     LEFT JOIN suppliers s ON s.id = o.supplier_id
     ${whereSql} ORDER BY o.id DESC LIMIT ? OFFSET ?`,
    [...params, lim, off]
  );
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM orders o ${whereSql}`, params);
  res.json({ data: rows, total, page: Number(page), limit: lim });
}));

// GET one + items
router.get('/:id', wrap(async (req, res) => {
  const rows = await query(
    `SELECT o.*, t.name AS team_name, s.name AS supplier_name
     FROM orders o LEFT JOIN teams t ON t.id=o.team_id LEFT JOIN suppliers s ON s.id=o.supplier_id
     WHERE o.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy đơn hàng' });
  const items = await query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [req.params.id]);
  res.json({ ...rows[0], items });
}));

// CREATE order + items (transaction)
router.post('/', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const header = pick(req.body, HEADER_FIELDS);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (!header.order_code) return res.status(400).json({ error: 'Thiếu mã đơn hàng (order_code)' });
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
      it.line_total = lineTotal(it);
      total += it.line_total;
      const ic = Object.keys(it);
      await conn.query(
        `INSERT INTO order_items (order_id, ${ic.map((c) => `\`${c}\``).join(',')}) VALUES (?, ${ic.map(() => '?').join(',')})`,
        [orderId, ...ic.map((c) => it[c])]
      );
    }
    await conn.query('UPDATE orders SET total_amount = ? WHERE id = ?', [total, orderId]);
    await conn.commit();
    res.status(201).json({ id: orderId });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// UPDATE header
router.put('/:id', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const header = pick(req.body, HEADER_FIELDS);
  if (Object.keys(header).length) {
    const clause = Object.keys(header).map((k) => `\`${k}\` = ?`).join(', ');
    await query(`UPDATE orders SET ${clause} WHERE id = ?`, [...Object.values(header), req.params.id]);
  }
  res.json({ ok: true });
}));

// Cập nhật nhanh trạng thái
router.patch('/:id/status', requireRole('admin', 'purchasing', 'warehouse'), wrap(async (req, res) => {
  const { status } = req.body || {};
  await query('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id]);
  res.json({ ok: true });
}));

router.delete('/:id', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  await query('DELETE FROM orders WHERE id = ?', [req.params.id]); // items cascade
  res.json({ ok: true });
}));

// --- Line items ---
router.post('/:id/items', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const it = pick(req.body, ITEM_FIELDS);
  it.line_total = lineTotal(it);
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
  if (it.quantity !== undefined || it.unit_price !== undefined || it.vat_rate !== undefined) it.line_total = lineTotal(it);
  if (Object.keys(it).length) {
    const clause = Object.keys(it).map((k) => `\`${k}\` = ?`).join(', ');
    await query(`UPDATE order_items SET ${clause} WHERE id = ?`, [...Object.values(it), req.params.itemId]);
  }
  const [row] = await query('SELECT order_id FROM order_items WHERE id = ?', [req.params.itemId]);
  if (row) await recalcTotal(row.order_id);
  res.json({ ok: true });
}));

router.delete('/items/:itemId', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const [row] = await query('SELECT order_id FROM order_items WHERE id = ?', [req.params.itemId]);
  await query('DELETE FROM order_items WHERE id = ?', [req.params.itemId]);
  if (row) await recalcTotal(row.order_id);
  res.json({ ok: true });
}));

async function recalcTotal(orderId) {
  await query(
    'UPDATE orders SET total_amount = (SELECT COALESCE(SUM(line_total),0) FROM order_items WHERE order_id = ?) WHERE id = ?',
    [orderId, orderId]
  );
}

export default router;
