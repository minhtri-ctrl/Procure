import { Router } from 'express';
import { authRequired, signToken } from '../middleware/auth.js';
import { config } from '../config.js';

const router = Router();

const user = {
  id: 1,
  email: config.admin.email,
  full_name: config.admin.name,
  name: config.admin.name,
  role: 'admin',
  team_id: 1,
};

const workflow = [
  { id: 1, code: 'new', name: 'Mới', color: '#64748b', sort_order: 10, actor: 'buyer', is_terminal: 0, is_active: 1 },
  { id: 2, code: 'in_progress', name: 'Đang xử lý', color: '#2563eb', sort_order: 20, actor: 'buyer', is_terminal: 0, is_active: 1 },
  { id: 3, code: 'pending_confirmation', name: 'Chờ xác nhận báo giá', color: '#db2777', sort_order: 35, actor: 'requester', is_terminal: 0, is_active: 1 },
  { id: 4, code: 'confirmed', name: 'Requester xác nhận', color: '#0891b2', sort_order: 40, actor: 'requester', is_terminal: 0, is_active: 1 },
  { id: 5, code: 'ordered', name: 'Đã đặt hàng NCC', color: '#d97706', sort_order: 50, actor: 'buyer', is_terminal: 0, is_active: 1 },
  { id: 6, code: 'received', name: 'Đã nhận hàng', color: '#0d9488', sort_order: 60, actor: 'warehouse', is_terminal: 0, is_active: 1 },
  { id: 7, code: 'warehoused', name: 'Đã nhập kho', color: '#16a34a', sort_order: 70, actor: 'warehouse', is_terminal: 0, is_active: 1 },
  { id: 8, code: 'completed', name: 'Hoàn tất', color: '#166534', sort_order: 100, actor: 'buyer', is_terminal: 1, is_active: 1 },
];

const teams = [
  { id: 1, code: 'MKT', name: 'Marketing', lead_name: 'Nguyễn Minh Anh', lead_title: 'Marketing Manager', is_active: 1 },
  { id: 2, code: 'OPS', name: 'Operations', lead_name: 'Trần Hoàng', lead_title: 'Operations Lead', is_active: 1 },
];

const categories = [
  { id: 1, code: 'POSM', name: 'POSM', abbr: 'POSM', abbr2: 'PS', is_active: 1 },
  { id: 2, code: 'IT', name: 'Thiết bị IT', abbr: 'IT', abbr2: 'IT', is_active: 1 },
];

const suppliers = [
  { id: 1, name: 'Công ty TNHH Demo Supply', vendor_no: 'NCC001', contact_name: 'Lan', contact_email: 'lan@vendor.vn', payment_term_days: 14, master_contract: 'MC-2026-001', is_active: 1 },
  { id: 2, name: 'Dịch vụ Sự kiện Sao Việt', vendor_no: 'NCC002', contact_name: 'Huy', contact_email: 'huy@vendor.vn', payment_term_days: 30, master_contract: '', is_active: 1 },
];

const products = [
  { id: 1, sku: 'MKT-PS-2607-0001', name: 'Standee sự kiện', category_id: 1, category_name: 'POSM', unit: 'cái', default_price: 450000, vat_rate: 0.08, supplier_id: 1, supplier_name: suppliers[0].name, is_active: 1 },
  { id: 2, sku: 'OPS-IT-2607-0001', name: 'Laptop demo', category_id: 2, category_name: 'Thiết bị IT', unit: 'cái', default_price: 18500000, vat_rate: 0.1, supplier_id: 2, supplier_name: suppliers[1].name, is_active: 1 },
];

