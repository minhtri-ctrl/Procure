import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap } from '../util.js';
import { moneyVnd } from '../lib/vn.js';

const router = Router();
router.use(authRequired);

// Cấu hình email (bám CONFIG code gốc). Có thể override qua bảng settings.
const DEFAULTS = {
  from_name: 'Phòng Mua Hàng Garena VN',
  cc_list: 'minhtri@garena.vn,tuyenchinh.vo@garena.vn',
};

// 4 loại email theo code gốc.
const EMAIL_TYPES = {
  confirm:   { label: 'XÁC NHẬN ĐƠN HÀNG',            subject: '[Garena Purchasing] Xác nhận đơn hàng $ma - $duan', to: 'supplier',  logType: 'GỬI XÁC NHẬN' },
  handover:  { label: 'BÀN GIAO ĐƠN HÀNG',            subject: '[Garena Purchasing] Bàn giao đơn hàng $ma - $duan', to: 'requester', logType: 'GỬI BÀN GIAO' },
  survey:    { label: 'KHẢO SÁT ĐÁNH GIÁ ĐƠN HÀNG',   subject: '[Garena Purchasing] Đánh giá đơn hàng $ma - $duan', to: 'requester', logType: 'GỬI ĐÁNH GIÁ' },
  wh_notify: { label: 'THÔNG BÁO HÀNG ĐÃ NHẬP KHO',   subject: '[Garena Purchasing] Thông tin nhập kho $ma - $duan', to: 'requester', logType: 'THÔNG BÁO HÀNG ĐÃ NHẬP KHO' },
};

async function getSetting(key, dflt) {
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', [key]);
  return rows.length ? rows[0].value : dflt;
}

// Sinh mã NCC 3 ký tự (bỏ dấu, bỏ từ chung, lấy 2 từ cuối).
function nccCode(name) {
  const STOP = new Set(['CONG', 'TY', 'TNHH', 'CP', 'CTY', 'CORP', 'GROUP', 'TM', 'DV', 'CO', 'LTD', 'JSC', 'VN', 'VIETNAM', 'VIET', 'NAM']);
  const clean = String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
  if (!clean.length) return 'NCC';
  if (clean.length === 1) return (clean[0] + 'XX').slice(0, 3);
  const w1 = clean[clean.length - 2];
  const w2 = clean[clean.length - 1];
  return (w1[0] + w2.slice(0, 2)).padEnd(3, 'X').slice(0, 3);
}

