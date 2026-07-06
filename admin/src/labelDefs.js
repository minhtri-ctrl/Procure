// Nguồn duy nhất cho: (1) cấu trúc menu sidebar, (2) cột/field của các trang CrudPage,
// (3) danh mục đầy đủ nhãn hiển thị dùng cho trang admin "Tuỳ chỉnh nhãn".
// Đổi nhãn ở đây chỉ đổi text mặc định (fallback) — giá trị thực tế hiển thị vẫn ưu tiên
// bảng settings.ui_labels (admin sửa qua UI), không cần sửa code/deploy lại.

export const ALL_ROLES = ['admin', 'purchasing', 'warehouse', 'requester', 'pm'];
export const OPS = ['admin', 'purchasing']; // buyer/admin thao tác

export const NAV = [
  { section: true, key: 'menu.section.overview', label: 'Tổng quan', roles: OPS },
  { to: '/', key: 'menu.dashboard', label: '📊 Dashboard', end: true, roles: OPS },
  { section: true, key: 'menu.section.business', label: 'Nghiệp vụ', roles: ALL_ROLES },
  { to: '/requests', key: 'menu.requests', label: '📝 Yêu cầu mua', roles: ['admin', 'purchasing', 'pm', 'requester'] },
  { to: '/orders', key: 'menu.orders', label: '📦 Đơn hàng', roles: ['admin', 'purchasing', 'pm', 'requester'] },
  { to: '/item-board', key: 'menu.item_board', label: '🧩 Xử lý mặt hàng', roles: OPS },
  { to: '/products', key: 'menu.products', label: '🛒 Danh mục SP', roles: OPS },
  { to: '/warehouse', key: 'menu.warehouse', label: '🏬 Kho hàng', roles: ['admin', 'purchasing', 'warehouse'] },
  { to: '/contracts', key: 'menu.contracts', label: '📄 Hợp đồng', roles: OPS },
  { to: '/emails', key: 'menu.emails', label: '✉️ Email', roles: OPS },
  { to: '/ai', key: 'menu.ai', label: '🤖 Trợ lý AI', roles: OPS },
  { section: true, key: 'menu.section.catalog', label: 'Danh mục', roles: OPS },
  { to: '/suppliers', key: 'menu.suppliers', label: '🏢 Nhà cung cấp', roles: OPS },
  { to: '/teams', key: 'menu.teams', label: '👥 Team', roles: OPS },
  { to: '/categories', key: 'menu.categories', label: '🏷️ Loại hàng', roles: OPS },
  { section: true, key: 'menu.section.system', label: 'Hệ thống', roles: ['admin'] },
  { to: '/users', key: 'menu.users', label: '🔑 Người dùng', roles: ['admin'] },
  { to: '/admin/import', key: 'menu.import', label: '⬆️ Nhập dữ liệu', roles: ['admin'] },
  { to: '/admin/workflow', key: 'menu.workflow', label: '🔀 Cấu hình Workflow', roles: ['admin'] },
  { to: '/admin/appearance', key: 'menu.appearance', label: '🎨 Giao diện', roles: ['admin'] },
  { to: '/admin/company', key: 'menu.company', label: '🏢 Công ty & Người ký', roles: ['admin'] },
  { to: '/admin/labels', key: 'menu.labels', label: '🏷️ Tuỳ chỉnh nhãn', roles: ['admin'] },
];

// Nhãn nút bấm/thông báo dùng chung ở CrudPage (Nhà cung cấp/Team/Loại hàng).
export const COMMON_LABELS = [
  { key: 'common.search_placeholder', default: 'Tìm kiếm…' },
  { key: 'common.add', default: '+ Thêm mới' },
  { key: 'common.edit', default: 'Sửa' },
  { key: 'common.delete', default: 'Xoá' },
  { key: 'common.no_data', default: 'Không có dữ liệu' },
  { key: 'common.import_excel', default: '📥 Nhập Excel' },
  { key: 'common.importing', default: 'Đang nhập…' },
];

