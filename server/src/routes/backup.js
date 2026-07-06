import express from 'express';
import { authRequired, requireRole } from '../middleware/auth.js';
import { query } from '../db.js';
import { runBackupSync } from '../lib/backupSync.js';
import { isBackupConfigured } from '../lib/googleSheets.js';

const router = express.Router();
router.use(authRequired, requireRole('admin'));

// table_name/sheet_tab_name được nối trực tiếp vào SQL làm định danh khi đồng bộ — chặn sớm ký tự lạ.
const SAFE_TABLE_NAME = /^[a-zA-Z0-9_]+$/;

// Trạng thái đồng bộ từng bảng + nhật ký phát hiện bảng/cột mới gần đây.
router.get('/status', async (req, res, next) => {
  try {
    const state = await query('SELECT * FROM backup_state ORDER BY table_name');
    const logs = await query('SELECT * FROM backup_log ORDER BY id DESC LIMIT 100');
    res.json({ configured: isBackupConfigured(), state, logs });
  } catch (e) {
    next(e);
  }
});

// Kích hoạt đồng bộ ngay (không cần đợi chu kỳ cron).
router.post('/run', async (req, res, next) => {
  try {
    res.json(await runBackupSync());
  } catch (e) {
    next(e);
  }
});

// Danh sách bảng đang cấu hình backup.
router.get('/config', async (req, res, next) => {
  try {
    res.json(await query('SELECT * FROM backup_config ORDER BY table_name'));
  } catch (e) {
    next(e);
  }
});

// Thêm bảng mới vào backup (hoặc sửa tên tab/ghi chú) — không cần sửa code, không cần deploy lại.
router.post('/config', async (req, res, next) => {
  try {
    const { table_name, sheet_tab_name, note } = req.body || {};
    if (!table_name) return res.status(400).json({ error: 'Thiếu table_name' });
    if (!SAFE_TABLE_NAME.test(table_name)) {
      return res.status(400).json({ error: 'table_name chỉ được chứa chữ/số/gạch dưới' });
    }
    await query(
      `INSERT INTO backup_config (table_name, sheet_tab_name, note) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE sheet_tab_name = VALUES(sheet_tab_name), note = VALUES(note)`,
      [table_name, sheet_tab_name || null, note || null]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// Bật/tắt hoặc đổi tên tab của 1 bảng đã cấu hình.
router.put('/config/:table', async (req, res, next) => {
  try {
    const { is_enabled, sheet_tab_name, note } = req.body || {};
    await query(
      `UPDATE backup_config SET
         is_enabled = COALESCE(?, is_enabled),
         sheet_tab_name = COALESCE(?, sheet_tab_name),
         note = COALESCE(?, note)
       WHERE table_name = ?`,
      [is_enabled === undefined ? null : is_enabled ? 1 : 0, sheet_tab_name ?? null, note ?? null, req.params.table]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

export default router;
