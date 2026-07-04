import { Router } from 'express';
import XLSX from 'xlsx';
import { query, pool } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap } from '../util.js';

async function getCompanyInfo() {
  const rows = await query('SELECT value FROM settings WHERE `key` = ?', ['company_info']);
  try { return rows.length && rows[0].value ? JSON.parse(rows[0].value) : {}; } catch { return {}; }
}

async function getSignatory(roleKey, scope) {
  if (scope) {
    const rows = await query('SELECT * FROM signatories WHERE role_key=? AND scope=? AND is_active=1 LIMIT 1', [roleKey, scope]);
    if (rows.length) return rows[0];
  }
  const rows = await query('SELECT * FROM signatories WHERE role_key=? AND scope=? AND is_active=1 LIMIT 1', [roleKey, 'default']);
  return rows[0] || null;
}

function fmtVnDate(d) {
  const dt = d ? new Date(d) : new Date();
  return `Ngày ${dt.getDate()} tháng ${dt.getMonth() + 1} năm ${dt.getFullYear()}`;
}
function fmtDDMMYYYY(d) {
  const dt = d ? new Date(d) : new Date();
  return `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;
}
const firstNonEmpty = (rows, key) => { for (const r of rows) { if (r[key]) return r[key]; } return ''; };

// Dựng HTML Phiếu Nhập/Xuất Kho đúng mẫu S12-DN (Thông tư 200/2014/TT-BTC).
async function buildVoucherHtml(voucherNo) {
  const lines = await query('SELECT * FROM inventory_moves WHERE voucher_no = ? ORDER BY id', [voucherNo]);
  if (!lines.length) return null;
  const type = lines[0].move_type;
  const isNhap = type === 'PNK';
  const company = await getCompanyInfo();
  const thuKho = await getSignatory('thu_kho', 'default');
  const second = await getSignatory(isNhap ? 'truong_phong' : 'ke_toan', 'default');
  const reason = firstNonEmpty(lines, 'note');
  const handler = firstNonEmpty(lines, 'handler_name');
  const qdnb = firstNonEmpty(lines, 'qdnb_tbkm');
  const ticket = firstNonEmpty(lines, 'ticket_xk');
  const warehouse = firstNonEmpty(lines, 'warehouse');
  const total = lines.reduce((s, l) => s + Number(isNhap ? l.qty_in : l.qty_out || 0), 0);

  const rows = lines.map((l, i) => `<tr>
    <td class="c">${i + 1}</td>
    <td>${l.item_name || ''}</td>
    <td class="c">${l.sku || ''}</td>
    <td class="c">${l.so_pr || ''}</td>
    <td class="c">${l.unit || ''}</td>
    <td class="c">${fmtDDMMYYYY(l.move_date)}</td>
    <td class="r">${Number(l.qty_in || 0) || ''}</td>
    <td class="r">${Number(l.qty_out || 0) || ''}</td>
    <td class="r">${Number(l.running_balance || 0)}</td>
  </tr>`).join('');

  const meta = isNhap
    ? `<div>- Họ và tên người yêu cầu: <b>${handler}</b></div>
       <div>- Kho nhập: <b>${warehouse}</b></div>
       <div>- Lý do nhập kho: ${reason}</div>
       <div>- Số ticket TBKM / QĐNB: ${qdnb}</div>`
    : `<div>- Họ và tên người nhận hàng: <b>${handler}</b></div>
       <div>- Kho xuất: <b>${warehouse}</b></div>
       <div>- Lý do xuất kho: ${reason}</div>
       <div>- Số QĐNB / TBKM: ${qdnb}</div>
       <div>- Số ticket xuất kho: ${ticket}</div>`;

  const secondLabel = isNhap ? 'Trưởng phòng' : 'Kế toán';

  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${voucherNo}</title>
  <style>
    body{font-family:'Times New Roman',serif;color:#111;max-width:900px;margin:20px auto;padding:0 20px;font-size:13px;line-height:1.45}
    .hd{display:flex;justify-content:space-between;font-size:12.5px}
    .hd .r{text-align:right}
    h1{text-align:center;font-size:20px;margin:14px 0 2px;letter-spacing:1px}
    .sub{text-align:center;margin:0 0 12px}
    .meta{margin:10px 0 14px}
    table{border-collapse:collapse;width:100%;font-size:12.5px;margin:8px 0}
    th,td{border:1px solid #333;padding:5px 6px}
    .c{text-align:center}.r{text-align:right}
    th{background:#eee;text-align:center;font-weight:600}
    .sign{margin-top:34px;width:100%}
    .sign td{border:none;text-align:center;vertical-align:top;width:50%;padding:4px}
    .muted{color:#555}
    @media print{ .noprint{display:none} body{margin:0 auto} }
  </style></head><body>
  <div class="noprint" style="text-align:right;margin-bottom:10px"><button onclick="window.print()">🖨 In / Xuất PDF</button></div>
  <div class="hd">
    <div>Đơn vị: ${company?.name || ''}<br>Địa chỉ: ${company?.address || ''}</div>
    <div class="r">Mẫu số S12-DN<br>Ban hành theo Thông tư số 200/2014/TT-BTC<br>ngày 22/12/2014 của Bộ Tài chính</div>
  </div>
  <h1>${isNhap ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO'}</h1>
  <p class="sub">${fmtVnDate(lines[0].move_date)}<br><b>${voucherNo}</b></p>
  <div class="meta">${meta}</div>
  <table>
    <thead><tr>
      <th rowspan="2">STT</th>
      <th rowspan="2">Tên, nhãn hiệu, quy cách, phẩm chất<br>vật tư, dụng cụ, sản phẩm, hàng hóa</th>
      <th rowspan="2">Mã hàng hóa</th><th rowspan="2">PR / PO</th>
      <th rowspan="2">Đơn vị<br>tính</th><th rowspan="2">Ngày<br>nhập/xuất</th>
      <th colspan="3">Số lượng</th>
    </tr><tr><th>Nhập</th><th>Xuất</th><th>Tồn</th></tr></thead>
    <tbody>${rows}
      <tr><td colspan="6" class="c"><b>Cộng</b></td>
        <td class="r"><b>${isNhap ? total : ''}</b></td><td class="r"><b>${isNhap ? '' : total}</b></td><td></td></tr>
    </tbody>
  </table>
  <table class="sign"><tr>
    <td><b>Thủ kho</b><br><span class="muted">(Ký, họ tên)</span><br><br><br>${thuKho?.name || ''}</td>
    <td><b>${secondLabel}</b><br><span class="muted">(Ký, họ tên)</span><br><br><br>${second?.name || ''}</td>
  </tr></table>
  </body></html>`;
}