async function generatePO(supplierName) {
  const code = nccCode(supplierName);
  const year = new Date().getFullYear();
  const prefix = `PO-${code}-${year}-`;
  const rows = await query('SELECT po_no FROM orders WHERE po_no LIKE ?', [prefix + '%']);
  const re = new RegExp('^' + prefix.replace(/-/g, '\\-') + '(\\d{4})$');
  let max = 0;
  for (const r of rows) { const m = re.exec(r.po_no || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  return prefix + String(max + 1).padStart(4, '0');
}

async function loadOrder(orderId) {
  const rows = await query(
    `SELECT o.*, s.name AS supplier_name, s.contact_email AS supplier_email, t.name AS team_name
     FROM orders o LEFT JOIN suppliers s ON s.id=o.supplier_id LEFT JOIN teams t ON t.id=o.team_id WHERE o.id = ?`, [orderId]);
  if (!rows.length) return null;
  const order = rows[0];
  order.items = await query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [orderId]);
  return order;
}

function itemsTable(items) {
  const rows = items.map((it, i) => `<tr>
    <td style="border:1px solid #ddd;padding:6px;text-align:center">${i + 1}</td>
    <td style="border:1px solid #ddd;padding:6px">${it.item_name || ''}</td>
    <td style="border:1px solid #ddd;padding:6px;text-align:center">${it.unit || ''}</td>
    <td style="border:1px solid #ddd;padding:6px;text-align:right">${it.quantity}</td>
    <td style="border:1px solid #ddd;padding:6px;text-align:right">${moneyVnd(it.unit_price)}</td>
    <td style="border:1px solid #ddd;padding:6px;text-align:right">${moneyVnd(it.line_total)}</td>
  </tr>`).join('');
  return `<table style="border-collapse:collapse;width:100%;font-size:13px">
    <thead><tr style="background:#f3f4f6">
      <th style="border:1px solid #ddd;padding:6px">STT</th><th style="border:1px solid #ddd;padding:6px">Tên hàng</th>
      <th style="border:1px solid #ddd;padding:6px">ĐVT</th><th style="border:1px solid #ddd;padding:6px">SL</th>
      <th style="border:1px solid #ddd;padding:6px">Đơn giá</th><th style="border:1px solid #ddd;padding:6px">Thành tiền</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}

// Soạn nội dung email theo loại.
function composeBody(type, order, poNo) {
  const head = `<div style="font-family:Segoe UI,Arial,sans-serif;color:#1f2733;max-width:680px">`;
  const summary = `<p><b>Mã đơn hàng:</b> ${order.order_code}${poNo ? ` &nbsp; <b>Số PO:</b> ${poNo}` : ''}<br>
    <b>Dự án:</b> ${order.project_name || ''}<br>
    <b>Nhà cung cấp:</b> ${order.supplier_name || ''}<br>
    <b>Tổng tạm tính:</b> ${moneyVnd(order.total_amount)} đ</p>`;
  let intro = '';
  if (type === 'confirm') intro = `<p>Kính gửi Quý nhà cung cấp,</p><p>Phòng Mua hàng Garena VN xin xác nhận đơn đặt hàng với các thông tin sau. Vui lòng phản hồi xác nhận để chúng tôi tiến hành các bước tiếp theo.</p>`;
  else if (type === 'handover') intro = `<p>Kính gửi Anh/Chị,</p><p>Phòng Mua hàng Garena VN gửi đến bạn thông tin bàn giao đơn hàng dưới đây. Vui lòng kiểm tra và xác nhận đã nhận.</p>`;
  else if (type === 'survey') intro = `<p>Kính gửi Anh/Chị,</p><p>Phòng Mua hàng Garena VN xin cảm ơn bạn đã phối hợp và hoàn tất đơn hàng. Mong bạn dành ít phút đánh giá chất lượng dịch vụ (Chất lượng, Giá cả, Giao hàng, Nhân sự hỗ trợ) theo thang điểm 1–5.</p>`;
  else intro = `<p>Kính gửi Anh/Chị,</p><p>Phòng Mua hàng Garena VN xin thông tin đơn hàng <b>${order.order_code}</b> đã được ghi nhận nhập kho. Vui lòng phối hợp các bước xuất kho khi cần.</p>`;
  return head + intro + summary + itemsTable(order.items) +
    `<p style="margin-top:16px">Trân trọng,<br><b>${DEFAULTS.from_name}</b></p></div>`;
}

function fmtSubject(tpl, order) {
  return tpl.replace('$ma', order.order_code || '').replace('$duan', order.project_name || '');
}

async function buildEmail(orderId, type) {
  const def = EMAIL_TYPES[type];
  if (!def) throw Object.assign(new Error('Loại email không hợp lệ'), { status: 400 });
  const order = await loadOrder(orderId);
  if (!order) throw Object.assign(new Error('Không tìm thấy đơn hàng'), { status: 404 });
  const to = def.to === 'supplier' ? (order.supplier_email || '') : (order.requester_email || '');
  const poNo = type === 'confirm' ? await generatePO(order.supplier_name) : null;
  const subject = fmtSubject(def.subject, order);
  const body = composeBody(type, order, poNo);
  return { order, def, to, poNo, subject, body };
}

// Xem trước email (không ghi log).
router.post('/preview', wrap(async (req, res) => {
  const { order_id, type } = req.body || {};
  const cc = req.body.cc || (await getSetting('email_cc_list', DEFAULTS.cc_list));
  const { def, to, poNo, subject, body } = await buildEmail(order_id, type);
  res.json({ type, label: def.label, to, cc, po_no: poNo, subject, body });
}));

// Gửi (ghi nhận vào LỊCH SỬ GỬI ĐƠN) — nền tảng demo không có SMTP nên ghi lịch sử.
router.post('/send', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const { order_id, type } = req.body || {};
  const cc = req.body.cc || (await getSetting('email_cc_list', DEFAULTS.cc_list));
  const { order, def, to, poNo, subject, body } = await buildEmail(order_id, type);

  // Cập nhật đơn theo loại email (bám code gốc).
  if (type === 'confirm' && poNo) {
    await query('UPDATE orders SET po_no = ?, po_date = NOW(), po_status = ? WHERE id = ?', [poNo, 'Đã gửi NCC', order.id]);
  } else if (type === 'handover') {
    await query('UPDATE orders SET handover_date = CURDATE() WHERE id = ?', [order.id]);
  } else if (type === 'wh_notify') {
    await query('UPDATE orders SET warehouse_status = ? WHERE id = ?', ['Đã nhập kho', order.id]);
  }

  await query(
    `INSERT INTO email_logs (sent_at, order_code, recipient_name, recipient_email, project_name, email_type, status, note, cc_list, body_html, po_no)
     VALUES (NOW(),?,?,?,?,?,?,?,?,?,?)`,
    [order.order_code, def.to === 'supplier' ? order.supplier_name : order.requester_name, to, order.project_name,
      def.logType, 'ĐÃ GỬI', subject, cc, body, poNo]
  );
  res.status(201).json({ ok: true, to, cc, subject, po_no: poNo });
}));

// Lịch sử gửi đơn.
router.get('/logs', wrap(async (req, res) => {
  const { order_code, email_type, limit = 200 } = req.query;
  const where = [];
  const params = [];
  if (order_code) { where.push('order_code = ?'); params.push(order_code); }
  if (email_type) { where.push('email_type = ?'); params.push(email_type); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(
    `SELECT id, sent_at, order_code, recipient_name, recipient_email, project_name, email_type, status, note, cc_list, po_no
     FROM email_logs ${whereSql} ORDER BY id DESC LIMIT ?`, [...params, Math.min(Number(limit) || 200, 500)]);
  res.json({ data: rows });
}));

router.get('/logs/:id', wrap(async (req, res) => {
  const rows = await query('SELECT * FROM email_logs WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy' });
  res.json(rows[0]);
}));

// ---- Đánh giá (Điểm đánh giá) ----
router.get('/ratings', wrap(async (req, res) => {
  const rows = await query('SELECT * FROM ratings ORDER BY id DESC LIMIT 200');
  res.json({ data: rows });
}));

router.post('/ratings', wrap(async (req, res) => {
  const b = req.body || {};
  const q = Number(b.score_quality || 0), p = Number(b.score_price || 0), d = Number(b.score_delivery || 0), s = Number(b.score_support || 0);
  const avg = Math.round(((q + p + d + s) / 4) * 100) / 100;
  await query(
    `INSERT INTO ratings (rated_at, order_code, email, project_name, score_quality, score_price, score_delivery, score_support, score_avg, comment)
     VALUES (NOW(),?,?,?,?,?,?,?,?,?)`,
    [b.order_code || '', b.email || req.user.email, b.project_name || '', q, p, d, s, avg, b.comment || '']
  );
  // Ghi lịch sử phản hồi đánh giá (bám code gốc: "⭐ TB x/5").
  await query(
    `INSERT INTO email_logs (sent_at, order_code, recipient_name, recipient_email, project_name, email_type, status, note)
     VALUES (NOW(),?,?,?,?,?,?,?)`,
    [b.order_code || '', req.user.name, b.email || req.user.email, b.project_name || '', 'KHẢO SÁT ĐÁNH GIÁ ĐƠN HÀNG', `⭐ TB ${avg}/5`, b.comment || '']
  );
  res.status(201).json({ ok: true, avg });
}));

export default router;
