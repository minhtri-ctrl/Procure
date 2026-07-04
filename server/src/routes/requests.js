import { Router } from 'express';
import { query, pool } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';
import { nextOrderCode } from '../lib/codes.js';

const router = Router();
router.use(authRequired);

// Giới hạn theo vai trò: requester -> YC của mình; pm -> team của mình.
function scopeClause(user, alias = 'r') {
  if (user.role === 'requester') return { sql: `${alias}.requester_email = ?`, params: [user.email] };
  if (user.role === 'pm') return { sql: `${alias}.team_id = ?`, params: [user.team_id || 0] };
  return null;
}

const HEADER_FIELDS = [
  'request_code', 'requester_name', 'requester_email', 'team_id', 'project_name',
  'request_date', 'expected_date', 'receiving_point', 'design_link', 'status',
  'confirmed_date', 'purchasing_note', 'note', 'hang_muc', 'pm',
];
const ITEM_FIELDS = ['line_no', 'item_name', 'loai_hh', 'unit', 'description', 'quantity', 'budget', 'suggested_supplier', 'note'];

// Sinh mã YC dạng TEAM-YYMM-NNNN
async function genRequestCode(teamId) {
  let prefix = 'YC';
  if (teamId) {
    const [t] = await query('SELECT code FROM teams WHERE id = ?', [teamId]);
    if (t?.code) prefix = t.code;
  }
  const d = new Date();
  const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const like = `${prefix}-${ym}-%`;
  const [{ n }] = await query('SELECT COUNT(*) AS n FROM purchase_requests WHERE request_code LIKE ?', [like]);
  return `${prefix}-${ym}-${String(n + 1).padStart(4, '0')}`;
}

router.get('/', wrap(async (req, res) => {
  const { q, status, team_id, page = 1, limit = 50 } = req.query;
  const lim = Math.min(Number(limit) || 50, 200);
  const off = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const where = ['r.deleted_at IS NULL'];
  const params = [];
  const sc = scopeClause(req.user);
  if (sc) { where.push(sc.sql); params.push(...sc.params); }
  if (q) { where.push('(r.request_code LIKE ? OR r.project_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (status) { where.push('r.status = ?'); params.push(status); }
  if (team_id) { where.push('r.team_id = ?'); params.push(team_id); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(
    `SELECT r.*, t.name AS team_name,
            (SELECT COUNT(*) FROM request_items i WHERE i.request_id=r.id) AS item_count
     FROM purchase_requests r LEFT JOIN teams t ON t.id=r.team_id
     ${whereSql} ORDER BY r.id DESC LIMIT ? OFFSET ?`,
    [...params, lim, off]
  );
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM purchase_requests r ${whereSql}`, params);
  res.json({ data: rows, total, page: Number(page), limit: lim });
}));

// Đếm số YC hiện có (trong phạm vi user) — cho hộp thoại xác nhận "xóa toàn bộ".
router.get('/count', wrap(async (req, res) => {
  const where = ['r.deleted_at IS NULL'];
  const params = [];
  const sc = scopeClause(req.user);
  if (sc) { where.push(sc.sql); params.push(...sc.params); }
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM purchase_requests r WHERE ${where.join(' AND ')}`, params);
  res.json({ total });
}));

router.get('/:id', wrap(async (req, res) => {
  const rows = await query(
    `SELECT r.*, t.name AS team_name FROM purchase_requests r LEFT JOIN teams t ON t.id=r.team_id WHERE r.id = ?`,
    [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
  const items = await query('SELECT * FROM request_items WHERE request_id = ? ORDER BY line_no, id', [req.params.id]);
  res.json({ ...rows[0], items });
}));

// CREATE — mọi user đăng nhập đều tạo được YC
router.post('/', wrap(async (req, res) => {
  const header = pick(req.body, HEADER_FIELDS);
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  header.requester_email = header.requester_email || req.user.email;
  header.requester_name = header.requester_name || req.user.name;
  if (!header.request_code) {
    const [t] = header.team_id ? await query('SELECT code FROM teams WHERE id = ?', [header.team_id]) : [null];
    header.request_code = await nextOrderCode(t?.code || '');
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const cols = Object.keys(header);
    await conn.query(
      `INSERT INTO purchase_requests (${cols.map((c) => `\`${c}\``).join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      cols.map((c) => header[c])
    );
    const [[{ id }]] = await conn.query('SELECT LAST_INSERT_ID() AS id');
    let ln = 1;
    for (const raw of items) {
      const it = pick(raw, ITEM_FIELDS);
      if (!it.line_no) it.line_no = ln++;
      const ic = Object.keys(it);
      await conn.query(
        `INSERT INTO request_items (request_id, ${ic.map((c) => `\`${c}\``).join(',')}) VALUES (?, ${ic.map(() => '?').join(',')})`,
        [id, ...ic.map((c) => it[c])]
      );
    }
    await conn.commit();
    res.status(201).json({ id, request_code: header.request_code });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

router.put('/:id', wrap(async (req, res) => {
  const header = pick(req.body, HEADER_FIELDS);
  if (Object.keys(header).length) {
    const clause = Object.keys(header).map((k) => `\`${k}\` = ?`).join(', ');
    await query(`UPDATE purchase_requests SET ${clause} WHERE id = ?`, [...Object.values(header), req.params.id]);
  }
  res.json({ ok: true });
}));

router.patch('/:id/status', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const { status } = req.body || {};
  const extra = status === 'confirmed' ? ', confirmed_date = CURDATE()' : '';
  await query(`UPDATE purchase_requests SET status = ?${extra} WHERE id = ?`, [status, req.params.id]);
  res.json({ ok: true });
}));

