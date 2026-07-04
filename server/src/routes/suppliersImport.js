import { Router } from 'express';
import XLSX from 'xlsx';
import { query } from '../db.js';
import { authRequired, requireRole } from '../middleware/auth.js';
import { wrap } from '../util.js';
import { noAccent } from '../lib/codes.js';

const router = Router();
router.use(authRequired, requireRole('admin', 'purchasing'));

const s = (v) => (v === undefined || v === null ? '' : String(v).trim());
const n = (v, dflt = 0) => { if (v === undefined || v === null || v === '') return dflt; const x = Number(String(v).replace(/[^0-9.-]/g, '')); return isNaN(x) ? dflt : x; };
const bool1 = (v) => { const t = noAccent(s(v)).toLowerCase(); if (!t) return 1; return ['0', 'false', 'khong', 'k'].includes(t) ? 0 : 1; };

// Header cột NCC (tiếng Việt, khớp form) -> field DB. Đọc theo TÊN cột, không theo vị trí.
const HEADER_MAP = [
  { key: 'name', headers: ['ten ncc', 'ncc', 'ten nha cung cap', 'ten'] },
  { key: 'vendor_no', headers: ['ma ncc', 'vendor_no', 'ma nha cung cap'] },
  { key: 'tax_code', headers: ['ma so thue', 'tax_code'] },
  { key: 'address', headers: ['dia chi', 'address'] },
  { key: 'contact_name', headers: ['nguoi lien he', 'contact_name'] },
  { key: 'contact_phone', headers: ['dien thoai', 'sdt', 'contact_phone'] },
  { key: 'contact_email', headers: ['email', 'contact_email'] },
  { key: 'payment_term_days', headers: ['cong no (ngay)', 'cong no', 'payment_term_days'], type: 'number' },
  { key: 'representative', headers: ['nguoi dai dien ky', 'nguoi dai dien', 'representative'] },
  { key: 'rep_title', headers: ['chuc vu nguoi dai dien', 'rep_title'] },
  { key: 'master_contract', headers: ['so hop dong khung', 'master_contract'] },
  { key: 'bank_name', headers: ['ngan hang', 'bank_name'] },
  { key: 'bank_account', headers: ['so tai khoan', 'bank_account'] },
  { key: 'bank_branch', headers: ['chi nhanh nh', 'chi nhanh ngan hang', 'bank_branch'] },
  { key: 'delivery_person', headers: ['nguoi giao hang', 'delivery_person'] },
  { key: 'delivery_phone', headers: ['sdt nguoi giao hang', 'dien thoai nguoi giao hang', 'delivery_phone'] },
  { key: 'delivery_email', headers: ['email nguoi giao hang', 'delivery_email'] },
  { key: 'is_active', headers: ['hoat dong (1/0)', 'hoat dong', 'is_active'], type: 'bool' },
];

function normHeader(h) { return noAccent(s(h)).toLowerCase().replace(/\s+/g, ' ').trim(); }

// Đoán cột trong sheet -> field DB theo tên header (không phân biệt dấu/hoa-thường).
function buildColumnMap(headerRow) {
  const map = {}; // colIndex -> field key
  headerRow.forEach((raw, idx) => {
    const h = normHeader(raw);
    if (!h) return;
    for (const def of HEADER_MAP) {
      if (def.headers.includes(h)) { map[idx] = def; break; }
    }
  });
  return map;
}

router.post('/', wrap(async (req, res) => {
  const b64 = req.body?.fileBase64;
  if (!b64) return res.status(400).json({ error: 'Thiếu fileBase64' });
  const wb = XLSX.read(Buffer.from(b64, 'base64'), { type: 'buffer', cellDates: true });
  const sheetName = wb.SheetNames.includes('NCC') ? 'NCC' : wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) return res.status(400).json({ error: 'File không có dữ liệu' });

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  if (!rows.length) return res.status(400).json({ error: 'File trống' });
  const colMap = buildColumnMap(rows[0]);
  if (!Object.values(colMap).some((d) => d.key === 'name')) {
    return res.status(400).json({ error: 'Không tìm thấy cột "Tên NCC" ở dòng tiêu đề (dòng 1)' });
  }

  let created = 0, updated = 0;
  const errors = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || !r.length || r.every((c) => s(c) === '')) continue;
    const data = {};
    for (const [idxStr, def] of Object.entries(colMap)) {
      const raw = r[Number(idxStr)];
      if (def.type === 'number') data[def.key] = n(raw, def.key === 'payment_term_days' ? 14 : 0);
      else if (def.type === 'bool') data[def.key] = bool1(raw);
      else data[def.key] = s(raw);
    }
    if (!data.name) { errors.push(`Dòng ${i + 1}: thiếu Tên NCC`); continue; }
    if (data.payment_term_days === undefined) data.payment_term_days = 14;
    if (data.is_active === undefined) data.is_active = 1;

    const existing = await query('SELECT id FROM suppliers WHERE name = ?', [data.name]);
    const cols = Object.keys(data);
    if (existing.length) {
      const setSql = cols.map((c) => `\`${c}\` = ?`).join(', ');
      await query(`UPDATE suppliers SET ${setSql} WHERE id = ?`, [...cols.map((c) => data[c]), existing[0].id]);
      updated++;
    } else {
      const colSql = cols.map((c) => `\`${c}\``).join(', ');
      const ph = cols.map(() => '?').join(', ');
      await query(`INSERT INTO suppliers (${colSql}) VALUES (${ph})`, cols.map((c) => data[c]));
      created++;
    }
  }

  res.json({ ok: true, created, updated, total: created + updated, errors, mapped_columns: Object.values(colMap).map((d) => d.key) });
}));

export default router;
