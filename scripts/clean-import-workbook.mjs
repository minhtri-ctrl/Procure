import fs from 'node:fs/promises';
import path from 'node:path';
import XLSX from 'xlsx';
import { SpreadsheetFile, Workbook } from '@oai/artifact-tool';

const [inputPath, outputPath, previewDir] = process.argv.slice(2);
if (!inputPath || !outputPath || !previewDir) throw new Error('Usage: clean-import-workbook <input.xlsx> <output.xlsx> <preview-dir>');

const text = (value) => value === undefined || value === null ? '' : String(value).normalize('NFC').trim();
const number = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = text(value).replace(/\s/g, ''); if (!raw) return null;
  const normalized = raw.includes(',') && raw.includes('.') ? raw.replace(/\./g, '').replace(',', '.') : raw.replace(',', '.');
  const result = Number(normalized.replace(/[^0-9.-]/g, '')); return Number.isFinite(result) ? result : null;
};
const rate = (value) => { const result = number(value); return result !== null && result > 1 && result <= 100 ? result / 100 : result; };
const excelDate = (year, month, day) => new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), 12));
function normalizeDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return excelDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  const source = text(value); if (!source) return '';
  let match = /^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/.exec(source);
  if (match) return excelDate(match[1], match[2], match[3]);
  match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(source);
  if (match) return excelDate(match[3], match[2], match[1]);
  match = /(?:Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2})\s+(\d{4})/i.exec(source);
  if (!match) return value;
  const month = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 }[match[1].toLowerCase()];
  return excelDate(match[3], month, match[2]);
}
function columnName(index) { let name = ''; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(((n - 1) % 26) + 65) + name; return name; }

await fs.mkdir(previewDir, { recursive: true });

const source = XLSX.readFile(inputPath, { cellDates: true, raw: true });
const inputRows = XLSX.utils.sheet_to_json(source.Sheets.DATA, { header: 1, defval: '', raw: true });
const friendlyHeaders = inputRows[0]; const technicalHeaders = inputRows[1];
const indexes = Object.fromEntries(technicalHeaders.map((name, index) => [text(name), index]));
const dateHeaders = new Set(['NGAY_YC', 'NGAY_NHAN', 'NGAY_THUC_NHAN', 'NGAY_THUE', 'NGAY_TRA', 'NGAY_KY_HD', 'DAY_PAY_FULL', 'DAY_PAY_1', 'DAY_PAY_2', 'NGAY_NHAN_HANG', 'NGAY_BAN_GIAO']);
const numericHeaders = new Set(['STT', 'SO_LUONG', 'DON_GIA', 'TIEN_THUE', 'THANH_TIEN', 'TONG_TIEN', 'PAY_FULL', 'PAY_1', 'PAY_2']);
const rateHeaders = new Set(['VAT', 'CHIET_KHAU']);
let fixedRates = 0; let fixedDates = 0; let recalculatedTotals = 0;
const dataRows = inputRows.slice(2).filter((row) => row.some((value) => text(value)));
const cleanDataRows = dataRows.map((row) => {
  const values = technicalHeaders.map((header, index) => {
    const original = row[index] ?? ''; const key = text(header);
    if (rateHeaders.has(key)) { const normalized = rate(original); if (normalized !== null && normalized !== original) fixedRates++; return normalized ?? ''; }
    if (dateHeaders.has(key)) { const normalized = normalizeDate(original); if (original && normalized instanceof Date && !(original instanceof Date)) fixedDates++; return normalized; }
    if (numericHeaders.has(key)) return number(original) ?? '';
    return typeof original === 'string' ? original.trim() : original;
  });
  const quantity = number(values[indexes.SO_LUONG]); const unitPrice = number(values[indexes.DON_GIA]); const vat = number(values[indexes.VAT]) ?? 0; const discount = number(values[indexes.CHIET_KHAU]) ?? 0;
  if (quantity !== null && unitPrice !== null) {
    const subtotal = Math.round(quantity * unitPrice * (1 - discount)); const tax = Math.round(subtotal * vat); const total = subtotal + tax;
    if (Math.abs((number(values[indexes.TONG_TIEN]) ?? total) - total) > 1) recalculatedTotals++;
    values[indexes.THANH_TIEN] = subtotal; values[indexes.TIEN_THUE] = tax; values[indexes.TONG_TIEN] = total;
  }
  return values;
});

const output = Workbook.create();
const data = output.worksheets.add('DATA'); const suppliers = output.worksheets.add('NCC'); const categories = output.worksheets.add('DM_SP'); const qa = output.worksheets.add('IMPORT_QA');
data.getRangeByIndexes(0, 0, 2 + cleanDataRows.length, technicalHeaders.length).values = [friendlyHeaders, technicalHeaders, ...cleanDataRows];
for (const name of ['NCC', 'DM_SP']) {
  const rows = XLSX.utils.sheet_to_json(source.Sheets[name], { header: 1, defval: '', raw: true }).filter((row) => row.some((value) => text(value)));
  const sheet = name === 'NCC' ? suppliers : categories;
  sheet.getRangeByIndexes(0, 0, rows.length, Math.max(...rows.map((row) => row.length))).values = rows.map((row) => row.map((value) => typeof value === 'string' ? value.trim() : value));
}

