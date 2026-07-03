-- =====================================================================
-- ProcureOS Web — dữ liệu mẫu (seed)
-- User admin được backend tạo tự động lúc khởi động (bcrypt).
-- Chạy sau schema.sql. An toàn chạy lại nhiều lần nhờ INSERT ... ON DUPLICATE.
-- =====================================================================
SET NAMES utf8mb4;

-- ---- Teams ----
INSERT INTO teams (code, name, lead_name, lead_title) VALUES
  ('MKT',  'Marketing',        'Nguyễn Văn A', 'Trưởng nhóm'),
  ('EVENT','Event & Activation','Trần Thị B',   'Trưởng nhóm'),
  ('IT',   'Information Tech',  'Lê Văn C',      'IT Lead'),
  ('ADMIN','Hành chính',       'Phạm Thị D',    'Trưởng phòng'),
  ('PUR',  'Purchasing',        'Minh Trí',      'Purchasing Lead')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ---- Categories (DM_TU_DIEN_LOAI) ----
INSERT INTO categories (code, name, abbr) VALUES
  ('QUA',  'Quà tặng / Gift',          'QT'),
  ('PKIEN','Phụ kiện sự kiện',          'PK'),
  ('INAN', 'In ấn / Printing',          'IN'),
  ('TBI',  'Thiết bị / Equipment',      'TB'),
  ('VPP',  'Văn phòng phẩm',            'VP'),
  ('KHAC', 'Khác',                       'KH')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ---- Suppliers (DM_NCC + HDNT) ----
INSERT INTO suppliers (name, vendor_no, tax_code, contact_name, contact_email, contact_phone, payment_term_days, representative) VALUES
  ('Công ty TNHH Quà Tặng Việt', 'V001', '0301234567', 'Anh Hùng', 'sales@quatangviet.vn', '0901234567', 14, 'Nguyễn Quốc Hùng'),
  ('Xưởng In Minh Anh',           'V002', '0302345678', 'Chị Lan',  'inan@minhanh.vn',      '0912345678', 30, 'Trần Thị Lan'),
  ('Công ty Thiết Bị Số ABC',     'V003', '0303456789', 'Anh Tuấn', 'sales@abctech.vn',     '0923456789', 7,  'Lê Anh Tuấn'),
  ('Nhà Cung Cấp VPP Hòa Bình',   'V004', '0304567890', 'Chị Mai',  'order@hoabinhvpp.vn',  '0934567890', 14, 'Phạm Thị Mai')
ON DUPLICATE KEY UPDATE vendor_no=VALUES(vendor_no);

-- ---- Products / SKU (HANG_NHAP) ----
INSERT INTO products (sku, name, category_id, unit, description, default_price, vat_rate, supplier_id) VALUES
  ('SKU-QT-0001', 'Áo thun sự kiện in logo',        (SELECT id FROM categories WHERE code='QUA'),   'cái',  'Áo thun cotton in logo Garena', 85000,  0.08, (SELECT id FROM suppliers WHERE vendor_no='V001')),
  ('SKU-QT-0002', 'Bình giữ nhiệt khắc tên',        (SELECT id FROM categories WHERE code='QUA'),   'cái',  'Bình giữ nhiệt 500ml',          150000, 0.08, (SELECT id FROM suppliers WHERE vendor_no='V001')),
  ('SKU-IN-0001', 'Standee 60x160cm',               (SELECT id FROM categories WHERE code='INAN'),  'cái',  'Standee nhôm kèm bạt in',       220000, 0.08, (SELECT id FROM suppliers WHERE vendor_no='V002')),
  ('SKU-IN-0002', 'Backdrop 3x2.5m',                (SELECT id FROM categories WHERE code='INAN'),  'bộ',   'Khung backdrop + bạt hiflex',   1200000,0.08, (SELECT id FROM suppliers WHERE vendor_no='V002')),
  ('SKU-TB-0001', 'Loa kéo di động',                (SELECT id FROM categories WHERE code='TBI'),   'cái',  'Loa kéo công suất 300W',        2500000,0.10, (SELECT id FROM suppliers WHERE vendor_no='V003')),
  ('SKU-VP-0001', 'Giấy A4 Double A',               (SELECT id FROM categories WHERE code='VPP'),   'ream', 'Giấy A4 70gsm',                 68000,  0.08, (SELECT id FROM suppliers WHERE vendor_no='V004'))
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- ---- Orders + items ----
INSERT INTO orders (order_code, requester_email, requester_name, team_id, supplier_id, project_name, status, status_raw, request_date, expected_date, total_amount, note)
VALUES
  ('DH-2607-0001', 'requester1@garena.vn', 'Nguyễn Văn A', (SELECT id FROM teams WHERE code='MKT'),   (SELECT id FROM suppliers WHERE vendor_no='V001'), 'Sự kiện Summer Fest', 'ordered',     'Đã đặt hàng', '2026-06-20', '2026-07-10', 0, 'Ưu tiên giao trước ngày sự kiện'),
  ('DH-2607-0002', 'requester2@garena.vn', 'Trần Thị B',   (SELECT id FROM teams WHERE code='EVENT'), (SELECT id FROM suppliers WHERE vendor_no='V002'), 'Roadshow Q3',          'in_progress', 'Đang xử lý',  '2026-06-25', '2026-07-15', 0, NULL),
  ('DH-2607-0003', 'requester3@garena.vn', 'Lê Văn C',     (SELECT id FROM teams WHERE code='IT'),    (SELECT id FROM suppliers WHERE vendor_no='V003'), 'Nâng cấp phòng họp',   'quoted',      'Đã báo giá',  '2026-06-28', '2026-07-20', 0, NULL)
