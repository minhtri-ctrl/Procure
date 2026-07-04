import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap, pick } from '../util.js';
import { moneyVnd, numToVietnamese } from '../lib/vn.js';
import { renderContract } from '../lib/docx.js';

const router = Router();
router.use(authRequired);
const TPL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'templates');

// Quy tắc auto-create (bám ProcureOS_Automation.js).
const INVALID_MASTER_CONTRACT = ['', 'Chọn Normal sourcing', 'Normal sourcing', 'N/A', 'n/a'];
const MIN_VALUE_AUTO_DOC = 20000000;
const AUTO_DOC_STATUSES = ['waiting', 'in_progress', 'quoted', 'ordered', 'received'];

const COMPANY = {
  name: 'Công Ty Cổ Phần Giải Trí và Thể Thao Điện Tử Việt Nam',
  address: 'Tầng 6, Tòa nhà Capital Place, 29 Liễu Giai, Phường Ngọc Hà, Hà Nội, Việt Nam',
};

// DDH nếu NCC có MASTER_CONTRACT hợp lệ, ngược lại HĐ dịch vụ.
function decideType(masterContract) {
  const v = String(masterContract || '').trim();
  return v && !INVALID_MASTER_CONTRACT.includes(v) ? 'DDH' : 'HD';
}

// Người đại diện ký của công ty theo team (bám code gốc).
function ourSigner(teamCode) {
  return ['AOV', 'FCO', 'PPT'].includes(String(teamCode || '').toUpperCase())
    ? 'Nguyễn Đắc Bá Nhật' : 'Vũ Chí Công';
}

// Phân tích hình thức thanh toán -> % tạm ứng / còn lại.
function parsePayment(raw, total) {
  const s = String(raw || '').replace(/[^0-9/]/g, ' ');
  const nums = (s.match(/\d+/g) || []).map(Number).filter((n) => n > 0 && n <= 100);
  let deposit = 100;
  if (nums.length >= 1 && nums[0] < 100) deposit = nums[0];
  const balance = 100 - deposit;
  return {
    raw: raw || '100%',
    isInstallment: deposit < 100,
    depositPercent: deposit,
    balancePercent: balance,
    depositAmount: Math.round(total * deposit / 100),
    balanceAmount: Math.round(total * balance / 100),
  };
}

async function nextContractNo(type) {
  const d = new Date();
  const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `${type}-${ym}-`;
  const rows = await query('SELECT contract_no FROM contracts WHERE contract_no LIKE ?', [prefix + '%']);
  const re = new RegExp('^' + prefix.replace(/-/g, '\\-') + '(\\d{4})$');
  let max = 0;
  for (const r of rows) { const m = re.exec(r.contract_no || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); }
  return prefix + String(max + 1).padStart(4, '0');
}

