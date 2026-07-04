import nodemailer from 'nodemailer';
import { query } from '../db.js';

// Cấu hình SMTP: ưu tiên bảng settings (key 'smtp_config', sửa qua trang admin), fallback biến môi trường.
// Chưa cấu hình cái nào -> isConfigured() = false, /emails/send sẽ chỉ ghi log như trước (không lỗi).
export async function getSmtpConfig() {
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', ['smtp_config']);
  let cfg = {};
  try { cfg = rows.length ? JSON.parse(rows[0].value) : {}; } catch { cfg = {}; }
  return {
    host: cfg.host || process.env.SMTP_HOST || '',
    port: Number(cfg.port || process.env.SMTP_PORT || 587),
    secure: cfg.secure !== undefined ? !!cfg.secure : String(process.env.SMTP_SECURE || '') === 'true',
    user: cfg.user || process.env.SMTP_USER || '',
    pass: cfg.pass || process.env.SMTP_PASS || '',
    from_name: cfg.from_name || process.env.SMTP_FROM_NAME || 'Phòng Mua Hàng Garena VN',
    from_email: cfg.from_email || process.env.SMTP_FROM_EMAIL || cfg.user || process.env.SMTP_USER || '',
  };
}

export function isSmtpConfigured(cfg) {
  return !!(cfg.host && cfg.user && cfg.pass && cfg.from_email);
}

let cachedTransporter = null;
let cachedKey = '';

async function getTransporter() {
  const cfg = await getSmtpConfig();
  if (!isSmtpConfigured(cfg)) return { cfg, transporter: null };
  const key = `${cfg.host}:${cfg.port}:${cfg.user}`;
  if (!cachedTransporter || cachedKey !== key) {
    cachedTransporter = nodemailer.createTransport({
      host: cfg.host, port: cfg.port, secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });
    cachedKey = key;
  }
  return { cfg, transporter: cachedTransporter };
}

// Gửi email thật qua SMTP. Trả { sent:true } nếu đã gửi, { sent:false } nếu chưa cấu hình SMTP
// (không phải lỗi — cho phép nơi gọi tự quyết định ghi log dạng "mô phỏng"). Ném lỗi nếu SMTP có cấu hình nhưng gửi thất bại.
export async function sendMail({ to, cc, subject, html }) {
  const { cfg, transporter } = await getTransporter();
  if (!transporter) return { sent: false };
  await transporter.sendMail({
    from: `"${cfg.from_name}" <${cfg.from_email}>`,
    to, cc: cc || undefined, subject, html,
  });
  return { sent: true };
}
