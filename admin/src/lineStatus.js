// Bộ trạng thái xử lý per-line (đồng bộ với server/src/lib/lineStatus.js).
export const LINE_STATUSES = [
  { code: 'cho_bao_gia', name: 'Chờ báo giá', color: '#64748b' },
  { code: 'dang_dat', name: 'Đang đặt', color: '#d97706' },
  { code: 'da_nhan', name: 'Đã nhận', color: '#0d9488' },
  { code: 'da_giao', name: 'Đã giao', color: '#16a34a' },
  { code: 'da_nhap_kho', name: 'Đã nhập kho', color: '#4338ca' },
  { code: 'huy', name: 'Huỷ', color: '#b91c1c' },
];
export const lineStatusOf = (code) => LINE_STATUSES.find((s) => s.code === code) || { code, name: code || '—', color: '#64748b' };

const LEGACY = {
  '': 'cho_bao_gia', 'chờ nhập kho': 'da_nhan', 'đã nhận hàng': 'da_nhan', 'đã bàn giao': 'da_giao',
  'đã giao': 'da_giao', 'đang đặt': 'dang_dat', 'chờ báo giá': 'cho_bao_gia', 'đã nhập kho': 'da_nhap_kho',
  'huỷ': 'huy', 'hủy': 'huy',
};
// Chuẩn hoá progress (code mới / nhãn cũ / rỗng) -> code hợp lệ (khớp server).
export function normalizeLineStatus(progress) {
  const v = String(progress || '').trim();
  if (LINE_STATUSES.some((s) => s.code === v)) return v;
  return LEGACY[v.toLowerCase()] || 'cho_bao_gia';
}