const router = Router();
router.use(authRequired);

const gv = (row, keys) => { for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; } return ''; };

const WH_ROLES = ['admin', 'purchasing', 'warehouse'];

// Chuẩn hoá VAT: nhập 10 -> 0.1; nhập 0.1 giữ nguyên.
function normVat(v) {
  let x = Number(v || 0);
  if (x > 1) x /= 100;
  return x;
}
const num = (v) => Number(v || 0);

// Sinh số chứng từ PNK/PXK-YYMM-NNNN. Nếu >= ngày 25 thì tính sang tháng sau (bám code gốc).
async function nextVoucherNo(type) {
  const d = new Date();
  let yy = d.getFullYear() % 100;
  let m = d.getMonth() + 1;
  if (d.getDate() >= 25) { m += 1; if (m > 12) { m = 1; yy = (yy + 1) % 100; } }
  const prefix = `${type}-${String(yy).padStart(2, '0')}${String(m).padStart(2, '0')}-`;
  const rows = await query('SELECT voucher_no FROM inventory_moves WHERE voucher_no LIKE ?', [prefix + '%']);
  const re = new RegExp('^' + prefix.replace(/-/g, '\\-') + '(\\d{4})$');
  let max = 0;
  for (const r of rows) { const mm = re.exec(r.voucher_no || ''); if (mm) max = Math.max(max, parseInt(mm[1], 10)); }
  return prefix + String(max + 1).padStart(4, '0');
}

async function stockOf(exec, sku, warehouse) {
  const [rows] = await exec.query(
    "SELECT COALESCE(SUM(qty_in - qty_out),0) AS s FROM inventory_moves WHERE sku = ? AND COALESCE(warehouse,'') = ?",
    [sku, warehouse || '']
  );
  return num(rows[0]?.s);
}

