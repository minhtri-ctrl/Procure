import mysql from 'mysql2/promise';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { config } from './config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = path.join(__dirname, '..', 'db');

export const pool = mysql.createPool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4',
  multipleStatements: true,
  dateStrings: true,
});

export async function query(sql, params) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

// Đợi DB sẵn sàng (managed DB có thể khởi động chậm sau deploy).
async function waitForDb(retries = 30, delayMs = 2000) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query('SELECT 1');
      return;
    } catch (e) {
      console.log(`[db] chờ kết nối MySQL... (${i + 1}/${retries}) ${e.code || e.message}`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error('Không kết nối được MySQL sau nhiều lần thử.');
}

function splitStatements(sqlText) {
  // Bỏ các dòng comment "-- ..." TRƯỚC khi tách, nếu không cả cụm (comment + lệnh)
  // sẽ bắt đầu bằng "--" và bị loại nhầm, khiến CREATE TABLE không chạy.
  const noComments = sqlText
    .split(/\r?\n/)
    .filter((line) => !/^\s*--/.test(line))
    .join('\n');
  // Tách theo dấu ; ở cuối dòng — đủ dùng cho schema/seed (không có stored proc).
  return noComments
    .split(/;\s*(?:\r?\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s.length);
}

async function runSqlFile(file, { ignoreErrors = false } = {}) {
  const full = path.join(DB_DIR, file);
  if (!fs.existsSync(full)) return;
  const text = fs.readFileSync(full, 'utf8');
  for (const stmt of splitStatements(text)) {
    try {
      await pool.query(stmt);
    } catch (e) {
      // ALTER thêm FK có thể lỗi nếu chạy lại — bỏ qua các lỗi lặp/đã tồn tại.
      const benign = ['ER_DUP_KEYNAME', 'ER_FK_DUP_NAME', 'ER_CANT_CREATE_TABLE', 'ER_DUP_ENTRY'];
      if (ignoreErrors || benign.includes(e.code)) continue;
      console.error(`[db] lỗi khi chạy ${file}:`, e.code, e.sqlMessage || e.message);
      throw e;
    }
  }
}

async function ensureAdmin() {
  const rows = await query('SELECT COUNT(*) AS c FROM users');
  if (rows[0].c > 0) return;
  const hash = await bcrypt.hash(config.admin.password, 10);
  await query(
    'INSERT INTO users (email, full_name, password_hash, role, is_active) VALUES (?,?,?,?,1)',
    [config.admin.email, config.admin.name, hash, 'admin']
  );
  console.log(`[db] Đã tạo admin mặc định: ${config.admin.email} / ${config.admin.password}`);
}

// Migration idempotent: thêm cột cho DB đã deploy (bỏ qua nếu cột đã tồn tại).
const MIGRATIONS = [
  "ALTER TABLE orders ADD COLUMN po_no VARCHAR(100) NULL",
  "ALTER TABLE orders ADD COLUMN po_date DATETIME NULL",
  "ALTER TABLE orders ADD COLUMN po_status VARCHAR(64) NULL",
  "ALTER TABLE inventory_moves ADD COLUMN so_pr VARCHAR(100) NULL",
  "ALTER TABLE inventory_moves ADD COLUMN pm VARCHAR(190) NULL",
  "ALTER TABLE inventory_moves ADD COLUMN qdnb_tbkm VARCHAR(190) NULL",
  "ALTER TABLE inventory_moves ADD COLUMN ticket_xk VARCHAR(190) NULL",
  "ALTER TABLE warehouse_stock ADD COLUMN so_pr VARCHAR(100) NULL",
  "ALTER TABLE warehouse_stock ADD COLUMN pm VARCHAR(190) NULL",
  "ALTER TABLE contracts ADD COLUMN subtotal DECIMAL(18,2) NULL",
  "ALTER TABLE contracts ADD COLUMN vat_amount DECIMAL(18,2) NULL",
  "ALTER TABLE contracts ADD COLUMN payment_method VARCHAR(190) NULL",
  "ALTER TABLE contracts ADD COLUMN our_signer VARCHAR(190) NULL",
  "ALTER TABLE contracts ADD COLUMN vendor_signer VARCHAR(190) NULL",
  "ALTER TABLE contracts ADD COLUMN document_html LONGTEXT NULL",
  "ALTER TABLE email_logs ADD COLUMN cc_list VARCHAR(500) NULL",
  "ALTER TABLE email_logs ADD COLUMN body_html LONGTEXT NULL",
  "ALTER TABLE email_logs ADD COLUMN po_no VARCHAR(100) NULL",
  // Nâng cấp workflow + đầy đủ trường tạo đơn
  "ALTER TABLE orders MODIFY status VARCHAR(50) NOT NULL DEFAULT 'new'",
  "ALTER TABLE orders ADD COLUMN hang_muc VARCHAR(190) NULL",
  "ALTER TABLE order_items ADD COLUMN supplier_id BIGINT UNSIGNED NULL",
  "ALTER TABLE order_items ADD COLUMN master_contract VARCHAR(190) NULL",
  "ALTER TABLE order_items ADD COLUMN so_pr VARCHAR(100) NULL",
  "ALTER TABLE order_items ADD COLUMN design_link VARCHAR(1000) NULL",
  "ALTER TABLE order_items ADD COLUMN thanh_tien DECIMAL(18,2) NULL",
  "ALTER TABLE order_items ADD COLUMN tien_thue DECIMAL(18,2) NULL",
  "ALTER TABLE order_items ADD COLUMN loai_hh VARCHAR(190) NULL",
  "ALTER TABLE order_items ADD COLUMN rental_start DATE NULL",
  "ALTER TABLE order_items ADD COLUMN rental_end DATE NULL",
  // Form yêu cầu mua đầy đủ như đơn hàng
  "ALTER TABLE purchase_requests ADD COLUMN hang_muc VARCHAR(190) NULL",
  "ALTER TABLE purchase_requests ADD COLUMN pm VARCHAR(190) NULL",
  "ALTER TABLE request_items ADD COLUMN loai_hh VARCHAR(190) NULL",
  "ALTER TABLE request_items ADD COLUMN unit VARCHAR(64) NULL",
  // Đợt 2 (v2): vai trò PM, custom fields, QĐNB, thông tin NCC mở rộng, aliases loại hàng
  "ALTER TABLE users MODIFY role ENUM('admin','purchasing','warehouse','requester','pm') NOT NULL DEFAULT 'requester'",
  "ALTER TABLE orders ADD COLUMN qdnb_tbkm VARCHAR(190) NULL",
  "ALTER TABLE orders ADD COLUMN custom_fields LONGTEXT NULL",
  "ALTER TABLE order_items ADD COLUMN qdnb_tbkm VARCHAR(190) NULL",
  "ALTER TABLE order_items ADD COLUMN nhap_kho VARCHAR(100) NULL",
  "ALTER TABLE order_items ADD COLUMN in_catalog TINYINT(1) NOT NULL DEFAULT 0",
  "ALTER TABLE categories ADD COLUMN aliases TEXT NULL",
  "ALTER TABLE suppliers ADD COLUMN bank_name VARCHAR(190) NULL",
  "ALTER TABLE suppliers ADD COLUMN bank_account VARCHAR(100) NULL",
  "ALTER TABLE suppliers ADD COLUMN bank_branch VARCHAR(190) NULL",
  "ALTER TABLE suppliers ADD COLUMN rep_title VARCHAR(190) NULL",
  "ALTER TABLE suppliers ADD COLUMN delivery_person VARCHAR(190) NULL",
  "ALTER TABLE suppliers ADD COLUMN delivery_phone VARCHAR(64) NULL",
  "ALTER TABLE suppliers ADD COLUMN delivery_email VARCHAR(190) NULL",
  // Soft delete (xóa mềm) cho môi trường test — có thể khôi phục
  "ALTER TABLE orders ADD COLUMN deleted_at DATETIME NULL",
  "ALTER TABLE orders ADD COLUMN deleted_by VARCHAR(190) NULL",
  "ALTER TABLE purchase_requests ADD COLUMN deleted_at DATETIME NULL",
  "ALTER TABLE purchase_requests ADD COLUMN deleted_by VARCHAR(190) NULL",
  // settings.value là TEXT (giới hạn 64KB) làm base64 mẫu .docx (~350-490KB) bị cắt cụt -> "Corrupted zip"
  // khi tải hợp đồng .docx. Mở rộng sang LONGTEXT để chứa trọn file mẫu.
  "ALTER TABLE settings MODIFY value LONGTEXT NULL",
];

async function runMigrations() {
  for (const sql of MIGRATIONS) {
    try {
      await pool.query(sql);
    } catch (e) {
      // ER_DUP_FIELDNAME (1060): cột đã tồn tại -> bỏ qua.
      if (e.code === 'ER_DUP_FIELDNAME' || e.errno === 1060) continue;
      console.error('[db] migration lỗi:', e.code, e.sqlMessage || e.message);
    }
  }
}

// Tiến trình mặc định — bám flow: tạo đơn -> buyer xử lý -> báo giá -> requester xác nhận
// -> đặt hàng vendor -> nhận hàng -> nhập kho -> đủ chứng từ -> thanh toán -> hoàn tất.
const DEFAULT_WORKFLOW = [
  ['new', 'Mới', '#64748b', 10, 'buyer', 0],
  ['in_progress', 'Đang xử lý', '#2563eb', 20, 'buyer', 0],
  ['quoted', 'Đã báo giá', '#7c3aed', 30, 'buyer', 0],
  ['pending_confirmation', 'Chờ xác nhận báo giá', '#db2777', 35, 'requester', 0],
  ['confirmed', 'Requester xác nhận', '#0891b2', 40, 'requester', 0],
  ['ordered', 'Đã đặt hàng NCC', '#d97706', 50, 'buyer', 0],
  ['received', 'Đã nhận hàng', '#0d9488', 60, 'buyer', 0],
  ['warehoused', 'Đã nhập kho', '#16a34a', 70, 'warehouse', 0],
  ['documented', 'Đủ chứng từ', '#4338ca', 80, 'buyer', 0],
  ['paid', 'Đã thanh toán', '#15803d', 90, 'buyer', 0],
  ['completed', 'Hoàn tất', '#166534', 100, 'buyer', 1],
  ['rejected', 'Từ chối', '#b91c1c', 110, 'requester', 1],
  ['cancelled', 'Đã huỷ', '#991b1b', 120, 'buyer', 1],
];

async function ensureWorkflow() {
  const [{ c }] = await query('SELECT COUNT(*) AS c FROM workflow_states');
  if (c === 0) {
    for (const [code, name, color, sort, actor, term] of DEFAULT_WORKFLOW) {
      await query('INSERT INTO workflow_states (code, name, color, sort_order, actor, is_terminal) VALUES (?,?,?,?,?,?)',
        [code, name, color, sort, actor, term]);
    }
    console.log('[db] Đã tạo workflow mặc định.');
    return;
  }
  // DB đã có workflow — bổ sung các state mới thêm về sau (idempotent, không đè state đã có).
  const EXTRA = [['pending_confirmation', 'Chờ xác nhận báo giá', '#db2777', 35, 'requester', 0]];
  for (const [code, name, color, sort, actor, term] of EXTRA) {
    await query('INSERT INTO workflow_states (code, name, color, sort_order, actor, is_terminal) VALUES (?,?,?,?,?,?) ON DUPLICATE KEY UPDATE code = code',
      [code, name, color, sort, actor, term]);
  }
}

// Theme mặc định (CSS variables) — admin chỉnh trong trang Giao diện.
const DEFAULT_THEME = {
  primary: '#ff5722', sidebar: '#16202e', bg: '#f4f6fb', accent: '#2563eb', radius: '10px',
};

async function ensureTheme() {
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', ['ui_theme']);
  if (rows.length) return;
  await query('INSERT INTO settings (`key`, value, description) VALUES (?,?,?)',
    ['ui_theme', JSON.stringify(DEFAULT_THEME), 'Cấu hình màu giao diện']);
}

// Thông tin công ty (bên A) dùng để điền hợp đồng/ĐĐH — admin sửa qua trang Cấu hình công ty.
const DEFAULT_COMPANY_INFO = {
  name: 'Công Ty Cổ Phần Giải Trí và Thể Thao Điện Tử Việt Nam',
  address: 'Tầng 6, Tòa nhà Capital Place, 29 Liễu Giai, Phường Ngọc Hà, Hà Nội, Việt Nam',
  tax_code: '', phone: '', email: '',
};

async function ensureCompanyInfo() {
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', ['company_info']);
  if (rows.length) return;
  await query('INSERT INTO settings (`key`, value, description) VALUES (?,?,?)',
    ['company_info', JSON.stringify(DEFAULT_COMPANY_INFO), 'Thông tin công ty (Bên A) điền hợp đồng']);
}

// Người ký mặc định (bám dữ liệu code gốc) — seed 1 lần, sau đó admin tự sửa qua UI.
const DEFAULT_SIGNATORIES = [
  ['contract', 'default', 'Vũ Chí Công', 'Giám đốc'],
  ['contract', 'AOV', 'Nguyễn Đắc Bá Nhật', 'Giám đốc'],
  ['contract', 'FCO', 'Nguyễn Đắc Bá Nhật', 'Giám đốc'],
  ['contract', 'PPT', 'Nguyễn Đắc Bá Nhật', 'Giám đốc'],
  ['thu_kho', 'default', 'Lê Minh Trí', 'Thủ kho'],
  ['ke_toan', 'default', 'Nguyễn Thị Thúy An', 'Kế toán'],
  ['truong_phong', 'default', 'Võ Thị Tuyền Chinh', 'Trưởng phòng'],
];

async function ensureSignatories() {
  const [{ c }] = await query('SELECT COUNT(*) AS c FROM signatories');
  if (c > 0) return;
  for (const [role_key, scope, name, title] of DEFAULT_SIGNATORIES) {
    await query('INSERT INTO signatories (role_key, scope, name, title) VALUES (?,?,?,?)', [role_key, scope, name, title]);
  }
  console.log('[db] Đã tạo danh sách người ký mặc định.');
}

// Danh sách bảng backup mặc định (dữ liệu nghiệp vụ) — loại trừ users (password_hash),
// settings (chứa mật khẩu SMTP + mẫu .docx base64 rất nặng), attachments (ảnh base64),
// catalog_access_log/notifications (log/transient). Muốn thêm bảng khác sau này: gọi
// POST /api/backup/config, không cần sửa danh sách này hay deploy lại.
const DEFAULT_BACKUP_TABLES = [
  'teams', 'suppliers', 'categories', 'products',
  'orders', 'order_items', 'purchase_requests', 'request_items',
  'contracts', 'email_logs', 'ratings',
  'warehouse_stock', 'inventory_moves',
  'workflow_states', 'signatories', 'order_status_history',
];

async function ensureBackupConfig() {
  const [{ c }] = await query('SELECT COUNT(*) AS c FROM backup_config');
  if (c > 0) return;
  for (const t of DEFAULT_BACKUP_TABLES) {
    await query('INSERT IGNORE INTO backup_config (table_name) VALUES (?)', [t]);
  }
  console.log(`[db] Đã tạo cấu hình backup mặc định (${DEFAULT_BACKUP_TABLES.length} bảng).`);
}

export async function initDb() {
  await waitForDb();
  await runSqlFile('schema.sql');
  await runMigrations();
  // Seed chỉ khi bảng orders trống, để không đè dữ liệu thật.
  const [{ c }] = await query('SELECT COUNT(*) AS c FROM orders');
  if (c === 0) {
    console.log('[db] Bảng trống — nạp dữ liệu mẫu (seed.sql)');
    await runSqlFile('seed.sql', { ignoreErrors: true });
  }
  await ensureAdmin();
  await ensureWorkflow();
  await ensureTheme();
  await ensureCompanyInfo();
  await ensureSignatories();
  await ensureBackupConfig();
  console.log('[db] Khởi tạo database hoàn tất.');
}
