// Bộ trạng thái xử lý CỐ ĐỊNH cho từng dòng hàng (order_items.progress lưu MÃ code).
// Buyer xử lý theo nhóm trạng thái này ở màn "Xử lý mặt hàng".
export const LINE_STATUSES = [
  { code: 'cho_bao_gia', name: 'Chờ báo giá', color: '#64748b' },
  { code: 'dang_dat', name: 'Đang đặt', color: '#d97706' },
  { code: 'da_nhan', name: 'Đã nhận', color: '#0d9488' },
  { code: 'da_giao', name: 'Đã giao', color: '#16a34a' },
  { code: 'da_nhap_kho', name: 'Đã nhập kho', color: '#4338ca' },
  { code: 'huy', name: 'Huỷ', color: '#b91c1c' },
];
export const LINE_STATUS_CODES = LINE_STATUSES.map((s) => s.code);

// Nhãn cũ (progress text tự do) -> code mới, để dữ liệu import/cũ vẫn gom nhóm đúng.
const LEGACY = {
  '': 'cho_bao_gia',
  'chờ nhập kho': 'da_nhan',
  'đã nhận hàng': 'da_nhan',
  'đã bàn giao': 'da_giao',
  'đã giao': 'da_giao',
  'đang đặt': 'dang_dat',
  'chờ báo giá': 'cho_bao_gia',
  'đã nhập kho': 'da_nhap_kho',
  'huỷ': 'huy',
  'hủy': 'huy',
};

// Chuẩn hoá 1 giá trị progress (code mới, nhãn cũ, hoặc rỗng) về 1 code hợp lệ.
export function normalizeLineStatus(progress) {
  const v = String(progress || '').trim();
  if (LINE_STATUS_CODES.includes(v)) return v;
  const mapped = LEGACY[v.toLowerCase()];
  return mapped || 'cho_bao_gia';
}
