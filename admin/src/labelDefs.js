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
  return out;
}
