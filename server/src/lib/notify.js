import { query } from '../db.js';

// Tạo 1 thông báo in-app. Dùng conn (transaction) nếu truyền, không thì dùng pool query.
export async function createNotification(n, conn) {
  const cols = ['recipient_email', 'type', 'title', 'body', 'order_id', 'link', 'requires_action', 'action_status', 'created_by'];
  const vals = [
    n.recipient_email, n.type || 'info', n.title, n.body || null, n.order_id || null,
    n.link || null, n.requires_action ? 1 : 0, n.requires_action ? 'pending' : 'none', n.created_by || null,
  ];
  const sql = `INSERT INTO notifications (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
  if (conn) { const [r] = await conn.query(sql, vals); return r.insertId; }
  const r = await query(sql, vals);
  return r.insertId;
}