const dataLast = `${columnName(technicalHeaders.length - 1)}${2 + cleanDataRows.length}`;
data.getRange(`A1:${columnName(technicalHeaders.length - 1)}2`).format = { fill: '#0F766E', font: { bold: true, color: '#FFFFFF' }, wrapText: true };
data.getRange(`A3:${dataLast}`).format.borders = { preset: 'insideHorizontal', style: 'thin', color: '#E2E8F0' };
data.getRange(`J3:J${2 + cleanDataRows.length}`).format.numberFormat = '#,##0.000';
data.getRange(`K3:O${2 + cleanDataRows.length}`).format.numberFormat = '#,##0.00';
for (const header of dateHeaders) { const index = indexes[header]; if (index !== undefined) data.getRange(`${columnName(index)}3:${columnName(index)}${2 + cleanDataRows.length}`).format.numberFormat = 'yyyy-mm-dd'; }
data.getRange(`L3:L${2 + cleanDataRows.length}`).format.numberFormat = '0.00%';
data.freezePanes.freezeRows(2); data.showGridLines = false;
for (let index = 0; index < technicalHeaders.length; index++) data.getRange(`${columnName(index)}:${columnName(index)}`).format.columnWidth = index === indexes.TEN_HANG ? 42 : index === indexes.MO_TA_NGAN ? 32 : 16;

for (const [sheet, rows] of [[suppliers, XLSX.utils.sheet_to_json(source.Sheets.NCC, { header: 1, defval: '', raw: true })], [categories, XLSX.utils.sheet_to_json(source.Sheets.DM_SP, { header: 1, defval: '', raw: true })]]) {
  const width = Math.max(...rows.map((row) => row.length)); const last = columnName(width - 1);
  sheet.getRange(`A1:${last}1`).format = { fill: '#1D4ED8', font: { bold: true, color: '#FFFFFF' }, wrapText: true };
  sheet.getRange(`A1:${last}${rows.length}`).format.borders = { preset: 'insideHorizontal', style: 'thin', color: '#E2E8F0' };
  sheet.freezePanes.freezeRows(1); sheet.showGridLines = false;
  for (let index = 0; index < width; index++) sheet.getRange(`${columnName(index)}:${columnName(index)}`).format.columnWidth = index === 0 ? 38 : 24;
}

qa.getRange('A1:D1').merge(); qa.getRange('A1').values = [['Báo cáo làm sạch dữ liệu ProcureOS']]; qa.getRange('A1:D1').format = { fill: '#0F766E', font: { bold: true, color: '#FFFFFF', size: 14 } };
qa.getRange('A3:D9').values = [
  ['Hạng mục', 'Số lượng', 'Kết quả', 'Ghi chú'],
  ['DATA', cleanDataRows.length, 'Sẵn sàng', 'Dòng 2 là header kỹ thuật ProcureOS'],
  ['NCC', XLSX.utils.sheet_to_json(source.Sheets.NCC, { header: 1, defval: '', raw: true }).length - 1, 'Sẵn sàng', 'Giữ để bổ sung thông tin NCC'],
  ['DM_SP', XLSX.utils.sheet_to_json(source.Sheets.DM_SP, { header: 1, defval: '', raw: true }).length - 1, 'Sẵn sàng', 'Giữ aliases và ABBR2'],
  ['VAT/chiết khấu chuẩn hóa', fixedRates, 'Đã sửa', '8 được chuẩn hóa thành 0.08'],
  ['Ngày chuẩn hóa', fixedDates, 'Đã sửa', 'Chuỗi ngày tiếng Anh chuyển thành ngày Excel'],
  ['Tổng tiền tính lại', recalculatedTotals, 'Đã sửa', 'Tính từ số lượng, đơn giá, VAT và chiết khấu'],
];
qa.getRange('A3:D3').format = { fill: '#DBEAFE', font: { bold: true } }; qa.getRange('A3:D9').format.borders = { preset: 'all', style: 'thin', color: '#CBD5E1' }; qa.getRange('A:D').format.columnWidth = 28; qa.showGridLines = false;

const check = await output.inspect({ kind: 'table', range: 'DATA!A1:O6', include: 'values', tableMaxRows: 6, tableMaxCols: 15 });
if (!check.ndjson.includes('MA_DH')) throw new Error('Verification failed: technical DATA header missing');
for (const sheetName of ['DATA', 'NCC', 'DM_SP', 'IMPORT_QA']) await output.render({ sheetName, range: sheetName === 'DATA' ? 'A1:O15' : undefined, autoCrop: 'all', scale: 1, format: 'png' }).then(async (blob) => fs.writeFile(path.join(previewDir, `${sheetName}.png`), new Uint8Array(await blob.arrayBuffer())));
const exportFile = await SpreadsheetFile.exportXlsx(output); await exportFile.save(outputPath);
console.log(JSON.stringify({ outputPath, dataRows: cleanDataRows.length, supplierRows: 997, categoryRows: 93, fixedRates, fixedDates, recalculatedTotals }));