// Dựng văn bản hợp đồng HTML (thay cho Google Docs template).
function buildDocument({ type, contractNo, order, supplier, items, subtotal, vat, total, payment, ourSignerName }) {
  const today = new Date().toLocaleDateString('vi-VN');
  const rows = items.map((it, i) => `<tr>
    <td class="c">${i + 1}</td><td>${it.item_name || ''}</td><td class="c">${it.unit || ''}</td>
    <td class="r">${it.quantity}</td><td class="r">${moneyVnd(it.unit_price)}</td>
    <td class="r">${(Number(it.vat_rate) * 100).toFixed(0)}%</td><td class="r">${moneyVnd(it.line_total)}</td></tr>`).join('');
  const title = type === 'DDH' ? 'ĐƠN ĐẶT HÀNG' : 'HỢP ĐỒNG CUNG CẤP HÀNG HÓA / DỊCH VỤ';
  const payClause = payment.isInstallment
    ? `<p>Công Ty thanh toán cho Nhà Cung Cấp theo từng đợt: tạm ứng <b>${payment.depositPercent}%</b> (${moneyVnd(payment.depositAmount)} đ), thanh toán phần còn lại <b>${payment.balancePercent}%</b> (${moneyVnd(payment.balanceAmount)} đ) sau khi nghiệm thu.</p>`
    : `<p>Công Ty thanh toán cho Nhà Cung Cấp <b>100%</b> giá trị hợp đồng (${moneyVnd(total)} đ) sau khi nghiệm thu và nhận đủ hóa đơn hợp lệ.</p>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${contractNo}</title>
  <style>
    body{font-family:'Times New Roman',serif;color:#111;max-width:820px;margin:24px auto;padding:0 24px;line-height:1.5}
    h1{text-align:center;font-size:20px;margin:4px 0}.sub{text-align:center;margin:0 0 18px}
    table{border-collapse:collapse;width:100%;font-size:13px;margin:10px 0}
    th,td{border:1px solid #333;padding:6px}.c{text-align:center}.r{text-align:right}
    th{background:#eee}.parties td{border:none;vertical-align:top;width:50%;padding:8px 6px}
    .sign{margin-top:36px}.muted{color:#555}
  </style></head><body>
  <p class="c" style="text-align:center;margin:0"><b>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><br>Độc lập - Tự do - Hạnh phúc<br>------------------</p>
  <h1>${title}</h1>
  <p class="sub">Số: <b>${contractNo}</b> &nbsp;·&nbsp; Ngày ${today}</p>
  <p>Căn cứ nhu cầu và khả năng của hai Bên, hôm nay chúng tôi gồm:</p>
  <table class="parties"><tr>
    <td><b>BÊN MUA (Bên A):</b><br>${COMPANY.name}<br><span class="muted">${COMPANY.address}</span><br>Đại diện: <b>${ourSignerName}</b></td>
    <td><b>BÊN BÁN (Bên B):</b><br>${supplier?.name || ''}<br><span class="muted">${supplier?.address || ''}</span><br>
      MST: ${supplier?.tax_code || ''}<br>Đại diện: <b>${supplier?.representative || supplier?.contact_name || ''}</b></td>
  </tr></table>
  <p>Hai bên thống nhất ký kết ${type === 'DDH' ? 'đơn đặt hàng' : 'hợp đồng'} theo đơn hàng <b>${order.order_code}</b>${order.project_name ? ` - dự án "${order.project_name}"` : ''} với nội dung sau:</p>
  <p><b>Điều 1. Hàng hóa / dịch vụ</b></p>
  <table><thead><tr><th>STT</th><th>Tên hàng</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>VAT</th><th>Thành tiền</th></tr></thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr><td colspan="6" class="r"><b>Cộng trước thuế</b></td><td class="r">${moneyVnd(subtotal)}</td></tr>
    <tr><td colspan="6" class="r"><b>Tiền thuế VAT</b></td><td class="r">${moneyVnd(vat)}</td></tr>
    <tr><td colspan="6" class="r"><b>TỔNG CỘNG</b></td><td class="r"><b>${moneyVnd(total)}</b></td></tr>
  </tfoot></table>
  <p>Bằng chữ: <i>${numToVietnamese(total)}</i>.</p>
  <p><b>Điều 2. Thanh toán</b></p>${payClause}
  <p><b>Điều 3. Điều khoản chung</b></p>
  <p>Hai bên cam kết thực hiện đúng các điều khoản. ${type === 'DDH' ? 'Đơn đặt hàng' : 'Hợp đồng'} có hiệu lực kể từ ngày ký.</p>
  <table class="sign"><tr>
    <td class="c"><b>ĐẠI DIỆN BÊN A</b><br><span class="muted">(Ký, ghi rõ họ tên)</span><br><br><br>${ourSignerName}</td>
    <td class="c"><b>ĐẠI DIỆN BÊN B</b><br><span class="muted">(Ký, ghi rõ họ tên)</span><br><br><br>${supplier?.representative || supplier?.contact_name || ''}</td>
  </tr></table>
  </body></html>`;
}

