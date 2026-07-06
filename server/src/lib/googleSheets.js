import { google } from 'googleapis';
import fs from 'node:fs';
import { config } from '../config.js';

let sheetsClientPromise = null;

// Đọc service account key từ biến môi trường — KHÔNG hardcode path hay nội dung key.
// Ưu tiên GOOGLE_SERVICE_ACCOUNT_KEY_JSON (base64) vì production (Demo System) không có
// filesystem riêng để đặt file secrets/; local dev có thể dùng GOOGLE_APPLICATION_CREDENTIALS_FILE.
function loadCredentials() {
  const b64 = config.backup.serviceAccountKeyBase64;
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

export function isBackupConfigured() {
  return Boolean(config.backup.spreadsheetId && loadCredentials());
}

async function getSheetsClient() {
  if (!sheetsClientPromise) {
    sheetsClientPromise = (async () => {
      const credentials = loadCredentials();
      if (!credentials) {
        throw new Error(
          'Không tìm thấy Google service account key (đặt GOOGLE_SERVICE_ACCOUNT_KEY_JSON hoặc GOOGLE_APPLICATION_CREDENTIALS_FILE).'
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