ON DUPLICATE KEY UPDATE project_name=VALUES(project_name);

INSERT INTO order_items (order_id, item_name, item_code, unit, quantity, unit_price, vat_rate, line_total)
VALUES
  ((SELECT id FROM orders WHERE order_code='DH-2607-0001'), 'Áo thun sự kiện in logo', 'SKU-QT-0001', 'cái', 200, 85000,  0.08, 18360000),
  ((SELECT id FROM orders WHERE order_code='DH-2607-0001'), 'Bình giữ nhiệt khắc tên', 'SKU-QT-0002', 'cái', 100, 150000, 0.08, 16200000),
  ((SELECT id FROM orders WHERE order_code='DH-2607-0002'), 'Standee 60x160cm',        'SKU-IN-0001', 'cái', 10,  220000, 0.08, 2376000),
  ((SELECT id FROM orders WHERE order_code='DH-2607-0002'), 'Backdrop 3x2.5m',         'SKU-IN-0002', 'bộ',  2,   1200000,0.08, 2592000),
  ((SELECT id FROM orders WHERE order_code='DH-2607-0003'), 'Loa kéo di động',         'SKU-TB-0001', 'cái', 2,   2500000,0.10, 5500000);

-- cập nhật tổng tiền đơn hàng từ các dòng
UPDATE orders o
  SET total_amount = (SELECT COALESCE(SUM(line_total),0) FROM order_items i WHERE i.order_id = o.id)
  WHERE o.order_code IN ('DH-2607-0001','DH-2607-0002','DH-2607-0003');

-- ---- Purchase Requests + items ----
INSERT INTO purchase_requests (request_code, requester_name, requester_email, team_id, project_name, request_date, expected_date, status, note)
VALUES
  ('MKT-2607-0001', 'Nguyễn Văn A', 'requester1@garena.vn', (SELECT id FROM teams WHERE code='MKT'),   'Sự kiện Summer Fest', '2026-07-01', '2026-07-12', 'new',       'Cần gấp cho sự kiện'),
  ('IT-2607-0001',  'Lê Văn C',     'requester3@garena.vn', (SELECT id FROM teams WHERE code='IT'),    'Trang bị laptop mới', '2026-07-02', '2026-07-25', 'confirmed', NULL)
ON DUPLICATE KEY UPDATE project_name=VALUES(project_name);

INSERT INTO request_items (request_id, line_no, item_name, description, quantity, budget, suggested_supplier)
VALUES
  ((SELECT id FROM purchase_requests WHERE request_code='MKT-2607-0001'), 1, 'Áo thun sự kiện', 'In logo 2 mặt', 200, 18000000, 'Công ty TNHH Quà Tặng Việt'),
  ((SELECT id FROM purchase_requests WHERE request_code='MKT-2607-0001'), 2, 'Nón lưỡi trai',  'Thêu logo',      100, 8000000,  NULL),
  ((SELECT id FROM purchase_requests WHERE request_code='IT-2607-0001'),  1, 'Laptop Dell Latitude', 'Core i7, 16GB RAM', 5, 90000000, 'Công ty Thiết Bị Số ABC');

-- ---- Settings ----
INSERT INTO settings (`key`, value, description) VALUES
  ('app_name',        'ProcureOS', 'Tên hệ thống'),
  ('allowed_domain',  'garena.vn', 'Domain email được phép đăng ký'),
  ('currency',        'VND',       'Đơn vị tiền tệ'),
  ('default_vat',     '0.08',      'VAT mặc định')
ON DUPLICATE KEY UPDATE value=VALUES(value);
