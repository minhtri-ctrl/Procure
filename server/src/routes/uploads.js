import { Router } from 'express';
import { query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap } from '../util.js';

const router = Router();

// Map kind -> bảng/cột cần cập nhật image_url.
const TARGET = {
  product: { table: 'products', col: 'image_url' },
  'order-item': { table: 'order_items', col: 'image_url' },
};

// GET ảnh (công khai để <img src> tải được).
router.get('/:id', wrap(async (req, res) => {
  const rows = await query('SELECT mime, data_base64 FROM attachments WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).send('Không tìm thấy ảnh');
  const buf = Buffer.from(rows[0].data_base64, 'base64');
  res.type(rows[0].mime || 'image/png');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(buf);
}));

// Upload ảnh cho product / order-item (bám procureUploadImageByRow: upload -> set URL).
router.post('/:kind/:refId', authRequired, requireRole('admin', 'purchasing', 'warehouse'), wrap(async (req, res) => {
  const t = TARGET[req.params.kind];
  if (!t) return res.status(400).json({ error: 'kind không hợp lệ' });
  let { data, filename, mime } = req.body || {};
  if (!data) return res.status(400).json({ error: 'Thiếu dữ liệu ảnh' });
  // Chấp nhận cả data URL (data:image/png;base64,....) lẫn base64 thuần.
  const m = /^data:([^;]+);base64,(.*)$/s.exec(data);
  if (m) { mime = mime || m[1]; data = m[2]; }
  mime = mime || 'image/png';

  const r = await query(
    'INSERT INTO attachments (kind, ref_id, filename, mime, data_base64, uploaded_by) VALUES (?,?,?,?,?,?)',
    [req.params.kind, req.params.refId, filename || null, mime, data, req.user.email]
  );
  const url = `/api/uploads/${r.insertId}`;
  await query(`UPDATE \`${t.table}\` SET \`${t.col}\` = ? WHERE id = ?`, [url, req.params.refId]);
  res.status(201).json({ id: r.insertId, url });
}));

// Xoá ảnh (bám procureClearImageByRow: clear URL).
router.delete('/:kind/:refId', authRequired, requireRole('admin', 'purchasing', 'warehouse'), wrap(async (req, res) => {
  const t = TARGET[req.params.kind];
  if (!t) return res.status(400).json({ error: 'kind không hợp lệ' });
  await query('DELETE FROM attachments WHERE kind = ? AND ref_id = ?', [req.params.kind, req.params.refId]);
  await query(`UPDATE \`${t.table}\` SET \`${t.col}\` = NULL WHERE id = ?`, [req.params.refId]);
  res.json({ ok: true });
}));

export default router;
