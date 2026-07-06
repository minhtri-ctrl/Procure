import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';
import { getSmtpConfig, isSmtpConfigured, sendMail } from '../lib/mailer.js';

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

// Nhãn hiển thị tuỳ chỉnh (menu/cột/label) — chỉ đổi PHẦN HIỂN THỊ, không đụng dữ liệu/cấu trúc DB.
// GET công khai (authed) để mọi trang áp dụng; PUT chỉ admin.
router.get('/labels', authRequired, wrap(async (req, res) => {
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', ['ui_labels']);
  let labels = {};
  try { labels = rows.length ? JSON.parse(rows[0].value) : {}; } catch { labels = {}; }
  res.json(labels);
}));

router.put('/labels', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const labels = req.body || {};
  await query(
    'INSERT INTO settings (`key`, value, description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    ['ui_labels', JSON.stringify(labels), 'Nhãn hiển thị tuỳ chỉnh (menu/cột/label)']
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

// Cấu hình SMTP gửi email thật (admin). GET trả về đã che mật khẩu; PUT lưu vào settings.smtp_config.
router.get('/smtp', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const cfg = await getSmtpConfig();
  res.json({ ...cfg, pass: '', has_password: !!cfg.pass, configured: isSmtpConfigured(cfg) });
}));

router.put('/smtp', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', ['smtp_config']);
  let existing = {};
  try { existing = rows.length ? JSON.parse(rows[0].value) : {}; } catch { existing = {}; }
  const body = pick(req.body, ['host', 'port', 'secure', 'user', 'pass', 'from_name', 'from_email']);
  // Không gửi mật khẩu mới -> giữ nguyên mật khẩu cũ (form luôn hiện rỗng để không lộ mật khẩu).
  if (!body.pass) delete body.pass;
  const merged = { ...existing, ...body };
  await query(
    'INSERT INTO settings (`key`, value, description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
    ['smtp_config', JSON.stringify(merged), 'Cấu hình SMTP gửi email thật']
  );
  res.json({ ok: true });
}));

// Gửi thử 1 email tới chính người đang cấu hình -> xác nhận SMTP hoạt động trước khi dùng thật.
router.post('/smtp/test', authRequired, requireRole('admin'), wrap(async (req, res) => {
  const cfg = await getSmtpConfig();
  if (!isSmtpConfigured(cfg)) return res.status(400).json({ error: 'Chưa cấu hình đủ SMTP (host/user/pass/from_email)' });
  try {
    await sendMail({ to: req.user.email, subject: '[ProcureOS] Email thử SMTP', html: '<p>Đây là email thử nghiệm cấu hình SMTP của ProcureOS. Nếu bạn nhận được email này, cấu hình đã hoạt động.</p>' });
    res.json({ ok: true });
  } catch (e) {
    res.status(502).json({ error: 'Gửi thử thất bại: ' + e.message });
  }
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

// Xoá 1 key (VD: bỏ mẫu .docx admin đã upload để quay lại dùng file mặc định trong repo).
router.delete('/:key', authRequired, requireRole('admin'), wrap(async (req, res) => {
  await query('DELETE FROM settings WHERE `key` = ?', [req.params.key]);
  res.json({ ok: true });
}));

export default router;