let orders = [
  {
    id: 1,
    order_code: 'RQ-MKT-26-0001',
    requester_email: 'requester@garena.vn',
    requester_name: 'Requester Demo',
    team_id: 1,
    team_name: 'Marketing',
    supplier_id: 1,
    supplier_name: suppliers[0].name,
    project_name: 'Chiến dịch ra mắt sản phẩm Q3',
    hang_muc: 'POSM',
    pm: 'PM Demo',
    status: 'confirmed',
    request_date: '2026-07-01',
    expected_date: '2026-07-15',
    receiving_point: 'Văn phòng HCM',
    qdnb_tbkm: 'QDNB-2026-07',
    total_amount: 27000000,
    warehouse_status: 'Chờ nhập kho',
    custom_fields: { Campaign: 'Launch Q3' },
    item_count: 2,
    items: [
      { id: 1, order_id: 1, item_code: 'MKT-PS-2607-0001', loai_hh: 'Vật phẩm', item_name: 'Standee sự kiện', quantity: 20, unit: 'cái', unit_price: 450000, vat_rate: 0.08, line_total: 9720000, supplier_id: 1, supplier_name: suppliers[0].name, progress: 'Chờ nhập kho', nhap_kho: 'Chờ nhập kho', in_catalog: 1 },
      { id: 2, order_id: 1, item_code: '', loai_hh: 'Dịch vụ', item_name: 'Thi công booth demo', quantity: 1, unit: 'gói', unit_price: 16000000, vat_rate: 0.08, line_total: 17280000, supplier_id: 1, supplier_name: suppliers[0].name, progress: 'Đã báo giá', in_catalog: 0 },
    ],
  },
  {
    id: 2,
    order_code: 'RQ-OPS-26-0001',
    requester_email: 'ops@garena.vn',
    requester_name: 'Ops Demo',
    team_id: 2,
    team_name: 'Operations',
    supplier_id: 2,
    supplier_name: suppliers[1].name,
    project_name: 'Trang bị laptop onboarding',
    hang_muc: 'Thiết bị IT',
    pm: 'Ops PM',
    status: 'ordered',
    request_date: '2026-07-05',
    expected_date: '2026-07-13',
    receiving_point: 'Kho Hà Nội',
    total_amount: 20350000,
    warehouse_status: 'Đang vận chuyển',
    custom_fields: {},
    item_count: 1,
    items: [
      { id: 3, order_id: 2, item_code: 'OPS-IT-2607-0001', loai_hh: 'Thiết bị', item_name: 'Laptop demo', quantity: 1, unit: 'cái', unit_price: 18500000, vat_rate: 0.1, line_total: 20350000, supplier_id: 2, supplier_name: suppliers[1].name, progress: 'Đã đặt hàng NCC', in_catalog: 1 },
    ],
  },
];

const contracts = [
  { id: 1, contract_no: 'DDH-2607-0001', type: 'DDH', amount: 27000000, status: 'Nháp', order_id: 1, order_code: 'RQ-MKT-26-0001', project_name: orders[0].project_name, supplier_name: suppliers[0].name, file_url: '/api/contracts/1/document', created_at: '2026-07-12 09:00:00' },
];

const notifications = [
  { id: 1, recipient_email: user.email, type: 'automation_contract', title: 'Đã tự tạo hợp đồng - RQ-MKT-26-0001', body: 'Demo automation đã tạo DDH cho đơn đủ ngưỡng.', order_id: 1, link: '/orders/1', requires_action: 0, action_status: 'none', is_read: 0, created_at: '2026-07-12 09:00:00' },
];

const requests = [
  { id: 1, request_code: 'YC-MKT-2607-0001', requester_name: 'Requester Demo', requester_email: 'requester@garena.vn', team_id: 1, team_name: 'Marketing', project_name: 'Booth Mini Event', request_date: '2026-07-10', expected_date: '2026-07-20', status: 'new', item_count: 2, items: [{ id: 1, item_name: 'Backdrop', quantity: 1, unit: 'bộ', budget: 8000000 }, { id: 2, item_name: 'Quà tặng', quantity: 200, unit: 'cái', budget: 12000000 }] },
];