async function createFromOrder(orderId, forcedType) {
  const [order] = await query(
    `SELECT o.*, t.code AS team_code FROM orders o LEFT JOIN teams t ON t.id=o.team_id WHERE o.id = ?`, [orderId]);
  if (!order) throw Object.assign(new Error('Không tìm thấy đơn hàng'), { status: 404 });
  let supplier = null;
  if (order.supplier_id) [supplier] = await query('SELECT * FROM suppliers WHERE id = ?', [order.supplier_id]);
  const items = await query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [orderId]);

  let subtotal = 0, vat = 0;
  for (const it of items) {
    const line = Number(it.quantity) * Number(it.unit_price) * (1 - Number(it.discount_rate || 0));
    subtotal += line;
    vat += line * Number(it.vat_rate || 0);
  }
  subtotal = Math.round(subtotal);
  vat = Math.round(vat);
  const total = subtotal + vat;

  const type = forcedType || decideType(supplier?.master_contract);
  const payment = parsePayment(order.payment_method, total);
  const ourSignerName = ourSigner(order.team_code);
  const contractNo = await nextContractNo(type);
  const documentHtml = buildDocument({ type, contractNo, order, supplier, items, subtotal, vat, total, payment, ourSignerName });

  const r = await query(
    `INSERT INTO contracts (order_id, supplier_id, contract_no, type, amount, subtotal, vat_amount, payment_method, our_signer, vendor_signer, document_html, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [order.id, order.supplier_id || null, contractNo, type, total, subtotal, vat, payment.raw, ourSignerName,
      supplier?.representative || supplier?.contact_name || '', documentHtml, 'Nháp']
  );
  await query('UPDATE contracts SET file_url = ? WHERE id = ?', [`/api/contracts/${r.insertId}/document`, r.insertId]);
  return { id: r.insertId, contract_no: contractNo, type };
}

// LIST
router.get('/', wrap(async (req, res) => {
  const { q, type } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(c.contract_no LIKE ? OR o.order_code LIKE ? OR s.name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (type) { where.push('c.type = ?'); params.push(type); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(
    `SELECT c.id, c.contract_no, c.type, c.amount, c.status, c.sign_date, c.payment_method, c.our_signer, c.vendor_signer, c.file_url,
            o.order_code, o.project_name, s.name AS supplier_name, c.created_at
     FROM contracts c LEFT JOIN orders o ON o.id=c.order_id LEFT JOIN suppliers s ON s.id=c.supplier_id
     ${whereSql} ORDER BY c.id DESC LIMIT 200`, params);
  res.json({ data: rows });
}));

router.get('/:id', wrap(async (req, res) => {
  const rows = await query(
    `SELECT c.*, o.order_code, o.project_name, s.name AS supplier_name
     FROM contracts c LEFT JOIN orders o ON o.id=c.order_id LEFT JOIN suppliers s ON s.id=c.supplier_id WHERE c.id = ?`, [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Không tìm thấy hợp đồng' });
  const { document_html, ...meta } = rows[0];
  res.json(meta);
}));

// Lấy buffer mẫu (ưu tiên bản admin upload trong settings, mặc định file trong repo).
async function templateBuffer(type) {
  const key = type === 'DDH' ? 'tpl_po' : 'tpl_hd';
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', [key]);
  if (rows.length && rows[0].value) return Buffer.from(rows[0].value, 'base64');
  return fs.readFileSync(path.join(TPL_DIR, type === 'DDH' ? 'po.docx' : 'hd.docx'));
}

// Dựng dữ liệu điền vào mẫu docx.
async function buildDocxData(contract) {
  const [order] = await query('SELECT o.*, t.code AS team_code FROM orders o LEFT JOIN teams t ON t.id=o.team_id WHERE o.id = ?', [contract.order_id]);
  let sup = null;
  if (contract.supplier_id) [sup] = await query('SELECT * FROM suppliers WHERE id = ?', [contract.supplier_id]);
  const items = await query('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [contract.order_id]);
  const amount = Number(contract.amount || 0);
  const p = parsePayment(order?.payment_method, amount);
  return {
    VENDOR_NO: order?.po_no || contract.contract_no || order?.order_code || '',
    TODAY: new Date().toLocaleDateString('vi-VN'),
    MASTER_CONTRACT_NO: sup?.master_contract || order?.contract_no || '',
    DAI_DIEN_CTY_KY: contract.our_signer || '', CHUC_VU_DAI_DIEN_CTY: 'Giám đốc',
    NCC: sup?.name || '', DIA_CHI: sup?.address || '', MA_SO_THUE: sup?.tax_code || '',
    NGUOI_DAI_DIEN: sup?.representative || sup?.contact_name || '', CHUC_VU_DAI_DIEN_NCC: sup?.rep_title || '',
    SO_TAI_KHOAN: sup?.bank_account || '', NGAN_HANG: sup?.bank_name || '', CHI_NHANH_NGAN_HANG: sup?.bank_branch || '',
    TOTAL_THANH_TIEN: moneyVnd(contract.subtotal), TOAL_TIEN_THUE: moneyVnd(contract.vat_amount),
    TOTAL_TONG_TIEN: moneyVnd(amount), BANG_CHU_TONG_TIEN: numToVietnamese(amount),
    DEPOSIT_PERCENT: p.depositPercent, DEPOSIT_AMOUNT: moneyVnd(p.depositAmount), DEPOSIT_AMOUNT_IN_WORDS: numToVietnamese(p.depositAmount), DEPOSIT_DUE_DAYS: 14,
    BALANCE_PERCENT: p.balancePercent, BALANCE_AMOUNT: moneyVnd(p.balanceAmount), BALANCE_AMOUNT_IN_WORDS: numToVietnamese(p.balanceAmount), BALANCE_DUE_DAYS: 30,
    NGAY_NHAN: order?.expected_date || '', NHAN_SU_PT: sup?.delivery_person || '', EMAIL: sup?.delivery_email || sup?.contact_email || '', DT_NS_PT: sup?.delivery_phone || '',
    items: items.map((it) => ({
      TEN_HANG: it.item_name, DVT: it.unit || '', SL: it.quantity, DON_GIA: moneyVnd(it.unit_price),
      VAT: `${Math.round(Number(it.vat_rate) * 100)}%`, THANH_TIEN: moneyVnd(it.thanh_tien ?? it.line_total),
    })),
  };
}

// Tải hợp đồng .docx (điền từ mẫu của bạn).
router.get('/:id/docx', wrap(async (req, res) => {
  const [c] = await query('SELECT * FROM contracts WHERE id = ?', [req.params.id]);
  if (!c) return res.status(404).json({ error: 'Không tìm thấy hợp đồng' });
  const buf = renderContract(await templateBuffer(c.type), await buildDocxData(c));
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${c.contract_no || 'hop-dong'}.docx"`);
  res.send(buf);
}));

