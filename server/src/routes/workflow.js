import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';

const router = Router();
router.use(authRequired);

const FIELDS = ['code', 'name', 'color', 'sort_order', 'actor', 'is_terminal', 'is_active'];

// Danh sách tiến trình (mọi user đọc để hiển thị dropdown/badge).
router.get('/', wrap(async (req, res) => {
  const rows = await query('SELECT * FROM workflow_states WHERE is_active = 1 ORDER BY sort_order, id');
  res.json({ data: rows });
}));

// Toàn bộ (kể cả ẩn) — cho admin quản lý.
router.get('/all', requireRole('admin'), wrap(async (req, res) => {
  res.json({ data: await query('SELECT * FROM workflow_states ORDER BY sort_order, id') });
}));

router.post('/', requireRole('admin'), wrap(async (req, res) => {
  const data = pick(req.body, FIELDS);
  if (!data.code || !data.name) return res.status(400).json({ error: 'Thiếu code hoặc tên' });
  const keys = Object.keys(data);
  const r = await query(`INSERT INTO workflow_states (${keys.map((k) => `\`${k}\``).join(',')}) VALUES (${keys.map(() => '?').join(',')})`, keys.map((k) => data[k]));
  res.status(201).json({ id: r.insertId });
}));

router.put('/:id', requireRole('admin'), wrap(async (req, res) => {
  const data = pick(req.body, FIELDS);
  if (Object.keys(data).length) {
    const clause = Object.keys(data).map((k) => `\`${k}\` = ?`).join(', ');
    await query(`UPDATE workflow_states SET ${clause} WHERE id = ?`, [...Object.values(data), req.params.id]);
  }
  res.json({ ok: true });
}));

router.delete('/:id', requireRole('admin'), wrap(async (req, res) => {
  await query('DELETE FROM workflow_states WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

export default router;
