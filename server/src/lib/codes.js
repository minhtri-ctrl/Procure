// Sinh mã đơn hàng (MA_DH) và mã hàng (MA_HANG) theo chuẩn ProcureOS gốc.
import { query } from '../db.js';

// Bỏ dấu tiếng Việt (thuần ASCII, an toàn encoding).
export function noAccent(s) {
  return String(s || '').normalize('NFD')
    .split('').filter((c) => { const x = c.charCodeAt(0); return x < 768 || x > 879; })
    .map((c) => { const x = c.charCodeAt(0); return (x === 272 || x === 273) ? 'D' : c; })
    .join('');
}

// 16 loại hàng (LOAI_HH) + viết tắt 2 ký tự (ABBR2) — bám DM_TU_DIEN_LOAI.
export const LOAI_HH_ABBR = {
  'Vật phẩm': 'VP', 'May mặc': 'MM', 'In ấn': 'IN', 'Bao bì': 'BB',
  'POSM / Trưng bày': 'PO', 'Quà tặng': 'QT', 'SIM / Thẻ': 'ST', 'Phần mềm': 'PM',
  'Thiết bị điện tử': 'TD', 'Thiết bị văn phòng': 'TV', 'Nội thất / Setup': 'NT',
  'Vật tư / Công cụ': 'VT', 'Dịch vụ sản xuất': 'DS', 'Dịch vụ sự kiện': 'DK',
  'Dịch vụ vận chuyển': 'VC', 'Khác': 'KH',
};

// ABBR2 từ loại hàng: tra bảng, nếu không có -> ghép chữ đầu 2 từ, fallback 'XX'.
export function abbr2Of(loaiHh) {
  if (LOAI_HH_ABBR[loaiHh]) return LOAI_HH_ABBR[loaiHh];
  const words = noAccent(loaiHh).toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean);
  if (!words.length) return 'XX';
  if (words.length === 1) return (words[0] + 'X').slice(0, 2);
  return (words[0][0] + words[1][0]);
}

function yy() { return String(new Date().getFullYear()).slice(-2); }
function yymm() { const d = new Date(); return String(d.getFullYear()).slice(-2) + String(d.getMonth() + 1).padStart(2, '0'); }

// MA_DH: RQ-{TEAM}-{YY}-{NNNN}  (theo team + năm; số nối tiếp qua CẢ đơn hàng lẫn yêu cầu mua)
export async function nextOrderCode(teamCode) {
  const team = (noAccent(teamCode).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'GEN');
  const prefix = `RQ-${team}-${yy()}-`;
  const re = new RegExp('^' + prefix.replace(/-/g, '\\-') + '(\\d{4})$');
  let max = 0;
  const scan = (rows, field) => { for (const r of rows) { const m = re.exec(r[field] || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); } };
  scan(await query('SELECT order_code FROM orders WHERE order_code LIKE ?', [prefix + '%']), 'order_code');
  scan(await query('SELECT request_code FROM purchase_requests WHERE request_code LIKE ?', [prefix + '%']), 'request_code');
  return prefix + String(max + 1).padStart(4, '0');
}

// MA_HANG: {TEAM}-{ABBR2}-{YYMM}-{NNNN}
export async function nextItemCode(teamCode, loaiHh) {
  const team = (noAccent(teamCode).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'GEN');
  const prefix = `${team}-${abbr2Of(loaiHh)}-${yymm()}-`;
  const rows = await query('SELECT item_code FROM order_items WHERE item_code LIKE ?', [prefix + '%']);
  const re = new RegExp('^' + prefix.replace(/-/g, '\\-') + '(\\d{4})$');
  let max = 0;
  for (const r of rows) { const m = re.exec(r.item_code || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  return prefix + String(max + 1).padStart(4, '0');
}
