import { query, pool } from '../db.js';
import { config } from '../config.js';
import { ensureSheetTab, writeSheetSnapshot, isBackupConfigured, getBackupSpreadsheetId } from './googleSheets.js';

// table_name đến từ backup_config (admin có thể tự thêm qua API) và bị nối trực tiếp vào SQL
// làm định danh (backtick) chứ không phải giá trị tham số hoá được — chặn ký tự lạ để tránh injection.
const SAFE_IDENTIFIER = /^[a-zA-Z0-9_]+$/;
function assertSafeIdentifier(name, label) {
  if (!SAFE_IDENTIFIER.test(name)) throw new Error(`${label} không hợp lệ: "${name}"`);
}

async function logEvent(eventType, tableName, detail) {
  await query('INSERT INTO backup_log (event_type, table_name, detail) VALUES (?,?,?)', [
    eventType,
    tableName,
    detail || null,
  ]);
}

// Đọc cấu trúc cột động từ INFORMATION_SCHEMA mỗi lần chạy — không hardcode tên cột nào,
// nên bảng có thêm cột mới sẽ tự được nhận diện và backup ở lần chạy kế tiếp.
async function getTableColumns(tableName) {
  const rows = await query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [tableName]
  );
  return rows.map((r) => r.COLUMN_NAME);
}

