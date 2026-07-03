import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

router.get('/', wrap(async (req, res) => {
  const rows = await query(
    `SELECT u.id, u.email, u.full_name, u.role, u.team_id, u.is_active, u.last_login_at, t.name AS team_name
     FROM users u LEFT JOIN teams t ON t.id=u.team_id ORDER BY u.id DESC`);
  res.json({ data: rows });
}));

router.post('/', wrap(async (req, res) => {
  const { email, full_name, password, role, team_id } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });
  const hash = await bcrypt.hash(password, 10);
  const r = await query(
    'INSERT INTO users (email, full_name, password_hash, role, team_id) VALUES (?,?,?,?,?)',
    [email.toLowerCase().trim(), full_name || '', hash, role || 'requester', team_id || null]
  );
  res.status(201).json({ id: r.insertId });
}));

router.put('/:id', wrap(async (req, res) => {
  const data = pick(req.body, ['email', 'full_name', 'role', 'team_id', 'is_active']);
  if (Object.keys(data).length) {
    const clause = Object.keys(data).map((k) => `\`${k}\` = ?`).join(', ');
    await query(`UPDATE users SET ${clause} WHERE id = ?`, [...Object.values(data), req.params.id]);
  }
  if (req.body.password) {
    const hash = await bcrypt.hash(req.body.password, 10);
    await query('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
  }
  res.json({ ok: true });
}));

router.delete('/:id', wrap(async (req, res) => {
  if (Number(req.params.id) === req.user.id) return res.status(400).json({ error: 'Không thể xoá chính mình' });
  await query('DELETE FROM users WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

export default router;
