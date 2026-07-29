import { Router } from 'express';
import { createHash } from 'node:crypto';
import { query, pool } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap } from '../util.js';
import { extractQuotation, QUOTATION_MAX_BYTES } from '../lib/quotationExtraction.js';

const router = Router();
const ACCEPTED = ['.xlsx', '.xls', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.webp'];
const MAX_BATCH_FILES = 3;
const MAX_BATCH_BYTES = 12 * 1024 * 1024;

function normalizedName(value) { return String(value || '').trim().toLocaleLowerCase('vi').replace(/\s+/g, ' '); }
function supplierMatch(name, suppliers) {
  const key = normalizedName(name);
  if (!key) return { status: 'missing', supplier_id: null };
  const exact = suppliers.filter((s) => normalizedName(s.name) === key);
  if (exact.length === 1) return { status: 'matched', supplier_id: exact[0].id, supplier_name: exact[0].name };
  const loose = suppliers.filter((s) => normalizedName(s.name).includes(key) || key.includes(normalizedName(s.name)));
  if (loose.length === 1) return { status: 'suggested', supplier_id: loose[0].id, supplier_name: loose[0].name };
  return { status: loose.length > 1 ? 'ambiguous' : 'new', supplier_id: null, candidates: loose.slice(0, 5).map((s) => ({ id: s.id, name: s.name })) };
}
function bytesOf(value) { return Buffer.from(String(value || ''), 'base64').length; }
function sourceFingerprint(file) { return createHash('sha256').update(`${file.filename}:${file.data_base64}`).digest('hex'); }
async function extractOne(file, suppliers) {
  const result = await extractQuotation({ filename: file.filename, dataBase64: file.data_base64 });
  return {
    client_id: file.client_id || sourceFingerprint(file).slice(0, 16),
    filename: file.filename,
    fingerprint: sourceFingerprint(file),
    status: 'success',
    ...result,
    items: (result.items || []).map((item) => ({ ...item, supplier_match: supplierMatch(item.supplier_name, suppliers) })),
  };
}
async function batch(files) {
  if (!Array.isArray(files) || !files.length) { const err = new Error('Cần chọn ít nhất một file báo giá.'); err.status = 400; throw err; }
  if (files.length > MAX_BATCH_FILES) { const err = new Error(`Tối đa ${MAX_BATCH_FILES} file mỗi lượt.`); err.status = 400; throw err; }
  const total = files.reduce((sum, file) => sum + bytesOf(file?.data_base64), 0);
  if (total > MAX_BATCH_BYTES) { const err = new Error('Tổng dung lượng batch vượt quá 12 MB.'); err.status = 400; throw err; }
  const suppliers = await query('SELECT id, name, vendor_no, master_contract FROM suppliers WHERE is_active = 1 ORDER BY name');
  const results = await Promise.all(files.map(async (file) => {
    if (!file?.filename || !file?.data_base64) return { client_id: file?.client_id || '', filename: file?.filename || 'unknown', status: 'error', error: 'Thiếu tên hoặc dữ liệu file.' };
    try { return await extractOne(file, suppliers); } catch (error) { return { client_id: file.client_id || '', filename: file.filename, status: 'error', error: error.message }; }
  }));
  return { files: results, limits: { max_bytes: QUOTATION_MAX_BYTES, max_files: MAX_BATCH_FILES, max_batch_bytes: MAX_BATCH_BYTES, accepted: ACCEPTED } };
}

router.use(authRequired, requireRole('admin', 'purchasing'));
router.post('/extract-batch', wrap(async (req, res) => res.json(await batch(req.body?.files))));
router.post('/extract', wrap(async (req, res) => {
  const { filename, data_base64, client_id } = req.body || {};
  const result = await batch([{ filename, data_base64, client_id }]);
  const file = result.files[0];
  if (file.status === 'error') return res.status(400).json({ error: file.error });
  res.json({ ...file, suppliers: [...new Set((file.items || []).map((item) => item.supplier_name).filter(Boolean))], limits: result.limits });
}));

async function checkOrderAndItems(orderId, itemIds = []) {
  const [order] = await query('SELECT id FROM orders WHERE id = ?', [orderId]);
  if (!order) { const err = new Error('Không tìm thấy đơn hàng.'); err.status = 404; throw err; }
  const ids = [...new Set(itemIds.filter(Boolean).map(Number))];
  if (ids.length) {
    const rows = await query(`SELECT id FROM order_items WHERE order_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [orderId, ...ids]);
    if (rows.length !== ids.length) { const err = new Error('Có dòng hàng không thuộc đơn hàng.'); err.status = 400; throw err; }
  }
  return ids;
}
router.get('/orders/:orderId/attachments', wrap(async (req, res) => {
  const rows = await query(
    `SELECT q.*, a.filename, a.mime, a.created_at, CONCAT('/api/uploads/', a.id) AS url, s.name AS supplier_name, i.item_name
     FROM order_quote_attachments q JOIN attachments a ON a.id=q.attachment_id
     LEFT JOIN suppliers s ON s.id=q.supplier_id LEFT JOIN order_items i ON i.id=q.order_item_id
     WHERE q.order_id=? ORDER BY q.id DESC`, [req.params.orderId]
  );
  res.json({ data: rows });
}));
router.post('/orders/:orderId/attachments', wrap(async (req, res) => {
  const { filename, mime, data_base64, supplier_id, item_ids = [], extraction_batch, source_fingerprint, source_supplier_name } = req.body || {};
  if (!filename || !data_base64) return res.status(400).json({ error: 'Thiếu file báo giá.' });
  if (bytesOf(data_base64) > QUOTATION_MAX_BYTES) return res.status(400).json({ error: 'File báo giá vượt giới hạn 5 MB.' });
  const itemIds = await checkOrderAndItems(req.params.orderId, item_ids);
  if (supplier_id) { const [supplier] = await query('SELECT id FROM suppliers WHERE id=?', [supplier_id]); if (!supplier) return res.status(400).json({ error: 'NCC hệ thống không hợp lệ.' }); }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [attachment] = await conn.query('INSERT INTO attachments (kind, ref_id, filename, mime, data_base64, uploaded_by) VALUES (?,?,?,?,?,?)', ['quotation', req.params.orderId, filename, mime || 'application/octet-stream', data_base64, req.user.email]);
    const targets = itemIds.length ? itemIds : [null];
    for (const itemId of targets) await conn.query(
      'INSERT INTO order_quote_attachments (order_id, order_item_id, supplier_id, attachment_id, extraction_batch, source_fingerprint, source_supplier_name, created_by) VALUES (?,?,?,?,?,?,?,?)',
      [req.params.orderId, itemId, supplier_id || null, attachment.insertId, extraction_batch || null, source_fingerprint || null, source_supplier_name || null, req.user.email]
    );
    await conn.commit();
    res.status(201).json({ id: attachment.insertId, url: `/api/uploads/${attachment.insertId}`, linked_items: targets.length });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));
router.delete('/orders/:orderId/attachments/:linkId', wrap(async (req, res) => {
  const [link] = await query('SELECT attachment_id FROM order_quote_attachments WHERE id=? AND order_id=?', [req.params.linkId, req.params.orderId]);
  if (!link) return res.status(404).json({ error: 'Không tìm thấy liên kết file báo giá.' });
  await query('DELETE FROM order_quote_attachments WHERE id=?', [req.params.linkId]);
  const [remaining] = await query('SELECT COUNT(*) AS total FROM order_quote_attachments WHERE attachment_id=?', [link.attachment_id]);
  if (!Number(remaining.total)) await query('DELETE FROM attachments WHERE id=?', [link.attachment_id]);
  res.json({ ok: true });
}));

export { ACCEPTED, MAX_BATCH_FILES, MAX_BATCH_BYTES, batch, supplierMatch };
export default router;