// Dựng lại HANG_TON (warehouse_stock) từ toàn bộ XNT (inventory_moves).
async function rebuildStock(exec) {
  const [moves] = await exec.query('SELECT * FROM inventory_moves ORDER BY id');
  const agg = new Map();
  for (const r of moves) {
    const key = `${r.warehouse || ''}|${r.sku || ''}`;
    let it = agg.get(key);
    if (!it) { it = { sku: r.sku, warehouse: r.warehouse, qin: 0, qout: 0, last: {}, item_name: '', unit: '' }; agg.set(key, it); }
    it.qin += num(r.qty_in);
    it.qout += num(r.qty_out);
    it.last = r; // dòng cuối (id lớn nhất do ORDER BY id) — dùng cho giá/vat/meta
    if (r.item_name) it.item_name = r.item_name; // giữ tên hàng khác rỗng gần nhất
    if (r.unit) it.unit = r.unit;
  }
  await exec.query('DELETE FROM warehouse_stock');
  for (const it of agg.values()) {
    const onHand = it.qin - it.qout;
    const price = num(it.last.unit_price);
    const vat = num(it.last.vat_rate);
    const totalValue = Math.round(onHand * price * (1 + vat));
    await exec.query(
      `INSERT INTO warehouse_stock
        (sku, warehouse, team_id, item_name, unit, qty_in, qty_out, qty_on_hand, unit_price, vat_rate, total_value, bin, supplier_id, so_pr, pm, image_url)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [it.sku, it.warehouse, it.last.team_id || null, it.item_name || it.last.item_name, it.unit || it.last.unit, it.qin, it.qout, onHand,
        price, vat, totalValue, it.last.bin, it.last.supplier_id || null, it.last.so_pr, it.last.pm, it.last.image_url]
    );
  }
}

// ---- Tồn kho (HANG_TON) ----
router.get('/stock', wrap(async (req, res) => {
  const { q, warehouse } = req.query;
  const where = [];
  const params = [];
  if (q) { where.push('(s.sku LIKE ? OR s.item_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (warehouse) { where.push('s.warehouse = ?'); params.push(warehouse); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(
    `SELECT s.*, t.name AS team_name, sup.name AS supplier_name
     FROM warehouse_stock s LEFT JOIN teams t ON t.id=s.team_id LEFT JOIN suppliers sup ON sup.id=s.supplier_id
     ${whereSql} ORDER BY s.sku`, params);
  res.json({ data: rows });
}));

// ---- Sổ Xuất-Nhập-Tồn (XNT) ----
router.get('/moves', wrap(async (req, res) => {
  const { q, sku, type, limit = 200 } = req.query;
  const lim = Math.min(Number(limit) || 200, 500);
  const where = [];
  const params = [];
  if (q) { where.push('(voucher_no LIKE ? OR sku LIKE ? OR item_name LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (sku) { where.push('sku = ?'); params.push(sku); }
  if (type) { where.push('move_type = ?'); params.push(type); }
  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = await query(
    `SELECT * FROM inventory_moves ${whereSql} ORDER BY move_date DESC, id DESC LIMIT ?`, [...params, lim]);
  res.json({ data: rows });
}));

// ---- Danh sách phiếu (gộp theo số CT) ----
router.get('/vouchers', wrap(async (req, res) => {
  const { type } = req.query;
  const where = type ? 'WHERE move_type = ?' : '';
  const params = type ? [type] : [];
  const rows = await query(
    `SELECT voucher_no, move_type, MIN(move_date) AS move_date, MAX(warehouse) AS warehouse,
            MAX(handler_name) AS handler_name, COUNT(*) AS line_count,
            SUM(line_total) AS subtotal, SUM(qty_in+qty_out) AS total_qty, MIN(created_at) AS created_at
     FROM inventory_moves ${where}
     GROUP BY voucher_no, move_type ORDER BY created_at DESC LIMIT 200`, params);
  res.json({ data: rows });
}));

// ---- In Phiếu Nhập/Xuất Kho (đúng mẫu S12-DN) ----
router.get('/vouchers/:voucherNo/print', wrap(async (req, res) => {
  const html = await buildVoucherHtml(req.params.voucherNo);
  if (!html) return res.status(404).send('Không tìm thấy phiếu');
  res.type('html').send(html);
}));

// ---- Xoá phiếu (xoá toàn bộ dòng của 1 số chứng từ + dựng lại tồn) ----
router.delete('/vouchers/:voucherNo', requireRole(...WH_ROLES), wrap(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query('DELETE FROM inventory_moves WHERE voucher_no = ?', [req.params.voucherNo]);
    if (!r.affectedRows) { await conn.rollback(); return res.status(404).json({ error: 'Không tìm thấy phiếu' }); }
    await rebuildStock(conn);
    await conn.commit();
    res.json({ ok: true, deleted: r.affectedRows });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// ---- Xoá TOÀN BỘ dữ liệu kho (dọn dữ liệu test) — chỉ admin ----
router.delete('/all', requireRole('admin'), wrap(async (req, res) => {
  if (!req.body || req.body.confirm !== true) return res.status(400).json({ error: 'Cần xác nhận confirm:true' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [m] = await conn.query('DELETE FROM inventory_moves');
    await conn.query('DELETE FROM warehouse_stock');
    await conn.commit();
    res.json({ ok: true, deleted_moves: m.affectedRows });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// ---- Danh sách SKU cho form nhập/xuất ----
router.get('/skus', wrap(async (req, res) => {
  const type = (req.query.type || 'PNK').toUpperCase();
  if (type === 'PXK') {
    const rows = await query(
      `SELECT sku, item_name AS name, unit, unit_price AS price, vat_rate AS vat, supplier_id, team_id,
              qty_on_hand AS qtyDefault, pm, image_url, bin, warehouse
       FROM warehouse_stock WHERE qty_on_hand > 0 ORDER BY sku`);
    return res.json({ data: rows });
  }
  const rows = await query(
    `SELECT sku, name, unit, default_price AS price, vat_rate AS vat, supplier_id, image_url
     FROM products WHERE is_active = 1 ORDER BY sku`);
  res.json({ data: rows });
}));

router.get('/stock-of', wrap(async (req, res) => {
  const s = await stockOf(pool, req.query.sku, req.query.warehouse || null);
  res.json({ sku: req.query.sku, warehouse: req.query.warehouse || null, on_hand: s });
}));

// ---- Ghi phiếu nhập (PNK) / xuất (PXK) ----
router.post('/vouchers', requireRole(...WH_ROLES), wrap(async (req, res) => {
  const b = req.body || {};
  const type = (b.type || '').toUpperCase();
  if (type !== 'PNK' && type !== 'PXK') return res.status(400).json({ error: 'type phải là PNK hoặc PXK' });
  const lines = Array.isArray(b.lines) ? b.lines.filter((l) => l.sku && num(l.qty) > 0) : [];
  if (!lines.length) return res.status(400).json({ error: 'Cần ít nhất 1 dòng hàng' });
  const warehouse = b.warehouse || '';
  const moveDate = b.move_date || new Date().toISOString().slice(0, 10);

  // Xuất kho: kiểm tra đủ tồn (bám code gốc: "Không đủ tồn").
  if (type === 'PXK') {
    for (const l of lines) {
      const cur = await stockOf(pool, l.sku, warehouse);
      if (cur - num(l.qty) < 0) {
        return res.status(400).json({ error: `Không đủ tồn • ${l.sku} • còn: ${cur}, yêu cầu: ${num(l.qty)}` });
      }
    }
  }

  const voucherNo = await nextVoucherNo(type);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const balances = {};
    for (const l of lines) {
      const qty = num(l.qty);
      const price = num(l.price);
      const vat = normVat(l.vat);
      const inQ = type === 'PNK' ? qty : 0;
      const outQ = type === 'PXK' ? qty : 0;
      const key = `${warehouse}|${l.sku}`;
      if (!(key in balances)) balances[key] = await stockOf(conn, l.sku, warehouse);
      balances[key] += inQ - outQ;
      const lineTotal = qty * price;
      await conn.query(
        `INSERT INTO inventory_moves
          (move_date, voucher_no, move_type, warehouse, handler_name, handler_email, sku, item_name, unit,
           qty_in, qty_out, unit_price, line_total, vat_rate, running_balance, team_id, supplier_id, bin,
           so_pr, pm, qdnb_tbkm, ticket_xk, note, image_url)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [moveDate, voucherNo, type, warehouse, b.handler_name || req.user.name, b.handler_email || req.user.email,
          l.sku, l.item_name || l.name || '', l.unit || '', inQ, outQ, price, lineTotal, vat, balances[key],
          l.team_id || null, l.supplier_id || null, l.bin || '', l.so_pr || '', l.pm || '',
          type === 'PNK' ? (l.qdnb || '') : (b.pxk_qdnb || ''),
          type === 'PXK' ? (b.pxk_ticket || '') : '', l.note || b.note || '', l.image_url || '']
      );
    }
    await rebuildStock(conn);
    await conn.commit();
    res.status(201).json({ ok: true, voucher_no: voucherNo, lines: lines.length });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// ---- Dựng lại toàn bộ TON + HANG_TON từ PNK/PXK ----
router.post('/rebuild', requireRole('admin', 'warehouse'), wrap(async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    // Tính lại TON lũy kế theo (kho, sku) theo thứ tự ngày/số CT/id.
    const [moves] = await conn.query('SELECT id, warehouse, sku, qty_in, qty_out FROM inventory_moves ORDER BY move_date, voucher_no, id');
    const ton = {};
    for (const r of moves) {
      const key = `${r.warehouse || ''}|${r.sku || ''}`;
      ton[key] = (ton[key] || 0) + num(r.qty_in) - num(r.qty_out);
      await conn.query('UPDATE inventory_moves SET running_balance = ? WHERE id = ?', [ton[key], r.id]);
    }
    await rebuildStock(conn);
    await conn.commit();
    res.json({ ok: true, moves: moves.length });
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}));