function formatCell(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return '[binary]';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

async function getBackupState(tableName) {
  const rows = await query('SELECT * FROM backup_state WHERE table_name = ?', [tableName]);
  return rows[0] || null;
}

async function upsertBackupState(tableName, patch) {
  const existing = await getBackupState(tableName);
  const entries = Object.entries(patch);
  if (existing) {
    const sets = entries.map(([k]) => `${k} = ?`).join(', ');
    await query(`UPDATE backup_state SET ${sets} WHERE table_name = ?`, [
      ...entries.map(([, v]) => v),
      tableName,
    ]);
  } else {
    const cols = ['table_name', ...entries.map(([k]) => k)];
    const vals = [tableName, ...entries.map(([, v]) => v)];
    await query(
      `INSERT INTO backup_state (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
      vals
    );
  }
}

async function syncTable(cfg, spreadsheetId) {
  const tableName = cfg.table_name;
  assertSafeIdentifier(tableName, 'Tên bảng');
  const tabName = cfg.sheet_tab_name || tableName;

  const columns = await getTableColumns(tableName);
  if (!columns.length) throw new Error(`Bảng "${tableName}" không tồn tại trong MySQL`);
  columns.forEach((c) => assertSafeIdentifier(c, 'Tên cột'));

  const state = await getBackupState(tableName);
  const prevColumns = state?.columns_json ? JSON.parse(state.columns_json) : null;

  if (!state) {
    await logEvent(
      'new_table',
      tableName,
      `Phát hiện bảng mới trong backup_config: "${tableName}" -> tạo tab "${tabName}"`
    );
  } else if (prevColumns) {
    const newCols = columns.filter((c) => !prevColumns.includes(c));
    if (newCols.length) {
      await logEvent('new_column', tableName, `Cột mới phát hiện: ${newCols.join(', ')}`);
    }
  }

  // Đảm bảo tab luôn tồn tại (phòng khi bị xoá thủ công trên Sheet, hoặc lần đầu backup bảng này).
  await ensureSheetTab(spreadsheetId, tabName);

  const hasDeletedAt = columns.includes('deleted_at');
  const colList = columns.map((c) => `\`${c}\``).join(', ');
  const where = hasDeletedAt ? 'WHERE `deleted_at` IS NULL' : '';
  const dataRows = await query(`SELECT ${colList} FROM \`${tableName}\` ${where}`);

  const rows = dataRows.map((r) => columns.map((c) => formatCell(r[c])));
  await writeSheetSnapshot(spreadsheetId, tabName, columns, rows);

  await upsertBackupState(tableName, {
    columns_json: JSON.stringify(columns),
    row_count: rows.length,
    last_synced_at: new Date(),
    last_status: 'ok',
    last_error: null,
  });
}

// Khoá chống chạy chồng — Ở CẤP MySQL, không phải biến RAM: nền tảng deploy có thể chạy
// nhiều hơn 1 container/replica cho cùng 1 deployment (đã thấy race thật khi test — 2 tiến
// trình cùng đọc "tab chưa tồn tại" rồi cùng addSheet -> lỗi "already exists" + nhân đôi số
// lượt gọi Google Sheets API trong 1 phút -> vượt quota ghi). Một biến `let isRunning` trong
// module chỉ chặn được trong 1 process, không thấy được process khác — nên dùng
// backup_lock (1 dòng, cột locked_at) làm khoá dùng chung giữa mọi instance qua UPDATE có
// điều kiện: chỉ 1 UPDATE trúng điều kiện tại một thời điểm nhờ tính atomic của MySQL.
const LOCK_STALE_MINUTES = 15; // tự nhả khoá nếu 1 lượt chạy bị crash giữa chừng không kịp release

async function acquireLock() {
  const [result] = await pool.query(
    `UPDATE backup_lock SET locked_at = NOW()
     WHERE id = 1 AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL ${LOCK_STALE_MINUTES} MINUTE)`
  );
  return result.affectedRows === 1;
}

async function releaseLock() {
  await query('UPDATE backup_lock SET locked_at = NULL WHERE id = 1');
}

// Chạy 1 lượt đồng bộ toàn bộ bảng đang bật trong backup_config.
// Mỗi bảng độc lập — 1 bảng lỗi không chặn các bảng còn lại.
export async function runBackupSync() {
  if (!(await isBackupConfigured())) {
    console.log(
      '[backup] Chưa cấu hình Google Sheets (thiếu Sheet ID hoặc service account key) — bỏ qua lượt đồng bộ.'
    );
    return { skipped: true };
  }
  if (!(await acquireLock())) {
    console.log('[backup] Instance khác đang chạy đồng bộ (hoặc chạy tay trùng lúc cron) — bỏ qua lần này.');
    return { skipped: true, reason: 'already_running' };
  }
  try {
    const spreadsheetId = await getBackupSpreadsheetId();
    const configs = await query('SELECT * FROM backup_config WHERE is_enabled = 1 ORDER BY table_name');
    const results = [];
    for (const cfg of configs) {
      try {
        await syncTable(cfg, spreadsheetId);
        results.push({ table: cfg.table_name, ok: true });
      } catch (e) {
        console.error(`[backup] Lỗi đồng bộ bảng "${cfg.table_name}":`, e.message);
        await upsertBackupState(cfg.table_name, {
          last_synced_at: new Date(),
          last_status: 'error',
          last_error: String(e.message).slice(0, 1000),
        }).catch(() => {});
        await logEvent('sync_error', cfg.table_name, String(e.message).slice(0, 500)).catch(() => {});
        results.push({ table: cfg.table_name, ok: false, error: e.message });
      }
    }
    return { skipped: false, results };
  } finally {
    await releaseLock().catch(() => {});
  }
}

let intervalHandle = null;

// Cron trong-process: chạy lần đầu ngắn sau khi server sẵn sàng, sau đó lặp lại theo chu kỳ.
// Mỗi tick tự kiểm tra isBackupConfigured() — cấu hình có thể được set SAU lúc khởi động
// (qua API PUT /api/backup/google-config lưu vào bảng settings) mà không cần restart container.
export function scheduleBackupSync() {
  if (intervalHandle) return;
  const minutes = config.backup.intervalMinutes;
  console.log(`[backup] Cron đồng bộ MySQL -> Google Sheets: mỗi ${minutes} phút (tự bỏ qua nếu chưa cấu hình).`);
  setTimeout(() => {
    runBackupSync().catch((e) => console.error('[backup] Lỗi lượt đồng bộ đầu tiên:', e.message));
  }, 30_000);
  intervalHandle = setInterval(() => {
    runBackupSync().catch((e) => console.error('[backup] Lỗi lượt đồng bộ:', e.message));
  }, minutes * 60_000);
}