// Upload mẫu .docx (admin) — type=DDH|HD.
router.post('/template/:type', requireRole('admin'), wrap(async (req, res) => {
  const type = req.params.type === 'DDH' ? 'DDH' : 'HD';
  const key = type === 'DDH' ? 'tpl_po' : 'tpl_hd';
  let data = req.body?.fileBase64 || '';
  const m = /^data:[^;]+;base64,(.*)$/s.exec(data); if (m) data = m[1];
  if (!data) return res.status(400).json({ error: 'Thiếu file' });
  await query('INSERT INTO settings (`key`, value, description) VALUES (?,?,?) ON DUPLICATE KEY UPDATE value=VALUES(value)',
    [key, data, `Mẫu hợp đồng ${type}`]);
  res.json({ ok: true });
}));

// Xem văn bản hợp đồng (HTML)
router.get('/:id/document', wrap(async (req, res) => {
  const rows = await query('SELECT document_html FROM contracts WHERE id = ?', [req.params.id]);
  if (!rows.length || !rows[0].document_html) return res.status(404).send('Không tìm thấy văn bản');
  res.type('html').send(rows[0].document_html);
}));

// Tạo hợp đồng từ đơn hàng
router.post('/from-order', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const { order_id, type } = req.body || {};
  if (!order_id) return res.status(400).json({ error: 'Thiếu order_id' });
  const out = await createFromOrder(order_id, type);
  res.status(201).json(out);
}));

// Cập nhật metadata (số HĐ, ngày ký, trạng thái…) + ghi ngược sang đơn hàng.
router.put('/:id', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const data = pick(req.body, ['contract_no', 'sign_date', 'status', 'our_signer', 'vendor_signer', 'payment_method', 'type']);
  if (Object.keys(data).length) {
    const clause = Object.keys(data).map((k) => `\`${k}\` = ?`).join(', ');
    await query(`UPDATE contracts SET ${clause} WHERE id = ?`, [...Object.values(data), req.params.id]);
  }
  // Ghi SO_HOP_DONG / NGAY_KY_HD ngược lại đơn hàng (bám procureSaveContractMeta).
  if (data.contract_no || data.sign_date) {
    const [c] = await query('SELECT order_id FROM contracts WHERE id = ?', [req.params.id]);
    if (c?.order_id) {
      await query('UPDATE orders SET contract_no = COALESCE(?, contract_no) WHERE id = ?', [data.contract_no || null, c.order_id]);
    }
  }
  res.json({ ok: true });
}));

router.delete('/:id', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  await query('DELETE FROM contracts WHERE id = ?', [req.params.id]);
  res.json({ ok: true });
}));

// Auto-create theo quy tắc (>=20tr, đúng trạng thái, có NCC, chưa có HĐ).
router.post('/auto-run', requireRole('admin', 'purchasing'), wrap(async (req, res) => {
  const orders = await query(
    `SELECT o.id, o.total_amount, o.status, o.supplier_id
     FROM orders o WHERE o.supplier_id IS NOT NULL AND o.total_amount >= ?
       AND o.status IN (${AUTO_DOC_STATUSES.map(() => '?').join(',')})
       AND NOT EXISTS (SELECT 1 FROM contracts c WHERE c.order_id = o.id)`,
    [MIN_VALUE_AUTO_DOC, ...AUTO_DOC_STATUSES]
  );
  const created = [];
  for (const o of orders) {
    const out = await createFromOrder(o.id);
    created.push(out);
  }
  res.json({ ok: true, created: created.length, contracts: created });
}));

export default router;
