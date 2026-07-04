import { query } from '../db.js';

// Gửi thông báo SeaTalk. Bật bằng cách đặt settings 'seatalk_webhook' (URL webhook nhóm).
// Chưa cấu hình -> ghi log (no-op), không lỗi. Sẵn sàng bật sau.
export async function notifySeaTalk(text) {
  try {
    const rows = await query('SELECT value FROM settings WHERE `key` = ?', ['seatalk_webhook']);
    const url = rows[0]?.value;
    if (!url) { console.log('[seatalk] (chưa cấu hình) ' + text); return { sent: false }; }
    await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: 'text', text: { content: text } }),
    });
    return { sent: true };
  } catch (e) {
    console.error('[seatalk] lỗi:', e.message);
    return { sent: false, error: e.message };
  }
}