export const SUPPLIER_COLUMNS = [
  { key: 'name', label: 'Tên NCC' },
  { key: 'vendor_no', label: 'Mã NCC' },
  { key: 'contact_name', label: 'Liên hệ' },
  { key: 'contact_email', label: 'Email' },
  { key: 'payment_term_days', label: 'Công nợ (ngày)' },
];
export const SUPPLIER_FIELDS = [
  { key: 'name', label: 'Tên NCC', required: true },
  { key: 'vendor_no', label: 'Mã NCC' },
  { key: 'tax_code', label: 'Mã số thuế' },
  { key: 'contact_name', label: 'Người liên hệ' },
  { key: 'contact_email', label: 'Email' },
  { key: 'contact_phone', label: 'Điện thoại' },
  { key: 'address', label: 'Địa chỉ' },
  { key: 'payment_term_days', label: 'Công nợ (ngày)', type: 'number' },
  { key: 'representative', label: 'Người đại diện ký' },
  { key: 'rep_title', label: 'Chức vụ người đại diện' },
  { key: 'master_contract', label: 'Số hợp đồng khung' },
  { key: 'bank_name', label: 'Ngân hàng' },
  { key: 'bank_account', label: 'Số tài khoản' },
  { key: 'bank_branch', label: 'Chi nhánh NH' },
  { key: 'delivery_person', label: 'Người giao hàng' },
  { key: 'delivery_phone', label: 'SĐT người giao hàng' },
  { key: 'delivery_email', label: 'Email người giao hàng' },
];

