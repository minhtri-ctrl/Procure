import { query } from '../db.js';
import { config } from '../config.js';
import { ensureSheetTab, writeSheetSnapshot, isBackupConfigured } from './googleSheets.js';

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

async function syncTable(cfg) {
  const tableName = cfg.table_name;
  assertSafeIdentifier(tableName, 'Tên bảng');
  const tabName = cfg.sheet_tab_name || tableName;
  const spreadsheetId = config.backup.spreadsheetId;

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

// Chạy 1 lượt đồng bộ toàn bộ bảng đang bật trong backup_config.
// Mỗi bảng độc lập — 1 bảng lỗi không chặn các bảng còn lại.
export async function runBackupSync() {
  if (!isBackupConfigured()) {
    console.log(
      '[backup] Chưa cấu hình Google Sheets (thiếu GOOGLE_SHEET_ID hoặc service account key) — bỏ qua lượt đồng bộ.'
    );
    return { skipped: true };
  }
  const configs = await query('SELECT * FROM backup_config WHERE is_enabled = 1 ORDER BY table_name');
  const results = [];
  for (const cfg of configs) {
    try {
      await syncTable(cfg);
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
}

let intervalHandle = null;

// Cron trong-process: chạy lần đầu ngắn sau khi server sẵn sàng, sau đó lặp lại theo chu kỳ.
export function scheduleBackupSync() {
  if (intervalHandle) return;
  if (!isBackupConfigured()) {
    console.log('[backup] Google Sheets backup chưa được cấu hình — cron không khởi động.');
    return;
  }
  const minutes = config.backup.intervalMinutes;
  console.log(`[backup] Bật cron đồng bộ MySQL -> Google Sheets mỗi ${minutes} phút.`);
  setTimeout(() => {
    runBackupSync().catch((e) => console.error('[backup] Lỗi lượt đồng bộ đầu tiên:', e.message));
  }, 30_000);
  intervalHandle = setInterval(() => {
    runBackupSync().catch((e) => console.error('[backup] Lỗi lượt đồng bộ:', e.message));
  }, minutes * 60_000);
}