// ---- Export báo cáo kho (tồn + giá trị) ----
router.get('/export', wrap(async (req, res) => {
  const format = (req.query.format || 'xlsx').toLowerCase();
  const rows = await query(
    `SELECT s.sku AS 'Mã hàng', s.item_name AS 'Tên hàng', s.warehouse AS 'Kho', s.unit AS 'ĐVT',
            s.qty_in AS 'Tổng nhập', s.qty_out AS 'Tổng xuất', s.qty_on_hand AS 'Tồn', s.unit_price AS 'Đơn giá',
            s.total_value AS 'Giá trị tồn', sup.name AS 'NCC', s.bin AS 'Vị trí'
     FROM warehouse_stock s LEFT JOIN suppliers sup ON sup.id=s.supplier_id ORDER BY s.sku`);
  const ws = XLSX.utils.json_to_sheet(rows.map((r) => ({ ...r,
    'Tổng nhập': Number(r['Tổng nhập'] || 0), 'Tổng xuất': Number(r['Tổng xuất'] || 0), 'Tồn': Number(r['Tồn'] || 0),
    'Đơn giá': Number(r['Đơn giá'] || 0), 'Giá trị tồn': Number(r['Giá trị tồn'] || 0) })));
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="procureos-kho.csv"');
    return res.send('﻿' + XLSX.utils.sheet_to_csv(ws));
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'TonKho');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="procureos-kho.xlsx"');
  res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}));