const stock = [
  { id: 1, sku: 'MKT-PS-2607-0001', item_name: 'Standee sự kiện', warehouse: 'KHO_HCM', unit: 'cái', qty_in: 50, qty_out: 12, qty_on_hand: 38, unit_price: 450000, total_value: 17100000, supplier_name: suppliers[0].name, bin: 'A-01' },
  { id: 2, sku: 'OPS-IT-2607-0001', item_name: 'Laptop demo', warehouse: 'KHO_HN', unit: 'cái', qty_in: 5, qty_out: 2, qty_on_hand: 3, unit_price: 18500000, total_value: 55500000, supplier_name: suppliers[1].name, bin: 'IT-02' },
];

const moves = [
  { id: 1, move_date: '2026-07-11', voucher_no: 'PNK-2607-0001', move_type: 'PNK', warehouse: 'KHO_HCM', sku: 'MKT-PS-2607-0001', item_name: 'Standee sự kiện', unit: 'cái', qty_in: 50, qty_out: 0, running_balance: 50 },
  { id: 2, move_date: '2026-07-12', voucher_no: 'PXK-2607-0001', move_type: 'PXK', warehouse: 'KHO_HCM', sku: 'MKT-PS-2607-0001', item_name: 'Standee sự kiện', unit: 'cái', qty_in: 0, qty_out: 12, running_balance: 38 },
];

function ok(res, data = { ok: true }) {
  return res.json(data);
}

function list(data) {
  return { data, total: data.length, page: 1, limit: data.length };
}

function currentUser() {
  return { id: user.id, email: user.email, name: user.name, role: user.role, team_id: user.team_id };
}

function demoLineStatus(progress) {
  const v = String(progress || '').toLowerCase();
  if (['da_nhan', 'da_nhap_kho', 'da_giao', 'dang_dat', 'cho_bao_gia', 'huy'].includes(v)) return v;
  if (v.includes('huỷ') || v.includes('hủy')) return 'huy';
  if (v.includes('nhận') || v.includes('nhập kho')) return 'da_nhan';
  if (v.includes('đặt')) return 'dang_dat';
  return 'cho_bao_gia';
}
function refreshDemoOrder(order) {
  order.items.forEach((it) => {
    const base = Math.round(Number(it.quantity || 0) * Number(it.unit_price || 0) * (1 - Number(it.discount_rate || 0)));
    it.thanh_tien = base; it.tien_thue = Math.round(base * Number(it.vat_rate || 0)); it.line_total = base + it.tien_thue;
    const s = suppliers.find((x) => String(x.id) === String(it.supplier_id)); it.supplier_name = s?.name || '';
  });
  order.total_amount = order.items.reduce((sum, it) => sum + Number(it.line_total || 0), 0); order.item_count = order.items.length;
  const active = order.items.map((it) => demoLineStatus(it.progress)).filter((x) => x !== 'huy');
  if (!order.items.length) return;
  order.status = !active.length ? 'cancelled' : active.every((x) => ['da_nhan', 'da_nhap_kho', 'da_giao'].includes(x)) ? 'received' : active.includes('cho_bao_gia') ? 'in_progress' : 'ordered';
}
function demoOrderSuppliers(order) {
  return [...new Map(order.items.filter((it) => it.supplier_id).map((it) => [it.supplier_id, it])).values()].map((it) => ({ supplier_id: it.supplier_id, supplier_name: it.supplier_name, ...(order.order_supplier_data?.[it.supplier_id] || {}), custom_fields: order.order_supplier_data?.[it.supplier_id]?.custom_fields || {} }));
}

router.post('/auth/login', (req, res) => {
  const email = String(req.body?.email || '').toLowerCase().trim();
  const password = String(req.body?.password || '');
  if (email !== config.admin.email || password !== config.admin.password) {
    return res.status(401).json({ error: 'Demo: dùng admin@garena.vn / admin123' });
  }
  res.json({ token: signToken(user), user: currentUser() });
});

router.use(authRequired);

