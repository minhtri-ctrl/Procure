import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { signToken, authRequired } from '../middleware/auth.js';
import { wrap } from '../util.js';
import { config } from '../config.js';

const router = Router();

router.post('/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });
  const em = email.toLowerCase().trim();
  if (!em.endsWith('@' + config.allowedDomain)) return res.status(403).json({ error: `Chỉ chấp nhận email @${config.allowedDomain}` });
  const rows = await query('SELECT * FROM users WHERE email = ? AND is_active = 1', [em]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: 'Sai email hoặc mật khẩu' });
  }
  await query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
  const token = signToken(user);
  res.json({ token, user: { id: user.id, email: user.email, name: user.full_name, role: user.role } });
}));

// Đăng ký giới hạn theo domain — mặc định tạo role requester.
router.post('/register', wrap(async (req, res) => {
  const { email, password, full_name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });
  const em = email.toLowerCase().trim();
  if (!em.endsWith('@' + config.allowedDomain)) {
    return res.status(400).json({ error: `Chỉ chấp nhận email @${config.allowedDomain}` });
  }
  const exists = await query('SELECT id FROM users WHERE email = ?', [em]);
  if (exists.length) return res.status(409).json({ error: 'Email đã tồn tại' });
  const hash = await bcrypt.hash(password, 10);
  const r = await query(
    'INSERT INTO users (email, full_name, password_hash, role) VALUES (?,?,?,?)',
    [em, full_name || '', hash, 'requester']
  );
  const user = { id: r.insertId, email: em, full_name: full_name || '', role: 'requester' };
  res.status(201).json({ token: signToken(user), user: { id: user.id, email: em, name: user.full_name, role: user.role } });
}));

router.get('/me', authRequired, wrap(async (req, res) => {
  const rows = await query('SELECT id, email, full_name AS name, role, team_id FROM users WHERE id = ?', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy user' });
  res.json(rows[0]);
}));

export default router;
