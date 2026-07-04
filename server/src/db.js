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
  console.log('[db] Khởi tạo database hoàn tất.');
}