// ---- Import tồn kho cũ từ Excel (tạo phiếu nhập "OPENING" + dựng lại tồn) ----
router.post('/import', requireRole('admin', 'warehouse'), wrap(async (req, res) => {
  const b64 = req.body?.fileBase64;
  if (!b64) return res.status(400).json({ error: 'Thiếu fileBase64' });
  const wb = XLSX.read(Buffer.from(b64, 'base64'), { type: 'buffer', cellDates: true });
  const sheet = wb.Sheets[req.body.sheet] || wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  const conn = await pool.getConnection();
  let cnt = 0;
  try {
    await conn.beginTransaction();
    await conn.query("DELETE FROM inventory_moves WHERE voucher_no LIKE 'OPENING-%'");
    const d = new Date();
    const voucher = `OPENING-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
    for (const r of rows) {
      const sku = String(gv(r, ['MHH', 'SKU', 'MA_HANG', 'Mã hàng'])).trim();
      if (!sku) continue;
      const qty = num(gv(r, ['SO_LUONG_TON', 'TON', 'SO_LUONG', 'SL', 'Tồn', 'Số lượng']));
      if (qty <= 0) continue;
      const price = num(gv(r, ['DON_GIA', 'Đơn giá', 'GIA']));
      const vat = normVat(gv(r, ['THUE_SUAT', 'VAT', 'VAT_PCT']));
      const warehouse = String(gv(r, ['KHO', 'Kho', 'WAREHOUSE'])) || 'KHO_1';
      await conn.query(
        `INSERT INTO inventory_moves (move_date, voucher_no, move_type, warehouse, sku, item_name, unit, qty_in, qty_out, unit_price, line_total, vat_rate, running_balance, bin, note)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [d.toISOString().slice(0, 10), voucher, 'PNK', warehouse, sku, String(gv(r, ['TEN_HANG', 'Tên hàng', 'TEN'])), String(gv(r, ['DVT', 'ĐVT'])),
          qty, 0, price, qty * price, vat, qty, String(gv(r, ['BIN', 'Vị trí'])), 'Tồn đầu kỳ (import)']
      );
      cnt++;
    }
    // dựng lại TON lũy kế + HANG_TON
    const [moves] = await conn.query('SELECT id, warehouse, sku, qty_in, qty_out FROM inventory_moves ORDER BY move_date, voucher_no, id');
    const ton = {};
    for (const m of moves) { const k = `${m.warehouse || ''}|${m.sku || ''}`; ton[k] = (ton[k] || 0) + num(m.qty_in) - num(m.qty_out); await conn.query('UPDATE inventory_moves SET running_balance = ? WHERE id = ?', [ton[k], m.id]); }
    await rebuildStock(conn);
    await conn.commit();
    res.json({ ok: true, imported: cnt });
  } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
}));

export default router;
