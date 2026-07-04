import { Router } from 'express';
import XLSX from 'xlsx';
import { query, pool } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap } from '../util.js';
import { noAccent } from '../lib/codes.js';

const router = Router();
router.use(authRequired, requireRole('admin'));

const s = (v) => (v === undefined || v === null ? '' : String(v).trim());
const n = (v) => { const x = Number(String(v).replace(/[^0-9.-]/g, '')); return isNaN(x) ? 0 : x; };

// Chuyển ngày (Date/serial/chuỗi) -> YYYY-MM-DD hoặc null.
function toDate(v) {
  if (!v) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`; }
  const str = String(v).trim();
  let m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(str);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(str);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

// Map tiến trình tiếng Việt -> code workflow.
function mapStatus(v) {
  const t = noAccent(v).toLowerCase();
  if (/cancel|huy/.test(t)) return 'cancelled';
  if (/hoan (thanh|tat)/.test(t)) return 'completed';
  if (/thanh toan/.test(t)) return 'paid';
  if (/ban giao/.test(t)) return 'documented';
  if (/nhan hang/.test(t)) return 'received';
  if (/dat hang/.test(t)) return 'ordered';
  if (/bao gia/.test(t)) return 'quoted';
  if (/lam mau|dang xu/.test(t)) return 'in_progress';
  if (/cho xu/.test(t)) return 'new';
  return 'new';
}

router.post('/', wrap(async (req, res) => {
  const b64 = req.body?.fileBase64;
  if (!b64) return res.status(400).json({ error: 'Thiếu fileBase64' });
  const wb = XLSX.read(Buffer.from(b64, 'base64'), { type: 'buffer', cellDates: true });
  const result = {};

  // ---- 1. DM_SP -> categories (từ điển loại hàng) ----
  if (wb.Sheets['DM_SP']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['DM_SP'], { defval: '' });
    let c = 0;
    for (const r of rows) {
      const aliases = s(r.LOAI_HH); const abbr = s(r.ABBR2); const name = s(r.MO_TA) || aliases.split(';')[0];
      if (!name) continue;
      const code = (noAccent(name).toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 40)) || abbr || ('C' + c);
      await query(
        'INSERT INTO categories (code, name, abbr, aliases) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), abbr=VALUES(abbr), aliases=VALUES(aliases)',
        [code, name, abbr, aliases]
      );
      c++;
    }
    result.categories = c;
  }

  // ---- 2. NCC -> suppliers ----
  const supMap = new Map(); // name(normalized) -> id
  if (wb.Sheets['NCC']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['NCC'], { header: 1, defval: '' });
    let c = 0;
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const name = s(r[0]); if (!name) continue;
      await query(
        `INSERT INTO suppliers (name, tax_code, address, representative, contact_phone, contact_email, bank_name, bank_account, bank_branch, master_contract, rep_title, delivery_person, delivery_phone, delivery_email)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE tax_code=VALUES(tax_code), address=VALUES(address), representative=VALUES(representative),
           contact_phone=VALUES(contact_phone), contact_email=VALUES(contact_email), bank_name=VALUES(bank_name),
           bank_account=VALUES(bank_account), bank_branch=VALUES(bank_branch), master_contract=VALUES(master_contract),
           rep_title=VALUES(rep_title), delivery_person=VALUES(delivery_person), delivery_phone=VALUES(delivery_phone), delivery_email=VALUES(delivery_email)`,
        [name, s(r[1]), s(r[2]), s(r[3]), s(r[4]), s(r[5]), s(r[6]), s(r[7]), s(r[8]), s(r[9]), s(r[11]), s(r[12]), s(r[13]), s(r[14])]
      );
      c++;
    }
    result.suppliers = c;
  }
  // nạp map NCC hiện có
  for (const row of await query('SELECT id, name FROM suppliers')) supMap.set(noAccent(row.name).toUpperCase().trim(), row.id);
  async function supplierId(name) {
    const key = noAccent(name).toUpperCase().trim();
    if (!key) return null;
    if (supMap.has(key)) return supMap.get(key);
    const r = await query('INSERT INTO suppliers (name) VALUES (?)', [name]);
    supMap.set(key, r.insertId);
    return r.insertId;
  }

  // ---- 3. DATA -> orders + order_items (nhóm theo MA_DH) ----
  if (wb.Sheets['DATA']) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets['DATA'], { defval: '' }).filter((r) => s(r.MA_DH) && !s(r.DA_XOA));
    // team code -> id
    const teamMap = new Map();
    for (const row of await query('SELECT id, code FROM teams')) teamMap.set(row.code, row.id);
    async function teamId(code) {
      code = s(code).toUpperCase(); if (!code) return null;
      if (teamMap.has(code)) return teamMap.get(code);
      const r = await query('INSERT INTO teams (code, name) VALUES (?,?) ON DUPLICATE KEY UPDATE code=code', [code, code]);
      const id = r.insertId || (await query('SELECT id FROM teams WHERE code=?', [code]))[0].id;
      teamMap.set(code, id); return id;
    }
    // gom nhóm
    const groups = new Map();
    for (const r of rows) { const k = s(r.MA_DH); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }

    let orderN = 0, itemN = 0;
    const conn = await pool.getConnection();
    try {
      for (const [maDh, lines] of groups) {
        const h = lines[0];
        const tId = await teamId(h.TEAM);
        const sId = await supplierId(s(h.NCC));
        await conn.query('DELETE FROM orders WHERE order_code = ?', [maDh]); // idempotent
        await conn.query(
          `INSERT INTO orders (order_code, requester_email, requester_name, team_id, supplier_id, project_name, pm, status, status_raw,
             hang_muc, qdnb_tbkm, request_date, expected_date, actual_date, receiving_point, pr_no, contract_no, payment_method, payment_term,
             warehouse_status, po_no, note, total_amount)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0)`,
          [maDh, s(h.EMAIL), s(h.TEN) || s(h.TEN_NGUOI_YEU_CAU), tId, sId, s(h.TEN_DU_AN), s(h.PM), mapStatus(h.TIEN_TRINH), s(h.TIEN_TRINH),
            s(h.HANG_MUC), s(h.QDNB_TBKM), toDate(h.NGAY_YC), toDate(h.NGAY_NHAN), toDate(h.NGAY_THUC_NHAN), s(h.DIEM_NHAN), s(h.SO_PR),
            s(h.SO_HOP_DONG), s(h.HINH_THUC_TT), s(h.THOI_HAN_TT), s(h.NHAP_KHO), s(h.PO_NO), s(h.GHI_CHU)]
        );
        const [[{ id: orderId }]] = await conn.query('SELECT LAST_INSERT_ID() AS id');
        let total = 0;
        for (const r of lines) {
          const lineSup = await supplierId(s(r.NCC));
          const tong = n(r.TONG_TIEN) || Math.round(n(r.SO_LUONG) * n(r.DON_GIA) * (1 + n(r.VAT)));
          total += tong;
          await conn.query(
            `INSERT INTO order_items (order_id, loai_hh, item_name, description, quantity, unit_price, vat_rate, discount_rate,
               thanh_tien, tien_thue, line_total, unit, supplier_id, master_contract, so_pr, quotation_url, design_link, note,
               item_code, nhap_kho, qdnb_tbkm, image_url, progress)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [orderId, s(r.LOAI_HH), s(r.TEN_HANG), s(r.MO_TA_NGAN), n(r.SO_LUONG), n(r.DON_GIA), n(r.VAT), n(r.CHIET_KHAU),
              n(r.THANH_TIEN), n(r.TIEN_THUE), tong, s(r.DVT), lineSup, s(r.MASTER_CONTRACT), s(r.SO_PR), s(r.FILE_BG),
              s(r.THIET_KE) || s(r.LINK_THIET_KE), s(r.GHI_CHU), s(r.MA_HANG), s(r.NHAP_KHO), s(r.QDNB_TBKM), s(r.IMAGE_URL), s(r.TIEN_TRINH)]
          );
          itemN++;
        }
        await conn.query('UPDATE orders SET total_amount = ? WHERE id = ?', [total, orderId]);
        orderN++;
      }
      result.orders = orderN; result.order_items = itemN;
    } finally { conn.release(); }
  }

  res.json({ ok: true, ...result });
}));

export default router;
