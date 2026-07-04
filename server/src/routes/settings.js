import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';

const router = Router();

// Theme (màu giao diện) — GET công khai (authed) để mọi trang áp dụng; PUT chỉ admin.
router.get('/theme', authRequired, wrap(async (req, res) => {
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', ['ui_theme']);
  let theme = {};
  try { theme = rows.length ? JSON.parse(rows[0].value) : {}; } catch { theme = {}; }
  res.json(theme);
}));

router.put('/theme', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const theme = req.body || {};
  await query(
    'INSERT INTO settings (`key`, value, description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    ['ui_theme', JSON.stringify(theme), 'Cấu hình màu giao diện']
  );
  res.json({ ok: true });
}));

// Thông tin công ty (Bên A) — điền tự động vào hợp đồng .docx. GET công khai (authed), PUT chỉ admin.
router.get('/company', authRequired, wrap(async (req, res) => {
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', ['company_info']);
  let info = {};
  try { info = rows.length ? JSON.parse(rows[0].value) : {}; } catch { info = {}; }
  res.json(info);
}));

router.put('/company', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const info = pick(req.body, ['name', 'address', 'tax_code', 'phone', 'email']);
  await query(
    'INSERT INTO settings (`key`, value, description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    ['company_info', JSON.stringify(info), 'Thông tin công ty (Bên A) điền hợp đồng']
  );
  res.json({ ok: true });
}));

// Cấu hình chung dạng key-value.
router.get('/', authRequired, wrap(async (req, res) => {
  res.json({ data: await query('SELECT `key`, value, description FROM settings ORDER BY `key`') });
}));

router.put('/:key', authRequired, requireRole('admin'), wrap(async (req, res) => {
  await query(
    'INSERT INTO settings (`key`, value) VALUES (?,?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    [req.params.key, req.body.value ?? '']
  );
  res.json({ ok: true });
}));

export default router;
