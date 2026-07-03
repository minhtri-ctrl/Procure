import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick, toSet } from '../util.js';

// Factory tạo CRUD router chuẩn cho 1 bảng master data đơn giản.
// opts: { table, fields, searchCols, writeRoles }
export function crudRouter({ table, fields, searchCols = [], writeRoles = ['admin', 'purchasing'] }) {
  const router = Router();
  router.use(authRequired);

  // LIST (có tìm kiếm + phân trang)
  router.get('/', wrap(async (req, res) => {
    const { q, page = 1, limit = 50 } = req.query;
    const lim = Math.min(Number(limit) || 50, 200);
    const off = (Math.max(Number(page) || 1, 1) - 1) * lim;
    const where = [];
    const params = [];
    if (q && searchCols.length) {
      where.push('(' + searchCols.map((c) => `\`${c}\` LIKE ?`).join(' OR ') + ')');
      searchCols.forEach(() => params.push(`%${q}%`));
    }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const rows = await query(`SELECT * FROM \`${table}\` ${whereSql} ORDER BY id DESC LIMIT ? OFFSET ?`, [...params, lim, off]);
    const [{ total }] = await query(`SELECT COUNT(*) AS total FROM \`${table}\` ${whereSql}`, params);
    res.json({ data: rows, total, page: Number(page), limit: lim });
  }));

  // GET one
  router.get('/:id', wrap(async (req, res) => {
    const rows = await query(`SELECT * FROM \`${table}\` WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(rows[0]);
  }));

  // CREATE
  router.post('/', requireRole(...writeRoles), wrap(async (req, res) => {
    const data = pick(req.body, fields);
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Không có dữ liệu' });
    const { keys, values } = toSet(data);
    const cols = keys.map((k) => `\`${k}\``).join(', ');
    const ph = keys.map(() => '?').join(', ');
    const r = await query(`INSERT INTO \`${table}\` (${cols}) VALUES (${ph})`, values);
    const rows = await query(`SELECT * FROM \`${table}\` WHERE id = ?`, [r.insertId]);
    res.status(201).json(rows[0]);
  }));

  // UPDATE
  router.put('/:id', requireRole(...writeRoles), wrap(async (req, res) => {
    const data = pick(req.body, fields);
    if (!Object.keys(data).length) return res.status(400).json({ error: 'Không có dữ liệu' });
    const { clause, values } = toSet(data);
    await query(`UPDATE \`${table}\` SET ${clause} WHERE id = ?`, [...values, req.params.id]);
    const rows = await query(`SELECT * FROM \`${table}\` WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json(rows[0]);
  }));

  // DELETE
  router.delete('/:id', requireRole(...writeRoles), wrap(async (req, res) => {
    await query(`DELETE FROM \`${table}\` WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  }));

  return router;
}