router.get('/auth/me', (req, res) => ok(res, currentUser()));
router.get('/workflow', (req, res) => ok(res, { data: workflow.filter((s) => s.is_active) }));
router.get('/workflow/all', (req, res) => ok(res, { data: workflow }));
router.post('/workflow', (req, res) => ok(res, { id: Date.now() }));
router.put('/workflow/:id', (req, res) => ok(res));
router.delete('/workflow/:id', (req, res) => ok(res));

router.get('/settings/theme', (req, res) => ok(res, { primary: '#ff5722', sidebar: '#16202e', bg: '#f4f6fb', accent: '#2563eb', radius: '10px' }));
router.put('/settings/theme', (req, res) => ok(res));
router.get('/settings/labels', (req, res) => ok(res, {}));
router.put('/settings/labels', (req, res) => ok(res));
router.get('/settings/company', (req, res) => ok(res, { name: 'Công ty Demo ProcureOS', address: '29 Liễu Giai, Hà Nội', tax_code: 'DEMO-TAX', phone: '0900000000', email: 'procurement@garena.vn' }));
router.put('/settings/company', (req, res) => ok(res));
router.get('/settings/smtp', (req, res) => ok(res, { configured: false }));
router.put('/settings/smtp', (req, res) => ok(res));
router.post('/settings/smtp/test', (req, res) => ok(res));

router.get('/dashboard', (req, res) => ok(res, {
  total_spend: orders.reduce((s, o) => s + Number(o.total_amount || 0), 0),
  total_orders: orders.length,
  order_count: orders.length,
  pending_requests: requests.filter((r) => r.status === 'new').length,
  product_count: products.length,
  supplier_count: suppliers.length,
  by_status: workflow.map((s) => ({ status: s.code, count: orders.filter((o) => o.status === s.code).length })).filter((x) => x.count),
  by_team: teams.map((t) => ({
    team: t.name,
    spend: orders.filter((o) => o.team_id === t.id).reduce((s, o) => s + Number(o.total_amount || 0), 0),
  })),
  recent: orders,
  recent_orders: orders,
}));

router.get('/teams', (req, res) => ok(res, list(teams)));
router.get('/categories', (req, res) => ok(res, list(categories)));
router.get('/suppliers', (req, res) => ok(res, list(suppliers)));
router.get('/signatories', (req, res) => ok(res, list([{ id: 1, role_key: 'contract', scope: 'default', name: 'Vũ Chí Công', title: 'Giám đốc', is_active: 1 }])));
router.post('/teams', (req, res) => ok(res, { id: Date.now() }));
router.post('/categories', (req, res) => ok(res, { id: Date.now() }));
router.post('/suppliers', (req, res) => ok(res, { id: Date.now() }));
router.post('/signatories', (req, res) => ok(res, { id: Date.now() }));
router.put('/:master(teams|categories|suppliers|signatories)/:id', (req, res) => ok(res));
router.delete('/:master(teams|categories|suppliers|signatories)/:id', (req, res) => ok(res));

