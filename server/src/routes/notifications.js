import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { wrap } from '../util.js';

const router = Router();
router.use(authRequired);

// Danh sách thông báo của chính mình (mới nhất trước).
router.get('/', wrap(async (req, res) => {
  const lim = Math.min(Number(req.query.limit) || 30, 100);
  const where = ['recipient_email = ?'];
  const params = [req.user.email];
  if (req.query.unread === '1') where.push('is_read = 0');
  const rows = await query(
    `SELECT * FROM notifications WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`,
    [...params, lim]
  );
  const [{ unread }] = await query(
    'SELECT COUNT(*) AS unread FROM notifications WHERE recipient_email = ? AND is_read = 0',
    [req.user.email]
  );
  res.json({ data: rows, unread });
}));

// Số thông báo chưa đọc (cho badge chuông).
router.get('/unread-count', wrap(async (req, res) => {
  const [{ unread }] = await query(
    'SELECT COUNT(*) AS unread FROM notifications WHERE recipient_email = ? AND is_read = 0',
    [req.user.email]
  );
  res.json({ unread });
}));

// Đánh dấu đã đọc 1 thông báo (chỉ của mình).
router.post('/:id/read', wrap(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND recipient_email = ?',
    [req.params.id, req.user.email]);
  res.json({ ok: true });
}));

// Đánh dấu đã đọc tất cả.
router.post('/read-all', wrap(async (req, res) => {
  await query('UPDATE notifications SET is_read = 1, read_at = NOW() WHERE recipient_email = ? AND is_read = 0',
    [req.user.email]);
  res.json({ ok: true });
}));

export default router;