export const TEAM_COLUMNS = [
  { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên team' },
  { key: 'lead_name', label: 'Trưởng nhóm' }, { key: 'lead_title', label: 'Chức vụ' },
];
export const TEAM_FIELDS = [
  { key: 'code', label: 'Mã team', required: true },
  { key: 'name', label: 'Tên team' },
  { key: 'lead_name', label: 'Trưởng nhóm' },
  { key: 'lead_title', label: 'Chức vụ' },
];

export const CATEGORY_COLUMNS = [
  { key: 'code', label: 'Mã' }, { key: 'name', label: 'Tên loại' }, { key: 'abbr', label: 'Viết tắt' },
];
export const CATEGORY_FIELDS = [
  { key: 'code', label: 'Mã loại', required: true },
  { key: 'name', label: 'Tên loại', required: true },
  { key: 'abbr', label: 'Viết tắt' },
];

// endpoint (không có dấu "/") -> {group hiển thị trong trang admin, columns, fields}
export const CRUD_GROUPS = {
  suppliers: { group: 'Nhà cung cấp', title: 'Nhà cung cấp', columns: SUPPLIER_COLUMNS, fields: SUPPLIER_FIELDS },
  teams: { group: 'Team', title: 'Team', columns: TEAM_COLUMNS, fields: TEAM_FIELDS },
  categories: { group: 'Loại hàng', title: 'Loại hàng', columns: CATEGORY_COLUMNS, fields: CATEGORY_FIELDS },
};

export const colLabelKey = (endpoint, fieldKey) => `col.${endpoint.replace(/^\//, '')}.${fieldKey}`;
export const fieldLabelKey = (endpoint, fieldKey) => `field.${endpoint.replace(/^\//, '')}.${fieldKey}`;

// Phase 2 — nhãn cột/label trong các trang tự viết bảng/form riêng (không dùng CrudPage).
// key + default trùng đúng fallback đã truyền tại nơi gọi L(key, fallback) trong từng trang.
export const PHASE2_LABELS = [
  // Orders.jsx — bảng danh sách đơn hàng
  { key: 'orders.col.ma_don', default: 'Mã đơn', group: 'Đơn hàng — danh sách' },
  { key: 'orders.col.du_an', default: 'Dự án', group: 'Đơn hàng — danh sách' },
  { key: 'orders.col.team', default: 'Team', group: 'Đơn hàng — danh sách' },
  { key: 'orders.col.ncc', default: 'NCC', group: 'Đơn hàng — danh sách' },
  { key: 'orders.col.ngay_yc', default: 'Ngày YC', group: 'Đơn hàng — danh sách' },
  { key: 'orders.col.so_dong', default: 'Số dòng', group: 'Đơn hàng — danh sách' },
  { key: 'orders.col.gia_tri', default: 'Giá trị', group: 'Đơn hàng — danh sách' },
  { key: 'orders.col.trang_thai', default: 'Trạng thái', group: 'Đơn hàng — danh sách' },

  // CreateOrder.jsx
  { key: 'create_order.field.ma_dh', default: 'MA_DH', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.field.tien_trinh', default: 'Tiến trình', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.field.diem_nhan', default: 'Điểm nhận', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.field.ngay_yc', default: 'Ngày YC', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.field.ngay_nhan', default: 'Ngày nhận', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.field.email', default: 'Email', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.field.ten_nguoi_yc', default: 'Tên người YC', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.field.team', default: 'Team *', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.field.ten_du_an', default: 'Tên dự án', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.field.hang_muc', default: 'Hạng mục', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.field.pm', default: 'PM', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.loai_hh', default: 'Loại HH', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.ten_hang', default: 'Tên hàng', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.mo_ta', default: 'Mô tả', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.sl', default: 'SL', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.don_gia', default: 'Đơn giá', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.vat', default: 'VAT%', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.tien_thue', default: 'Tiền thuế', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.thanh_tien', default: 'Thành tiền', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.tong', default: 'Tổng', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.dvt', default: 'ĐVT', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.thiet_ke', default: 'Thiết kế', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.ghi_chu', default: 'Ghi chú', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.so_pr', default: 'Số PR', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.ncc', default: 'NCC', group: 'Đơn hàng — tạo mới' },
  { key: 'create_order.col.master', default: 'Master', group: 'Đơn hàng — tạo mới' },

  // OrderDetail.jsx (info panel, tiến trình, bảng dòng hàng, sửa đơn, sửa dòng)
  { key: 'order_detail.field.note_reject', default: 'Ghi chú (bắt buộc khi từ chối)', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.info.du_an', default: 'Dự án', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.info.nguoi_yc', default: 'Người YC', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.info.team', default: 'Team', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.info.hang_muc', default: 'Hạng mục', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.info.diem_nhan', default: 'Điểm nhận', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.info.ngay_yc', default: 'Ngày YC', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.info.ngay_nhan', default: 'Ngày nhận', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.info.pm', default: 'PM', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.info.so_qdnb', default: 'Số QĐNB', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.info.tong_gia_tri', default: 'Tổng giá trị', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.field.change_status', default: 'Chuyển trạng thái', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.field.note', default: 'Ghi chú', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.field.send_email', default: 'Gửi email', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.field.history', default: 'Lịch sử tiến trình', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.col.ma_hang', default: 'Mã hàng', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.col.loai', default: 'Loại', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.col.ten_hang', default: 'Tên hàng', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.col.sl', default: 'SL', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.col.don_gia', default: 'Đơn giá', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.col.tong', default: 'Tổng', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.col.ncc', default: 'NCC', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.col.bg', default: 'BG', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.col.tien_trinh_dong', default: 'Tiến trình dòng', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.col.xu_ly', default: 'Xử lý', group: 'Đơn hàng — chi tiết' },
  { key: 'order_detail.field.ten_du_an', default: 'Tên dự án', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.team', default: 'Team', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.hang_muc', default: 'Hạng mục', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.diem_nhan', default: 'Điểm nhận', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.ngay_yc', default: 'Ngày YC', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.ngay_nhan', default: 'Ngày nhận', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.so_qdnb', default: 'Số QĐNB', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.pm', default: 'PM', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.hinh_thuc_tt', default: 'Hình thức TT', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.thoi_han_tt', default: 'Thời hạn TT', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.ghi_chu', default: 'Ghi chú', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.field.custom_fields', default: 'Trường tùy chỉnh (thêm/bớt tự do)', group: 'Đơn hàng — sửa đơn' },
  { key: 'order_detail.line.loai_hh', default: 'Loại HH', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.dvt', default: 'ĐVT', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.ten_hang', default: 'Tên hàng', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.so_luong', default: 'Số lượng', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.don_gia', default: 'Đơn giá', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.vat', default: 'VAT %', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.ncc', default: 'Nhà cung cấp', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.master_contract', default: 'Master Contract', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.so_pr', default: 'Số PR', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.link_thiet_ke', default: 'Link thiết kế', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.ghi_chu', default: 'Ghi chú', group: 'Đơn hàng — sửa dòng hàng' },
  { key: 'order_detail.line.file_bg', default: 'File báo giá (FILE_BG)', group: 'Đơn hàng — sửa dòng hàng' },

  // Requests.jsx
  { key: 'requests.col.ma_yc', default: 'Mã YC', group: 'Yêu cầu mua — danh sách' },
  { key: 'requests.col.du_an', default: 'Dự án', group: 'Yêu cầu mua — danh sách' },
  { key: 'requests.col.nguoi_yc', default: 'Người YC', group: 'Yêu cầu mua — danh sách' },
  { key: 'requests.col.team', default: 'Team', group: 'Yêu cầu mua — danh sách' },
  { key: 'requests.col.ngay_yc', default: 'Ngày YC', group: 'Yêu cầu mua — danh sách' },
  { key: 'requests.col.so_dong', default: 'Số dòng', group: 'Yêu cầu mua — danh sách' },
  { key: 'requests.col.trang_thai', default: 'Trạng thái', group: 'Yêu cầu mua — danh sách' },
  { key: 'requests.detail_col.stt', default: '#', group: 'Yêu cầu mua — xem chi tiết' },
  { key: 'requests.detail_col.ten_hang', default: 'Tên hàng', group: 'Yêu cầu mua — xem chi tiết' },
  { key: 'requests.detail_col.sl', default: 'SL', group: 'Yêu cầu mua — xem chi tiết' },
  { key: 'requests.detail_col.ngan_sach', default: 'Ngân sách', group: 'Yêu cầu mua — xem chi tiết' },
  { key: 'requests.detail_col.ncc_de_xuat', default: 'NCC đề xuất', group: 'Yêu cầu mua — xem chi tiết' },
  { key: 'requests.field.ten_du_an', default: 'Tên dự án *', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.field.team', default: 'Team', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.field.pm', default: 'PM', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.field.nguoi_yeu_cau', default: 'Người yêu cầu', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.field.email', default: 'Email', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.field.hang_muc', default: 'Hạng mục', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.field.ngay_yeu_cau', default: 'Ngày yêu cầu', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.field.can_truoc_ngay', default: 'Cần trước ngày', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.field.diem_nhan', default: 'Điểm nhận', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.field.ghi_chu_chung', default: 'Ghi chú chung', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.field.danh_sach_hang', default: 'Danh sách hàng cần mua', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.form_col.loai_hh', default: 'Loại HH', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.form_col.ten_hang', default: 'Tên hàng', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.form_col.mo_ta', default: 'Mô tả', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.form_col.sl', default: 'SL', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.form_col.dvt', default: 'ĐVT', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.form_col.ngan_sach', default: 'Ngân sách', group: 'Yêu cầu mua — form tạo' },
  { key: 'requests.form_col.ncc_de_xuat', default: 'NCC đề xuất', group: 'Yêu cầu mua — form tạo' },

  // ItemBoard.jsx
  { key: 'item_board.col.ten_hang', default: 'Tên hàng', group: 'Xử lý mặt hàng' },
  { key: 'item_board.col.loai', default: 'Loại', group: 'Xử lý mặt hàng' },
  { key: 'item_board.col.sl', default: 'SL', group: 'Xử lý mặt hàng' },
  { key: 'item_board.col.don_gia', default: 'Đơn giá', group: 'Xử lý mặt hàng' },
  { key: 'item_board.col.tong', default: 'Tổng', group: 'Xử lý mặt hàng' },
  { key: 'item_board.col.ncc', default: 'NCC', group: 'Xử lý mặt hàng' },
  { key: 'item_board.col.trang_thai_xu_ly', default: 'Trạng thái xử lý', group: 'Xử lý mặt hàng' },

  // Warehouse.jsx
  { key: 'warehouse.stock_col.sku', default: 'SKU', group: 'Kho hàng — tồn kho' },
  { key: 'warehouse.stock_col.ten_hang', default: 'Tên hàng', group: 'Kho hàng — tồn kho' },
  { key: 'warehouse.stock_col.kho', default: 'Kho', group: 'Kho hàng — tồn kho' },
  { key: 'warehouse.stock_col.dvt', default: 'ĐVT', group: 'Kho hàng — tồn kho' },
  { key: 'warehouse.stock_col.nhap', default: 'Nhập', group: 'Kho hàng — tồn kho' },
  { key: 'warehouse.stock_col.xuat', default: 'Xuất', group: 'Kho hàng — tồn kho' },
  { key: 'warehouse.stock_col.ton', default: 'Tồn', group: 'Kho hàng — tồn kho' },
  { key: 'warehouse.stock_col.don_gia', default: 'Đơn giá', group: 'Kho hàng — tồn kho' },
  { key: 'warehouse.stock_col.gia_tri_ton', default: 'Giá trị tồn', group: 'Kho hàng — tồn kho' },
  { key: 'warehouse.voucher_col.so_ct', default: 'Số CT', group: 'Kho hàng — phiếu kho' },
  { key: 'warehouse.voucher_col.loai', default: 'Loại', group: 'Kho hàng — phiếu kho' },
  { key: 'warehouse.voucher_col.ngay', default: 'Ngày', group: 'Kho hàng — phiếu kho' },
  { key: 'warehouse.voucher_col.kho', default: 'Kho', group: 'Kho hàng — phiếu kho' },
  { key: 'warehouse.voucher_col.nguoi_phu_trach', default: 'Người phụ trách', group: 'Kho hàng — phiếu kho' },
  { key: 'warehouse.voucher_col.so_dong', default: 'Số dòng', group: 'Kho hàng — phiếu kho' },
  { key: 'warehouse.voucher_col.tong_sl', default: 'Tổng SL', group: 'Kho hàng — phiếu kho' },
  { key: 'warehouse.ledger_col.ngay', default: 'Ngày', group: 'Kho hàng — sổ XNT' },
  { key: 'warehouse.ledger_col.so_ct', default: 'Số CT', group: 'Kho hàng — sổ XNT' },
  { key: 'warehouse.ledger_col.loai', default: 'Loại', group: 'Kho hàng — sổ XNT' },
  { key: 'warehouse.ledger_col.sku', default: 'SKU', group: 'Kho hàng — sổ XNT' },
  { key: 'warehouse.ledger_col.ten_hang', default: 'Tên hàng', group: 'Kho hàng — sổ XNT' },
  { key: 'warehouse.ledger_col.nhap', default: 'Nhập', group: 'Kho hàng — sổ XNT' },
  { key: 'warehouse.ledger_col.xuat', default: 'Xuất', group: 'Kho hàng — sổ XNT' },
  { key: 'warehouse.ledger_col.ton', default: 'Tồn', group: 'Kho hàng — sổ XNT' },
  { key: 'warehouse.ledger_col.don_gia', default: 'Đơn giá', group: 'Kho hàng — sổ XNT' },
  { key: 'warehouse.field.kho', default: 'Kho', group: 'Kho hàng — ghi phiếu' },
  { key: 'warehouse.field.nguoi_yeu_cau', default: 'Người yêu cầu', group: 'Kho hàng — ghi phiếu' },
  { key: 'warehouse.field.nguoi_nhan', default: 'Người nhận hàng', group: 'Kho hàng — ghi phiếu' },
  { key: 'warehouse.field.ly_do_nhap', default: 'Lý do nhập kho', group: 'Kho hàng — ghi phiếu' },
  { key: 'warehouse.field.ly_do_xuat', default: 'Lý do xuất kho', group: 'Kho hàng — ghi phiếu' },
  { key: 'warehouse.field.so_qdnb_tbkm', default: 'Số QĐNB / TBKM', group: 'Kho hàng — ghi phiếu' },
  { key: 'warehouse.field.so_ticket', default: 'Số ticket xuất kho', group: 'Kho hàng — ghi phiếu' },
  { key: 'warehouse.field.danh_sach_hang', default: 'Danh sách hàng', group: 'Kho hàng — ghi phiếu' },
];

// Toàn bộ danh mục nhãn (key + default + nhóm hiển thị) cho trang "Tuỳ chỉnh nhãn".
export function buildLabelManifest() {
  const out = [];
  for (const item of NAV) {
    if (item.section) out.push({ key: item.key, default: item.label, group: 'Sidebar (menu)' });
    else out.push({ key: item.key, default: item.label, group: 'Sidebar (menu)' });
  }
  for (const l of COMMON_LABELS) out.push({ ...l, group: 'Nút bấm chung' });
  for (const [endpoint, cfg] of Object.entries(CRUD_GROUPS)) {
    for (const c of cfg.columns) out.push({ key: colLabelKey(endpoint, c.key), default: c.label, group: `${cfg.group} — tiêu đề cột` });
    for (const f of cfg.fields) out.push({ key: fieldLabelKey(endpoint, f.key), default: f.label, group: `${cfg.group} — nhãn trong form` });
  }
  out.push(...PHASE2_LABELS);
  return out;
}