router.get('/orders/count', (req, res) => ok(res, { total: orders.length }));
router.get('/orders/items/all', (req, res) => {
  const rows = orders.flatMap((o) => o.items.map((it) => ({
    ...it,
    order_code: o.order_code,
    project_name: o.project_name,
    order_status: o.status,
    requester_name: o.requester_name,
    expected_date: o.expected_date,
    actual_date: o.actual_date,
    total_amount: o.total_amount,
    team_name: o.team_name,
    flags: { overdue_receipt: false, due_soon_receipt: true, due_soon_payment: false, missing_contract: false },
    line_status: it.progress,
  })));
  ok(res, { data: rows, counts: {}, flagCounts: { overdue_receipt: 0, due_soon_receipt: 1, due_soon_payment: 0, missing_contract: 0 }, total: rows.length });
});
router.get('/orders', (req, res) => ok(res, list(orders.map(({ items, custom_fields, ...o }) => ({ ...o, item_count: items.length })))));
router.post('/orders', (req, res) => {
  const id = orders.length + 1;
  const items = (Array.isArray(req.body.items) ? req.body.items : []).map((item, index) => {
    const supplier = suppliers.find((s) => String(s.id) === String(item.supplier_id));
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unit_price || 0);
    const vatRate = Number(item.vat_rate || 0);
    const lineTotal = Math.round(quantity * unitPrice * (1 + vatRate));
    return { id: Date.now() + index, order_id: id, ...item, supplier_name: supplier?.name || '', line_total: lineTotal };
  });
  const supplierNames = [...new Set(items.map((item) => item.supplier_name).filter(Boolean))];
  const team = teams.find((entry) => String(entry.id) === String(req.body.team_id));
  const order = {
    id, order_code: `RQ-DEMO-26-${String(id).padStart(4, '0')}`, status: 'new',
    total_amount: items.reduce((sum, item) => sum + item.line_total, 0), item_count: items.length,
    history: [], ...req.body, items, team_name: team?.name || '', supplier_name: supplierNames.join(', '),
  };
  orders.unshift(order);
  ok(res, { id, order_code: order.order_code });
});
router.get('/orders/:id', (req, res) => {
  const order = orders.find((o) => String(o.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn demo' });
  ok(res, { ...order, order_suppliers: demoOrderSuppliers(order), history: [{ id: 1, order_id: order.id, from_status: null, to_status: order.status, changed_by: user.email, note: 'Demo history', created_at: '2026-07-12 09:00:00' }] });
});
router.put('/orders/:id', (req, res) => {
  const order = orders.find((entry) => String(entry.id) === String(req.params.id));
  if (!order) return res.status(404).json({ error: 'Không tìm thấy đơn demo' });
  const team = teams.find((entry) => String(entry.id) === String(req.body.team_id));
  Object.assign(order, req.body, { team_name: team?.name || '' });
  ok(res);
});
router.delete('/orders/:id', (req, res) => ok(res));
router.delete('/orders', (req, res) => ok(res, { ok: true, deleted: 0 }));
router.patch('/orders/:id/status', (req, res) => {
  const order = orders.find((o) => String(o.id) === String(req.params.id));
  if (order) order.status = req.body?.status || order.status;
  ok(res, { ok: true, automation: { notifications_created: 1 } });
});
router.get('/orders/:id/suppliers', (req, res) => { const o = orders.find((x) => String(x.id) === String(req.params.id)); ok(res, { data: o ? demoOrderSuppliers(o) : [] }); });
router.put('/orders/:id/suppliers/:supplierId', (req, res) => { const o = orders.find((x) => String(x.id) === String(req.params.id)); if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn demo' }); o.order_supplier_data ||= {}; o.order_supplier_data[req.params.supplierId] = { ...req.body, custom_fields: req.body?.custom_fields || {} }; ok(res); });
router.get('/orders/:id/history', (req, res) => ok(res, { data: [] }));
router.post('/orders/:id/send-quote', (req, res) => ok(res));
router.post('/orders/:id/quote-response', (req, res) => ok(res, { ok: true, status: req.body?.decision === 'confirm' ? 'confirmed' : 'in_progress' }));
router.post('/orders/:id/items', (req, res) => { const o = orders.find((x) => String(x.id) === String(req.params.id)); if (!o) return res.status(404).json({ error: 'Không tìm thấy đơn demo' }); if (!String(req.body?.item_name || '').trim()) return res.status(400).json({ error: 'Tên hàng là bắt buộc' }); o.items.push({ id: Date.now(), order_id: o.id, ...req.body, progress: req.body?.progress || 'cho_bao_gia' }); refreshDemoOrder(o); ok(res, { id: o.items[o.items.length - 1].id }); });
router.patch('/orders/items/:itemId/progress', (req, res) => { const o = orders.find((x) => x.items.some((it) => String(it.id) === String(req.params.itemId))); const it = o?.items.find((x) => String(x.id) === String(req.params.itemId)); if (!it) return res.status(404).json({ error: 'Không tìm thấy dòng demo' }); it.progress = demoLineStatus(req.body?.progress); refreshDemoOrder(o); ok(res); });
router.put('/orders/items/:itemId', (req, res) => { const o = orders.find((x) => x.items.some((it) => String(it.id) === String(req.params.itemId))); const it = o?.items.find((x) => String(x.id) === String(req.params.itemId)); if (!it) return res.status(404).json({ error: 'Không tìm thấy dòng demo' }); Object.assign(it, req.body); refreshDemoOrder(o); ok(res); });
router.delete('/orders/items/:itemId', (req, res) => { const o = orders.find((x) => x.items.some((it) => String(it.id) === String(req.params.itemId))); if (!o) return res.status(404).json({ error: 'Không tìm thấy dòng demo' }); o.items = o.items.filter((x) => String(x.id) !== String(req.params.itemId)); refreshDemoOrder(o); ok(res); });
router.post('/orders/items/:itemId/to-catalog', (req, res) => { const o = orders.find((x) => x.items.some((it) => String(it.id) === String(req.params.itemId))); const it = o?.items.find((x) => String(x.id) === String(req.params.itemId)); if (!it) return res.status(404).json({ error: 'Không tìm thấy dòng demo' }); it.item_code ||= 'DEMO-SKU-0001'; it.in_catalog = 1; it.progress = 'da_nhan'; refreshDemoOrder(o); ok(res, { ok: true, item_code: it.item_code }); });
router.post('/orders/items/:itemId/handover', (req, res) => { const o = orders.find((x) => x.items.some((it) => String(it.id) === String(req.params.itemId))); const it = o?.items.find((x) => String(x.id) === String(req.params.itemId)); if (!it) return res.status(404).json({ error: 'Không tìm thấy dòng demo' }); it.progress = 'da_giao'; refreshDemoOrder(o); ok(res); });
router.post('/orders/automation/run', (req, res) => ok(res, { ok: true, orders_scanned: orders.length, reminders_created: 2, order_results: [] }));

router.get('/products', (req, res) => ok(res, list(products)));
router.post('/products', (req, res) => ok(res, { id: Date.now() }));
router.put('/products/:id', (req, res) => ok(res));
router.delete('/products/:id', (req, res) => ok(res));

router.get('/requests', (req, res) => ok(res, list(requests)));
router.post('/requests', (req, res) => ok(res, { id: Date.now(), request_code: 'YC-DEMO-2607-0002' }));
router.get('/requests/:id', (req, res) => ok(res, requests.find((r) => String(r.id) === String(req.params.id)) || requests[0]));
router.patch('/requests/:id/status', (req, res) => ok(res));
router.post('/requests/:id/convert', (req, res) => ok(res, { order_id: 1, order_code: orders[0].order_code }));
router.delete('/requests/:id', (req, res) => ok(res));
router.delete('/requests', (req, res) => ok(res, { ok: true, deleted: 0 }));

router.get('/warehouse/stock', (req, res) => ok(res, { data: stock }));
router.get('/warehouse/moves', (req, res) => ok(res, { data: moves }));
router.get('/warehouse/vouchers', (req, res) => ok(res, { data: [{ voucher_no: 'PNK-2607-0001', move_type: 'PNK', move_date: '2026-07-11', warehouse: 'KHO_HCM', line_count: 1, total_qty: 50 }] }));
router.get('/warehouse/skus', (req, res) => ok(res, { data: products.map((p) => ({ ...p, price: p.default_price, vat: p.vat_rate, qtyDefault: 1 })) }));
router.post('/warehouse/rebuild', (req, res) => ok(res, { ok: true, moves: moves.length }));
router.post('/warehouse/import', (req, res) => ok(res, { ok: true, imported: 2 }));
router.post('/warehouse/vouchers', (req, res) => ok(res, { ok: true, voucher_no: 'PNK-2607-0002', lines: req.body?.lines?.length || 1 }));
router.delete('/warehouse/vouchers/:voucherNo', (req, res) => ok(res));
router.delete('/warehouse/all', (req, res) => ok(res, { ok: true, deleted_moves: 0 }));

router.get('/contracts', (req, res) => ok(res, { data: contracts }));
router.get('/contracts/:id', (req, res) => ok(res, contracts.find((c) => String(c.id) === String(req.params.id)) || contracts[0]));
router.post('/contracts/auto-run', (req, res) => ok(res, { ok: true, created: 1, contracts }));
router.post('/contracts/from-order', (req, res) => ok(res, { id: Date.now(), contract_no: 'DDH-2607-0002', type: 'DDH' }));
router.put('/contracts/:id', (req, res) => ok(res));
router.delete('/contracts/:id', (req, res) => ok(res));
router.post('/contracts/template/:type', (req, res) => ok(res));
router.get('/contracts/:id/document', (req, res) => res.type('html').send('<h1>Hợp đồng demo</h1><p>Đây là bản xem nhanh trong DEMO_MODE.</p>'));

router.post('/emails/preview', (req, res) => ok(res, { to: 'vendor@demo.vn', cc: '', subject: 'Demo email ProcureOS', body_html: '<p>Nội dung email demo</p>' }));
router.post('/emails/send', (req, res) => ok(res, { ok: true, sent: false, to: 'vendor@demo.vn', subject: 'Demo email ProcureOS', po_no: 'PO-DEMO-0001' }));
router.get('/emails/logs', (req, res) => ok(res, { data: [{ id: 1, sent_at: '2026-07-12 09:30:00', order_code: 'RQ-MKT-26-0001', recipient_name: 'Vendor Demo', recipient_email: 'vendor@demo.vn', email_type: 'confirm', status: 'Demo', po_no: 'PO-DEMO-0001' }] }));
router.get('/emails/ratings', (req, res) => ok(res, { data: [{ id: 1, order_code: 'RQ-MKT-26-0001', email: 'requester@garena.vn', project_name: orders[0].project_name, score_avg: 4.5, comment: 'Demo tốt' }] }));

router.get('/notifications/unread-count', (req, res) => ok(res, { unread: notifications.filter((n) => !n.is_read).length }));
router.get('/notifications', (req, res) => ok(res, { data: notifications, unread: notifications.filter((n) => !n.is_read).length }));
router.post('/notifications/:id/read', (req, res) => ok(res));
router.post('/notifications/read-all', (req, res) => ok(res));

router.get('/users', (req, res) => ok(res, { data: [currentUser(), { id: 2, email: 'requester@garena.vn', name: 'Requester Demo', full_name: 'Requester Demo', role: 'requester', team_id: 1, is_active: 1 }] }));
router.post('/users', (req, res) => ok(res, { id: Date.now() }));
router.put('/users/:id', (req, res) => ok(res));
router.delete('/users/:id', (req, res) => ok(res));

router.post('/uploads/:kind/:id', (req, res) => ok(res, { id: Date.now(), url: '/api/uploads/demo' }));
router.delete('/uploads/:kind/:id', (req, res) => ok(res));
router.post('/import', (req, res) => ok(res, { ok: true, teams: 2, suppliers: 2, products: 2, orders: 2 }));
router.post('/suppliers/import', (req, res) => ok(res, { ok: true, imported: 2, updated: 0, skipped: 0 }));
router.get('/ai/status', (req, res) => ok(res, { provider: 'demo', model: 'intent-router-demo', enabled: false }));
router.post('/ai/chat', (req, res) => ok(res, { answer: 'Demo AI: hệ thống có 2 đơn hàng, 2 nhà cung cấp, 2 SKU và automation đang bật ở chế độ xem thử.' }));

router.use((req, res) => res.status(404).json({ error: `Demo route chưa hỗ trợ: ${req.method} ${req.path}` }));

export default router;
