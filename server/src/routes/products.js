import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';

const router = Router();
router.use(authRequired);

const FIELDS = ['sku', 'name', 'category_id', 'unit', 'description', 'default_price', 'vat_rate', 'image_url', 'drive_file_id', 'supplier_id', 'is_active'];

// Catalog list — join category + supplier
router.get('/', wrap(async (req, res) => {
  const { q, category_id, supplier_id, page = 1, limit = 50 } = req.query;
  const lim = Math.min(Number(limit) || 50, 200);
  const off = (Math.max(Number(page) || 1, 1) - 1) * lim;
  const where = [];
  const params = [];
  if (q) { where.push('(p.sku LIKE ? OR p.name LIKE ? OR p.description LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (category_id) { where.push('p.category_id = ?'); params.push(category_id); }
  if (supplier_id) { where.push('p.supplier_id = ?'); params.push(supplier_id); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(
    `SELECT p.*, c.name AS category_name, s.name AS supplier_name
     FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN suppliers s ON s.id=p.supplier_id
     ${whereSql} ORDER BY p.id DESC LIMIT ? OFFSET ?`,
    [...params, lim, off]
  );
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM products p ${whereSql}`, params);
  res.json({ data: rows, total, page: Number(page), limit: lim });
}));

router.get('/:id', wrap(async (req, res) => {
  const rows = await query(
    `SELECT p.*, c.name AS category_name, s.name AS supplier_name
     FROM products p LEFT JOIN categories c ON c.id=p.category_id LEFT JOIN suppliers s ON s.id=p.supplier_id
     WHERE p.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy sản phẩm' });
  res.json(rows[0]);
}));

router.post('/', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const data = pick(req.body, FIELDS);
  if (!data.sku || !data.name) return res.status(400).json({ error: 'Thiếu SKU hoặc tên' });
  const keys = Object.keys(data);
  const r = await query(
    `INSERT INTO products (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`,
    keys.map((k) => data[k])
  );
  res.status(201).json({ id: r.insertId });
}));

router.put('/:id', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const data = pick(req.body, FIELDS);
  if (Object.keys(data).length) {
    const clause = Object.keys(data).map((k) => `\`${k}\` = ?`).join(', ');
    await query(`UPDATE products SET ${clause} WHERE id = ?`, [...Object.values(data), req.params.id]);
  }
  res.json({ ok: true });
}));

router.delete('/:id', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  await query('DELETE FROM products WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

export default router;