// Chuyển yêu cầu -> đơn hàng
router.post('/:id/convert', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const [r] = await query('SELECT * FROM purchase_requests WHERE id = ?', [req.params.id]);
  if (!r) return res.status(404).json({ error: 'Không tìm thấy yêu cầu' });
  const items = await query('SELECT * FROM request_items WHERE request_id = ?', [req.params.id]);
  // Giữ NGUYÊN mã yêu cầu làm mã đơn (thống nhất 1 mã, không sinh số mới).
  const existed = await query('SELECT id FROM orders WHERE order_code = ?', [r.request_code]);
  const orderCode = existed.length ? r.request_code + '-D' : r.request_code;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO orders (order_code, requester_email, requester_name, team_id, project_name, request_date, expected_date, receiving_point, hang_muc, pm, status, note)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'new', ?)`,
      [orderCode, r.requester_email, r.requester_name, r.team_id, r.project_name, r.request_date, r.expected_date, r.receiving_point, r.hang_muc, r.pm, r.note]
    );
    const [[{ id: orderId }]] = await conn.query('SELECT LAST_INSERT_ID() AS id');
    let total = 0;
    for (const it of items) {
      const price = Number(it.budget && it.quantity ? it.budget / it.quantity : 0);
      const lineTotal = Math.round(price * Number(it.quantity || 0));
      total += lineTotal;
      await conn.query(
        `INSERT INTO order_items (order_id, item_name, loai_hh, description, unit, quantity, unit_price, line_total)
         VALUES (?,?,?,?,?,?,?,?)`,
        [orderId, it.item_name, it.loai_hh, it.description, it.unit, it.quantity, price, lineTotal]
      );
    }
    await conn.query('UPDATE orders SET total_amount = ? WHERE id = ?', [total, orderId]);
    await conn.query('UPDATE purchase_requests SET status = ?, order_id = ? WHERE id = ?', ['completed', orderId, req.params.id]);
    await conn.commit();
    res.status(201).json({ order_id: orderId, order_code: orderCode });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// Xóa TOÀN BỘ yêu cầu mua (soft delete) — chỉ admin/PM. PM chỉ xóa trong team mình.
router.delete('/', requireRole('admin', 'pm'), wrap(async (req, res) => {
  if (!req.body || req.body.confirm !== true) {
    return res.status(400).json({ error: 'Cần xác nhận (confirm: true) để xóa toàn bộ' });
  }
  const where = ['deleted_at IS NULL'];
  const params = [];
  const sc = scopeClause(req.user, 'purchase_requests');
  if (sc) { where.push(sc.sql); params.push(...sc.params); }
  const r = await query(
    `UPDATE purchase_requests SET deleted_at = NOW(), deleted_by = ? WHERE ${where.join(' AND ')}`,
    [req.user.email, ...params]
  );
  res.json({ ok: true, deleted: r.affectedRows });
}));

// Xóa 1 YC (soft delete).
router.delete('/:id', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const r = await query(
    'UPDATE purchase_requests SET deleted_at = NOW(), deleted_by = ? WHERE id = ? AND deleted_at IS NULL',
    [req.user.email, req.params.id]
  );
  res.json({ ok: true, deleted: r.affectedRows });
}));

// Khôi phục YC đã xóa mềm — admin/PM.
router.post('/:id/restore', requireRole('admin', 'pm'), wrap(async (req, res) => {
  await query('UPDATE purchase_requests SET deleted_at = NULL, deleted_by = NULL WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

export default router;
