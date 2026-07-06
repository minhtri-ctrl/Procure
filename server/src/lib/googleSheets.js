import { google } from 'googleapis';
import fs from 'node:fs';
import { config } from '../config.js';
import { query } from '../db.js';

let sheetsClientPromise = null;

async function getSetting(key) {
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', [key]);
  return rows[0]?.value || '';
}

// Đọc service account key + Sheet ID theo thứ tự ưu tiên:
// 1) biến môi trường (KHÔNG hardcode trong code) — GOOGLE_SERVICE_ACCOUNT_KEY_JSON (base64, dùng
//    cho production vì Demo System không có filesystem riêng để đặt file secrets/) hoặc
//    GOOGLE_APPLICATION_CREDENTIALS_FILE (path, dùng cho local dev).
// 2) fallback: bảng settings trong MySQL (key backup_google_key_b64 / backup_google_sheet_id) —
//    cùng cơ chế đang dùng cho mật khẩu SMTP, set qua API admin PUT /api/backup/google-config,
//    dùng khi nền tảng deploy không có chỗ cấu hình biến môi trường tuỳ ý.
async function loadCredentials() {
  const b64 = config.backup.serviceAccountKeyBase64 || (await getSetting('backup_google_key_b64'));
  if (b64) {
    try {
      return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch {
      return null;
    }
  }
  const filePath = config.backup.credentialsFile;
  if (filePath && fs.existsSync(filePath)) {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
}

export async function getBackupSpreadsheetId() {
  return config.backup.spreadsheetId || (await getSetting('backup_google_sheet_id'));
}

export async function isBackupConfigured() {
  const id = await getBackupSpreadsheetId();
  const creds = await loadCredentials();
  return Boolean(id && creds);
}

// Gọi sau khi admin set/đổi cấu hình qua API để lần đồng bộ kế tiếp dùng key mới ngay,
// không phải chờ restart container.
export function resetSheetsClientCache() {
  sheetsClientPromise = null;
}

async function getSheetsClient() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const credentials = await loadCredentials();
      if (!credentials) {
        throw new Error(
          'Không tìm thấy Google service account key (GOOGLE_SERVICE_ACCOUNT_KEY_JSON / GOOGLE_APPLICATION_CREDENTIALS_FILE / settings.backup_google_key_b64).'
        );
      }
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });
      const authClient = await auth.getClient();
      return google.sheets({ version: 'v4', auth: authClient });
    })().catch((e) => {
      sheetsClientPromise = null; // cho phép thử lại ở lần gọi sau nếu lỗi
      throw e;
    });
  }
  return sheetsClientPromise;
}

async function getSpreadsheetMeta(spreadsheetId) {
  const sheets = await getSheetsClient();
  const res = await sheets.spreadsheets.get({ spreadsheetId });
  return res.data;
}

// Tạo tab mới nếu tên bảng chưa có tab tương ứng trên Google Sheet.
export async function ensureSheetTab(spreadsheetId, tabName) {
  const sheets = await getSheetsClient();
  const meta = await getSpreadsheetMeta(spreadsheetId);
  const exists = (meta.sheets || []).some((s) => s.properties?.title === tabName);
  if (exists) return false;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: tabName } } }] },
  });
  return true;
}

// Ghi đè toàn bộ nội dung tab bằng snapshot mới nhất (header luôn phản ánh đúng cột hiện tại
// của bảng MySQL, kể cả cột vừa được thêm — không cần biết trước danh sách cột).
export async function writeSheetSnapshot(spreadsheetId, tabName, header, rows) {
  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${tabName}!A:ZZ` });
  const values = [header, ...rows];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tabName}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}
