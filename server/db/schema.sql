-- =====================================================================
-- ProcureOS Web — MySQL schema
-- Chuyển đổi từ hệ Google Sheets (ProcureOS Apps Script) sang MySQL chuẩn hóa.
-- Charset utf8mb4 để hỗ trợ tiếng Việt có dấu.
-- =====================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ---------------------------------------------------------------------
-- 1. USERS & AUTH  (không có trong Sheets — thêm để có RBAC cho web)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email         VARCHAR(190) NOT NULL,
  full_name     VARCHAR(190) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  -- admin: toàn quyền | purchasing: mua hàng | warehouse: kho | requester: người yêu cầu
  role          ENUM('admin','purchasing','warehouse','requester') NOT NULL DEFAULT 'requester',
  team_id       BIGINT UNSIGNED NULL,
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 2. TEAMS  (DM_TEAM)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teams (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code         VARCHAR(64) NOT NULL,            -- TEAM (mã, dùng làm prefix mã YC)
  name         VARCHAR(190) NOT NULL DEFAULT '',-- TEN_TEAM
  lead_name    VARCHAR(190) NULL,               -- DIEN_DAI (đại diện/team lead)
  lead_title   VARCHAR(190) NULL,               -- CHUC_VU
  is_active    TINYINT(1) NOT NULL DEFAULT 1,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teams_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 3. SUPPLIERS  (DM_NCC) + terms (HDNT)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name            VARCHAR(255) NOT NULL,        -- NCC
  vendor_no       VARCHAR(64) NULL,             -- VENDOR_NO
  master_contract VARCHAR(190) NULL,            -- MASTER_CONTRACT
  tax_code        VARCHAR(64) NULL,
  address         VARCHAR(500) NULL,
  contact_name    VARCHAR(190) NULL,
  contact_phone   VARCHAR(64) NULL,
  contact_email   VARCHAR(190) NULL,
  payment_term_days INT NOT NULL DEFAULT 14,    -- HDNT.CONG_NO_DAYS (mặc định 14)
  representative  VARCHAR(190) NULL,            -- người ký của NCC
  is_active       TINYINT(1) NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_suppliers_name (name),
  KEY idx_suppliers_vendor_no (vendor_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 4. CATEGORIES  (DM_TU_DIEN_LOAI)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code       VARCHAR(64) NOT NULL,     -- LOAI
  name       VARCHAR(190) NOT NULL,    -- TEN_LOAI
  abbr       VARCHAR(64) NULL,         -- ABBR (dùng sinh mã hàng)
  abbr2      VARCHAR(64) NULL,         -- ABBR2
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 5. PRODUCTS / SKU MASTER  (HANG_NHAP)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku           VARCHAR(100) NOT NULL,          -- MHH / MA_HANG (mã hàng)
  name          VARCHAR(255) NOT NULL,          -- TEN_HANG
  category_id   BIGINT UNSIGNED NULL,           -- -> categories.id (LOAI_HH)
  unit          VARCHAR(64) NULL,               -- DVT
  description   TEXT NULL,                       -- MO_TA_NGAN
  default_price DECIMAL(18,2) NOT NULL DEFAULT 0, -- DON_GIA
  vat_rate      DECIMAL(6,4) NOT NULL DEFAULT 0,  -- THUE_SUAT (0.08 = 8%)
  image_url     VARCHAR(1000) NULL,             -- IMAGE_URL
  drive_file_id VARCHAR(190) NULL,              -- DRIVE_FILE_ID (giữ để tham chiếu ảnh cũ)
  supplier_id   BIGINT UNSIGNED NULL,           -- NCC gốc
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_products_sku (sku),
  KEY idx_products_category (category_id),
  KEY idx_products_supplier (supplier_id),
  KEY idx_products_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 6. ORDERS (header)  — tách từ DATA (nhóm theo MA_DH)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_code       VARCHAR(100) NOT NULL,       -- MA_DH
  requester_email  VARCHAR(190) NULL,           -- EMAIL
  requester_name   VARCHAR(190) NULL,           -- TEN
  team_id          BIGINT UNSIGNED NULL,        -- TEAM
  supplier_id      BIGINT UNSIGNED NULL,        -- NCC
  project_name     VARCHAR(255) NULL,           -- TEN_DU_AN
  pm               VARCHAR(190) NULL,           -- PM
  -- Trạng thái tiến trình chuẩn hóa từ TIEN_TRINH
  status           ENUM('draft','waiting','in_progress','quoted','ordered','received','paid','completed','cancelled')
                     NOT NULL DEFAULT 'draft',
  status_raw       VARCHAR(190) NULL,           -- giữ nguyên chuỗi TIEN_TRINH gốc
  request_date     DATE NULL,                   -- NGAY_YC
  expected_date    DATE NULL,                   -- NGAY_NHAN
  actual_date      DATE NULL,                   -- NGAY_THUC_NHAN
  handover_date    DATE NULL,                   -- NGAY_BAN_GIAO
  receiving_point  VARCHAR(255) NULL,           -- DIEM_NHAN
  pr_no            VARCHAR(100) NULL,           -- SO_PR
  contract_no      VARCHAR(100) NULL,           -- SO_HOP_DONG
  payment_method   VARCHAR(190) NULL,           -- HINH_THUC_TT
  payment_term     VARCHAR(190) NULL,           -- THOI_HAN_TT
  qdnb_link        VARCHAR(1000) NULL,
  total_amount     DECIMAL(18,2) NOT NULL DEFAULT 0, -- tổng TONG_TIEN các dòng
  warehouse_status VARCHAR(100) NULL,           -- NHAP_KHO
  po_no            VARCHAR(100) NULL,           -- PO_NO (sinh khi gửi xác nhận NCC)
  po_date          DATETIME NULL,               -- PO_DATE
  po_status        VARCHAR(64) NULL,            -- PO_STATUS (vd "Đã gửi NCC")
  note             TEXT NULL,                    -- GHI_CHU
  created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_code (order_code),
  KEY idx_orders_status (status),
  KEY idx_orders_team (team_id),
  KEY idx_orders_supplier (supplier_id),
  KEY idx_orders_requester (requester_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_suppliers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  payment_method VARCHAR(64) NULL,
  payment_time VARCHAR(190) NULL,
  contract_no VARCHAR(100) NULL,
  vendor_link VARCHAR(1000) NULL,
  discount_type VARCHAR(16) NULL,
  discount_value DECIMAL(18,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  custom_fields LONGTEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id), UNIQUE KEY uq_order_suppliers (order_id, supplier_id),
  KEY idx_order_suppliers_supplier (supplier_id),
  CONSTRAINT fk_order_suppliers_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_suppliers_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 7. ORDER ITEMS (line)  — mỗi dòng DATA
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id      BIGINT UNSIGNED NOT NULL,       -- -> orders.id
  product_id    BIGINT UNSIGNED NULL,           -- -> products.id (nếu match được SKU)
  category_id   BIGINT UNSIGNED NULL,           -- LOAI_HH
  item_name     VARCHAR(255) NOT NULL,          -- TEN_HANG
  item_code     VARCHAR(100) NULL,              -- MA_HANG
  description   TEXT NULL,                       -- MO_TA_NGAN
  unit          VARCHAR(64) NULL,               -- DVT
  quantity      DECIMAL(18,3) NOT NULL DEFAULT 0, -- SO_LUONG
  unit_price    DECIMAL(18,2) NOT NULL DEFAULT 0, -- DON_GIA
  vat_rate      DECIMAL(6,4) NOT NULL DEFAULT 0,  -- VAT
  discount_rate DECIMAL(6,4) NOT NULL DEFAULT 0,  -- CHIET_KHAU
  line_total    DECIMAL(18,2) NOT NULL DEFAULT 0, -- TONG_TIEN
  image_url     VARCHAR(1000) NULL,             -- IMAGE_URL
  drive_file_id VARCHAR(190) NULL,
  quotation_url VARCHAR(1000) NULL,             -- FILE_BG
  reason_choose VARCHAR(500) NULL,              -- LY_DO_CHON
  progress      VARCHAR(190) NULL,              -- tiến trình riêng của dòng
  note          TEXT NULL,                       -- GHI_CHU dòng
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_items_order (order_id),
  KEY idx_items_product (product_id),
  CONSTRAINT fk_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 8. PURCHASE REQUESTS (header)  — Request sheet (nhóm theo MA_YC)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS purchase_requests (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_code   VARCHAR(100) NOT NULL,         -- MA_YC (TEAM-YYMM-NNNN)
  requester_name VARCHAR(190) NULL,             -- TEN
  requester_email VARCHAR(190) NULL,            -- EMAIL
  team_id        BIGINT UNSIGNED NULL,          -- TEAM
  project_name   VARCHAR(255) NULL,             -- TEN_DU_AN
  request_date   DATE NULL,                     -- NGAY_YC
  expected_date  DATE NULL,                     -- NGAY_NHAN
  receiving_point VARCHAR(255) NULL,            -- DIEM_NHAN
  design_link    VARCHAR(1000) NULL,            -- LINK_THIET_KE
  status         ENUM('new','confirmed','rejected','completed') NOT NULL DEFAULT 'new', -- TRANG_THAI
  confirmed_date DATE NULL,                      -- NGAY_XAC_NHAN
  purchasing_note TEXT NULL,                     -- GHI_CHU_PUR
  note           TEXT NULL,                       -- GHI_CHU
  order_id       BIGINT UNSIGNED NULL,          -- đơn hàng được tạo ra từ YC này
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_requests_code (request_code),
  KEY idx_requests_status (status),
  KEY idx_requests_team (team_id),
  KEY idx_requests_email (requester_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS request_items (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_id     BIGINT UNSIGNED NOT NULL,      -- -> purchase_requests.id
  line_no        INT NOT NULL DEFAULT 1,        -- STT_DONG
  item_name      VARCHAR(255) NOT NULL,         -- TEN_HANG
  description    TEXT NULL,                       -- MO_TA
  quantity       DECIMAL(18,3) NOT NULL DEFAULT 0, -- SO_LUONG
  budget         DECIMAL(18,2) NULL,            -- NGAN_SACH
  suggested_supplier VARCHAR(255) NULL,         -- NCC_DE_XUAT
  note           VARCHAR(500) NULL,             -- GHI_CHU_DONG
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reqitems_request (request_id),
  CONSTRAINT fk_reqitems_request FOREIGN KEY (request_id) REFERENCES purchase_requests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 9. CONTRACTS  (hợp đồng tạo từ template)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contracts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id      BIGINT UNSIGNED NULL,
  supplier_id   BIGINT UNSIGNED NULL,
  contract_no   VARCHAR(100) NULL,              -- SO_HOP_DONG
  type          ENUM('DDH','HD') NOT NULL DEFAULT 'DDH', -- đơn đặt hàng / hợp đồng dịch vụ
  file_url      VARCHAR(1000) NULL,             -- link file (Drive/khác)
  amount        DECIMAL(18,2) NULL,             -- tổng sau thuế
  subtotal      DECIMAL(18,2) NULL,             -- tổng trước thuế
  vat_amount    DECIMAL(18,2) NULL,             -- tiền thuế
  payment_method VARCHAR(190) NULL,             -- HINH_THUC_TT
  our_signer    VARCHAR(190) NULL,              -- DAI_DIEN_CTY_KY
  vendor_signer VARCHAR(190) NULL,              -- người đại diện NCC
  document_html LONGTEXT NULL,                  -- văn bản hợp đồng (thay Google Docs)
  sign_date     DATE NULL,                      -- NGAY_KY_HD
  status        VARCHAR(64) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_contracts_order (order_id),
  KEY idx_contracts_supplier (supplier_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 10. EMAIL LOGS  (LỊCH SỬ GỬI ĐƠN)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_logs (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sent_at     DATETIME NULL,                    -- Thời gian
  order_code  VARCHAR(100) NULL,               -- Mã đơn hàng
  recipient_name VARCHAR(190) NULL,            -- Tên
  recipient_email VARCHAR(190) NULL,           -- Email
  project_name VARCHAR(255) NULL,              -- Tên dự án
  email_type  VARCHAR(100) NULL,               -- Loại email (CONFIRM/HANDOVER/SURVEY...)
  status      VARCHAR(100) NULL,               -- Trạng thái
  note        VARCHAR(500) NULL,               -- Ghi chú
  cc_list     VARCHAR(500) NULL,               -- danh sách CC
  body_html   LONGTEXT NULL,                   -- nội dung email đã soạn
  po_no       VARCHAR(100) NULL,               -- số PO (email xác nhận NCC)
  thread_id   VARCHAR(190) NULL,               -- Gmail thread id
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_emaillogs_order (order_code),
  KEY idx_emaillogs_type (email_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 11. RATINGS  (Điểm đánh giá)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ratings (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  rated_at      DATETIME NULL,                  -- Thời gian
  order_code    VARCHAR(100) NULL,             -- Mã đơn hàng
  email         VARCHAR(190) NULL,
  project_name  VARCHAR(255) NULL,
  score_quality  TINYINT NULL,                 -- Chất lượng 1-5
  score_price    TINYINT NULL,                 -- Giá cả
  score_delivery TINYINT NULL,                 -- Giao hàng
  score_support  TINYINT NULL,                 -- Nhân sự hỗ trợ
  score_avg     DECIMAL(4,2) NULL,             -- Trung bình
  comment       TEXT NULL,                      -- Nhận xét
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ratings_order (order_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 12. WAREHOUSE — stock, moves, vouchers  (HANG_TON / XNT / PNK / PXK)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS warehouse_stock (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sku           VARCHAR(100) NOT NULL,          -- MHH
  warehouse     VARCHAR(100) NULL,              -- KHO
  team_id       BIGINT UNSIGNED NULL,           -- TEAM
  item_name     VARCHAR(255) NULL,             -- TEN_HANG
  unit          VARCHAR(64) NULL,              -- DVT
  qty_in        DECIMAL(18,3) NOT NULL DEFAULT 0, -- SO_LUONG_NHAP
  qty_out       DECIMAL(18,3) NOT NULL DEFAULT 0, -- SO_LUONG_XUAT
  qty_on_hand   DECIMAL(18,3) NOT NULL DEFAULT 0, -- SO_LUONG_TON
  unit_price    DECIMAL(18,2) NOT NULL DEFAULT 0,
  vat_rate      DECIMAL(6,4) NOT NULL DEFAULT 0,
  total_value   DECIMAL(18,2) NOT NULL DEFAULT 0, -- TONG_TIEN
  bin           VARCHAR(100) NULL,             -- BIN
  supplier_id   BIGINT UNSIGNED NULL,          -- NCC
  so_pr         VARCHAR(100) NULL,             -- SO_PR
  pm            VARCHAR(190) NULL,             -- PM
  image_url     VARCHAR(1000) NULL,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_stock_sku_wh (sku, warehouse),
  KEY idx_stock_sku (sku)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inventory_moves (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  move_date     DATE NULL,                      -- NGAY_CT
  voucher_no    VARCHAR(100) NULL,             -- SO_CT
  move_type     ENUM('PNK','PXK') NOT NULL,     -- LOAI (nhập/xuất)
  warehouse     VARCHAR(100) NULL,             -- KHO
  handler_name  VARCHAR(190) NULL,            -- TEN
  handler_email VARCHAR(190) NULL,            -- EMAIL
  sku           VARCHAR(100) NULL,            -- MHH
  item_name     VARCHAR(255) NULL,           -- TEN_HANG
  unit          VARCHAR(64) NULL,            -- DVT
  qty_in        DECIMAL(18,3) NOT NULL DEFAULT 0, -- SL_NHAP
  qty_out       DECIMAL(18,3) NOT NULL DEFAULT 0, -- SL_XUAT
  unit_price    DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_total    DECIMAL(18,2) NOT NULL DEFAULT 0,
  vat_rate      DECIMAL(6,4) NOT NULL DEFAULT 0,
  running_balance DECIMAL(18,3) NULL,          -- TON
  team_id       BIGINT UNSIGNED NULL,
  supplier_id   BIGINT UNSIGNED NULL,
  bin           VARCHAR(100) NULL,
  so_pr         VARCHAR(100) NULL,             -- SO_PR
  pm            VARCHAR(190) NULL,             -- PM
  qdnb_tbkm     VARCHAR(190) NULL,             -- QDNB_TBKM (PNK)
  ticket_xk     VARCHAR(190) NULL,            -- TICKET_XK (PXK)
  note          VARCHAR(500) NULL,
  image_url     VARCHAR(1000) NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_moves_sku (sku),
  KEY idx_moves_voucher (voucher_no),
  KEY idx_moves_type (move_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 13. SETTINGS  (BOT config + tham số hệ thống, dạng key-value)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `key`       VARCHAR(190) NOT NULL,
  value       LONGTEXT NULL,
  description VARCHAR(500) NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_settings_key (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 14. CATALOG ACCESS LOG  (CATALOG_ACCESS_LOG)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_access_log (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  accessed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email      VARCHAR(190) NULL,
  action     VARCHAR(190) NULL,
  detail     VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_catalog_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 15. ATTACHMENTS  (ảnh sản phẩm / file đính kèm, lưu base64 trong DB)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  kind        VARCHAR(32) NOT NULL,            -- 'product' | 'order_item'
  ref_id      BIGINT UNSIGNED NULL,            -- id của product / order_item
  filename    VARCHAR(255) NULL,
  mime        VARCHAR(100) NULL,
  data_base64 LONGTEXT NOT NULL,               -- nội dung ảnh (base64, không kèm tiền tố)
  uploaded_by VARCHAR(190) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attach_ref (kind, ref_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 16. WORKFLOW STATES  (tiến trình đơn hàng — admin cấu hình được)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_states (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code        VARCHAR(50) NOT NULL,            -- mã trạng thái (dùng trong orders.status)
  name        VARCHAR(120) NOT NULL,           -- tên hiển thị
  color       VARCHAR(20) NOT NULL DEFAULT '#64748b', -- màu badge
  sort_order  INT NOT NULL DEFAULT 0,
  actor       VARCHAR(30) NULL,                -- vai trò phụ trách bước này (buyer/requester/warehouse…)
  is_terminal TINYINT(1) NOT NULL DEFAULT 0,   -- trạng thái kết thúc (hoàn tất/huỷ)
  is_active   TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wf_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 17. ORDER STATUS HISTORY  (nhật ký chuyển tiến trình)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_status_history (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id    BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(50) NULL,
  to_status   VARCHAR(50) NOT NULL,
  changed_by  VARCHAR(190) NULL,
  note        VARCHAR(500) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_osh_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Thông báo in-app + "tác vụ chờ xác nhận" (vd: Requester xác nhận báo giá).
CREATE TABLE IF NOT EXISTS notifications (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  recipient_email VARCHAR(190) NOT NULL,
  type            VARCHAR(50) NOT NULL DEFAULT 'info',
  title           VARCHAR(255) NOT NULL,
  body            VARCHAR(1000) NULL,
  order_id        BIGINT UNSIGNED NULL,
  link            VARCHAR(255) NULL,
  requires_action TINYINT(1) NOT NULL DEFAULT 0,
  action_status   VARCHAR(20) NOT NULL DEFAULT 'none', -- none | pending | confirmed | rejected
  action_note     VARCHAR(500) NULL,
  is_read         TINYINT(1) NOT NULL DEFAULT 0,
  created_by      VARCHAR(190) NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at         DATETIME NULL,
  resolved_at     DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_notif_recipient (recipient_email, is_read),
  KEY idx_notif_order (order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 18. SIGNATORIES  (người ký mặc định theo vai trò — điền tự động vào hợp đồng .docx & phiếu kho)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS signatories (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_key   VARCHAR(30) NOT NULL,   -- 'contract' (ký HĐ/ĐĐH bên công ty) | 'thu_kho' | 'ke_toan' | 'truong_phong'
  scope      VARCHAR(50) NOT NULL DEFAULT 'default', -- mã team (vd AOV) áp dụng riêng, hoặc 'default'
  name       VARCHAR(190) NOT NULL,
  title      VARCHAR(190) NULL,      -- Giám đốc / Tổng giám đốc / Thủ kho / Kế toán trưởng...
  phone      VARCHAR(64) NULL,
  email      VARCHAR(190) NULL,
  is_active  TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_signatory_role_scope (role_key, scope)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- 19. BACKUP MySQL -> Google Sheets
-- backup_config: danh sách bảng cần backup (thêm bảng mới = thêm 1 dòng, không sửa code).
-- backup_state: cột hiện tại + trạng thái lần đồng bộ gần nhất của mỗi bảng.
-- backup_log: nhật ký phát hiện bảng mới / cột mới / lỗi đồng bộ.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup_config (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  table_name     VARCHAR(190) NOT NULL,
  is_enabled     TINYINT(1) NOT NULL DEFAULT 1,
  sheet_tab_name VARCHAR(100) NULL,   -- tên tab trên Google Sheet; để trống = dùng table_name
  note           VARCHAR(255) NULL,
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_backup_config_table (table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_state (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  table_name      VARCHAR(190) NOT NULL,
  columns_json    LONGTEXT NULL,      -- danh sách cột ở lần đồng bộ gần nhất (để so sánh phát hiện cột mới)
  row_count       INT NOT NULL DEFAULT 0,
  last_synced_at  DATETIME NULL,
  last_status     VARCHAR(20) NULL,   -- ok | error
  last_error      TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_backup_state_table (table_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_log (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_type  VARCHAR(30) NOT NULL,   -- new_table | new_column | sync_error
  table_name  VARCHAR(190) NULL,
  detail      VARCHAR(1000) NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_backup_log_table (table_name),
  KEY idx_backup_log_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Khoá dùng chung giữa mọi instance/replica của app (deploy có thể chạy >1 container cho
-- cùng 1 project) để chỉ 1 lượt đồng bộ Google Sheets chạy tại một thời điểm.
CREATE TABLE IF NOT EXISTS backup_lock (
  id         TINYINT UNSIGNED NOT NULL,
  locked_at  DATETIME NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Foreign keys "mềm" (thêm sau khi bảng đã tồn tại; bỏ qua nếu dữ liệu chưa khớp)
-- ---------------------------------------------------------------------
ALTER TABLE users        ADD CONSTRAINT fk_users_team     FOREIGN KEY (team_id)     REFERENCES teams(id)      ON DELETE SET NULL;
ALTER TABLE products     ADD CONSTRAINT fk_products_cat   FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE products     ADD CONSTRAINT fk_products_sup   FOREIGN KEY (supplier_id) REFERENCES suppliers(id)  ON DELETE SET NULL;
ALTER TABLE orders       ADD CONSTRAINT fk_orders_team    FOREIGN KEY (team_id)     REFERENCES teams(id)      ON DELETE SET NULL;
ALTER TABLE orders       ADD CONSTRAINT fk_orders_sup     FOREIGN KEY (supplier_id) REFERENCES suppliers(id)  ON DELETE SET NULL;
ALTER TABLE order_items  ADD CONSTRAINT fk_items_cat      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL;
ALTER TABLE order_items  ADD CONSTRAINT fk_items_product  FOREIGN KEY (product_id)  REFERENCES products(id)   ON DELETE SET NULL;
ALTER TABLE purchase_requests ADD CONSTRAINT fk_req_team  FOREIGN KEY (team_id)     REFERENCES teams(id)      ON DELETE SET NULL;

SET FOREIGN_KEY_CHECKS = 1;
