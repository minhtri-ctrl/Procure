import XLSX from 'xlsx';
import { config } from '../config.js';

export const QUOTATION_MAX_BYTES = 5 * 1024 * 1024;
export const QUOTATION_ACCEPTED = ['.xlsx', '.xls', '.csv', '.pdf', '.png', '.jpg', '.jpeg', '.webp'];
const SPREADSHEET_EXTENSIONS = ['.xlsx', '.xls', '.csv'];
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

const FIELDS = {
  item_name: ['ten hang', 'ten san pham', 'hang hoa', 'san pham', 'description', 'item'],
  quantity: ['sl', 'so luong', 'quantity', 'qty'],
  unit_price: ['don gia', 'gia', 'unit price', 'price'],
  vat_percent: ['vat', 'vat%', 'thue gtgt', 'thue', 'tax'],
  supplier_name: ['ncc', 'nha cung cap', 'supplier', 'vendor'],
};

function plain(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().trim();
}
function numberValue(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = String(value ?? '').replace(/[^0-9,.-]/g, '').trim();
  if (!text) return null;
  const normalized = text.includes(',') && text.includes('.')
    ? (text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, ''))
    : text.replace(/[,\.](?=\d{3}(\D|$))/g, '').replace(',', '.');
  const valueNumber = Number(normalized);
  return Number.isFinite(valueNumber) ? valueNumber : null;
}
function findColumn(headers, aliases) {
  return headers.findIndex((header) => aliases.some((alias) => plain(header).includes(alias)));
}
function issuesFor(item) {
  return [
    !item.item_name && 'Thiếu TÊN HÀNG',
    !(Number(item.quantity) > 0) && 'Thiếu hoặc không hợp lệ SL',
    !(item.unit_price !== null && Number(item.unit_price) >= 0) && 'Thiếu hoặc không hợp lệ ĐƠN GIÁ',
    !(item.vat_percent !== null && Number(item.vat_percent) >= 0 && Number(item.vat_percent) <= 100) && 'Thiếu hoặc không hợp lệ VAT%',
    !item.supplier_name && 'Thiếu NCC',
  ].filter(Boolean);
}
function normalized(item, source = {}) {
  const vatRaw = numberValue(item.vat_percent);
  const sourceFields = source && typeof source === 'object' && !Array.isArray(source)
    ? source
    : (source ? { ai_raw: String(source) } : {});
  const line = {
    item_name: String(item.item_name || '').trim(),
    quantity: numberValue(item.quantity),
    unit_price: numberValue(item.unit_price),
    vat_percent: vatRaw !== null && vatRaw >= 0 && vatRaw <= 1 ? vatRaw * 100 : vatRaw,
    supplier_name: String(item.supplier_name || '').trim(),
    raw: {
      item_name: String(item.item_name ?? ''), quantity: String(item.quantity ?? ''),
      unit_price: String(item.unit_price ?? ''), vat_percent: String(item.vat_percent ?? ''), supplier_name: String(item.supplier_name ?? ''),
      ...sourceFields,
    },
  };
  line.issues = issuesFor(line);
  line.confidence = line.issues.length ? 'warning' : 'high';
  return line;
}

export function validateExtraction(payload) {
  const input = Array.isArray(payload?.items) ? payload.items.slice(0, 200) : [];
  return input.map((item) => normalized(item, item.raw)).filter((item) => item.item_name || item.quantity !== null || item.unit_price !== null || item.vat_percent !== null || item.supplier_name);
}

function loadWorkbook({ filename, dataBase64 }) {
  const ext = String(filename || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
  if (!SPREADSHEET_EXTENSIONS.includes(ext)) throw Object.assign(new Error('Định dạng bảng tính không hợp lệ.'), { status: 415 });
  const buffer = Buffer.from(String(dataBase64 || ''), 'base64');
  if (!buffer.length || buffer.length > QUOTATION_MAX_BYTES) throw Object.assign(new Error('File rỗng hoặc vượt giới hạn 5 MB.'), { status: 413 });
  try { return XLSX.read(buffer, { type: 'buffer', raw: false, codepage: 65001 }); }
  catch { throw Object.assign(new Error('Không đọc được file báo giá.'), { status: 400 }); }
}

function documentType({ filename, dataBase64 }) {
  const ext = String(filename || '').toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || '';
  if (!QUOTATION_ACCEPTED.includes(ext)) throw Object.assign(new Error('Định dạng chưa hỗ trợ. Hãy dùng Excel, CSV, PDF, PNG, JPG hoặc WEBP.'), { status: 415 });
  const buffer = Buffer.from(String(dataBase64 || ''), 'base64');
  if (!buffer.length || buffer.length > QUOTATION_MAX_BYTES) throw Object.assign(new Error('File rỗng hoặc vượt giới hạn 5 MB.'), { status: 413 });
  if (ext === '.pdf' && buffer.subarray(0, 5).toString() !== '%PDF-') throw Object.assign(new Error('File PDF không hợp lệ.'), { status: 400 });
  if (ext === '.png' && !(buffer[0] === 0x89 && buffer.subarray(1, 4).toString() === 'PNG')) throw Object.assign(new Error('Ảnh PNG không hợp lệ.'), { status: 400 });
  if (['.jpg', '.jpeg'].includes(ext) && !(buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)) throw Object.assign(new Error('Ảnh JPEG không hợp lệ.'), { status: 400 });
  if (ext === '.webp' && !(buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP')) throw Object.assign(new Error('Ảnh WEBP không hợp lệ.'), { status: 400 });
  return { ext, kind: ext === '.pdf' ? 'pdf' : IMAGE_EXTENSIONS.includes(ext) ? 'image' : 'spreadsheet' };
}

function rawTablesForAI(input) {
  const workbook = loadWorkbook(input);
  return workbook.SheetNames.slice(0, 8).map((sheet) => ({
    sheet,
    rows: XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { header: 1, defval: '' }).slice(0, 120).map((row) => row.slice(0, 20).map((cell) => String(cell ?? ''))),
  })).filter((table) => table.rows.length);
}

export function parseQuotationFile({ filename, dataBase64 }) {
  const workbook = loadWorkbook({ filename, dataBase64 });
  const tables = [];
  for (const sheetName of workbook.SheetNames.slice(0, 10)) {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });
    const headerRow = rows.findIndex((row) => row.some((cell) => FIELDS.item_name.some((alias) => plain(cell).includes(alias))));
    if (headerRow < 0) continue;
    const headers = rows[headerRow];
    const columns = Object.fromEntries(Object.entries(FIELDS).map(([key, aliases]) => [key, findColumn(headers, aliases)]));
    const items = rows.slice(headerRow + 1, headerRow + 201).map((row, offset) => normalized({
      item_name: columns.item_name >= 0 ? row[columns.item_name] : '',
      quantity: columns.quantity >= 0 ? row[columns.quantity] : '',
      unit_price: columns.unit_price >= 0 ? row[columns.unit_price] : '',
      vat_percent: columns.vat_percent >= 0 ? row[columns.vat_percent] : '',
      supplier_name: columns.supplier_name >= 0 ? row[columns.supplier_name] : '',
    }, { sheet: sheetName, row: headerRow + offset + 2 })).filter((item) => item.item_name || item.quantity !== null || item.unit_price !== null || item.vat_percent !== null || item.supplier_name);
    if (items.length) tables.push({ sheet: sheetName, items });
  }
  if (!tables.length) throw Object.assign(new Error('Không tìm thấy bảng có cột TÊN HÀNG trong file. Hãy kiểm tra tiêu đề cột.'), { status: 422 });
  return tables;
}

async function extractWithOpenAI(rawTables) {
  const prompt = `Đọc các bảng báo giá dưới đây, dù tiêu đề/cấu trúc có khác nhau. Trích xuất từng dòng hàng; không suy diễn giá trị thiếu. VAT% là phần trăm thuế suất (ví dụ 8, 10 hoặc 0), không phải số tiền thuế. Nhận diện NCC theo từng bảng/dòng; tuyệt đối không gộp hàng giữa NCC. Trả về tối đa 200 dòng. Dữ liệu bảng gốc: ${JSON.stringify(rawTables)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const schema = {
      type: 'object', additionalProperties: false, required: ['items'],
      properties: {
        items: {
          type: 'array', maxItems: 200,
          items: {
            type: 'object', additionalProperties: false,
            required: ['item_name', 'quantity', 'unit_price', 'vat_percent', 'supplier_name', 'raw'],
            properties: {
              item_name: { type: ['string', 'null'] }, quantity: { type: ['number', 'null'] },
              unit_price: { type: ['number', 'null'] }, vat_percent: { type: ['number', 'null'] },
              supplier_name: { type: ['string', 'null'] }, raw: { type: ['string', 'null'] },
            },
          },
        },
      },
    };
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${config.ai.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.QUOTATION_AI_MODEL || config.ai.model,
        messages: [{ role: 'system', content: 'You extract procurement quotations. Return only the supplied JSON schema. Preserve source values in raw; use null when unknown.' }, { role: 'user', content: prompt }],
        response_format: { type: 'json_schema', json_schema: { name: 'quotation_extraction', strict: true, schema } },
        max_tokens: 3500,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'AI không thể đọc báo giá');
    return validateExtraction(JSON.parse(data.choices?.[0]?.message?.content || '{}'));
  } finally { clearTimeout(timeout); }
}

function outputSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['items'],
    properties: { items: { type: 'array', maxItems: 200, items: { type: 'object', additionalProperties: false, required: ['item_name', 'quantity', 'unit_price', 'vat_percent', 'supplier_name', 'raw'], properties: { item_name: { type: ['string', 'null'] }, quantity: { type: ['number', 'null'] }, unit_price: { type: ['number', 'null'] }, vat_percent: { type: ['number', 'null'] }, supplier_name: { type: ['string', 'null'] }, raw: { type: ['string', 'null'] } } } } },
  };
}

function responseText(data) {
  if (data.output_text) return data.output_text;
  return (data.output || []).flatMap((item) => item.content || []).filter((part) => part.type === 'output_text').map((part) => part.text).join('');
}

async function extractVisualWithOpenAI(input, type) {
  const prompt = 'Trích xuất từng dòng trong báo giá. Không suy diễn giá trị thiếu. VAT% là thuế suất phần trăm, không phải số tiền thuế. Khi có nhiều NCC/bảng, giữ từng dòng với NCC đúng của nó và không gộp giữa các NCC. Giữ giá trị thấy được trong raw; trả về tối đa 200 dòng.';
  const content = [{ type: 'input_text', text: prompt }];
  // Responses API expects inline file content as a base64 data URL, not raw base64.
  if (type.kind === 'pdf') content.push({ type: 'input_file', filename: input.filename, file_data: `data:application/pdf;base64,${input.dataBase64}` });
  else content.push({ type: 'input_image', image_url: `data:${type.ext === '.png' ? 'image/png' : type.ext === '.webp' ? 'image/webp' : 'image/jpeg'};base64,${input.dataBase64}`, detail: 'high' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${config.ai.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.QUOTATION_AI_MODEL || config.ai.model, store: false, input: [{ role: 'user', content }], text: { format: { type: 'json_schema', name: 'quotation_extraction', strict: true, schema: outputSchema() } }, max_output_tokens: 3500 }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'AI không thể đọc file báo giá');
    return validateExtraction(JSON.parse(responseText(data) || '{}'));
  } finally { clearTimeout(timeout); }
}

export async function extractQuotation(input) {
  const type = documentType(input);
  const canUseAi = !!config.ai.apiKey && config.ai.provider === 'openai' && (!config.demoMode || config.ai.allowDemoExternal);
  if (type.kind !== 'spreadsheet') {
    if (!canUseAi) throw Object.assign(new Error('PDF và ảnh cần AI_PROVIDER=openai, AI_API_KEY hợp lệ, và DEMO_ALLOW_EXTERNAL_AI=1 khi đang ở DEMO_MODE.'), { status: 422 });
    try { return { mode: 'ai', tables: [], items: await extractVisualWithOpenAI(input, type) }; }
    catch (error) { throw Object.assign(new Error(`AI không thể đọc ${type.kind === 'pdf' ? 'PDF' : 'ảnh'}: ${error.message}`), { status: 422 }); }
  }
  const rawTables = rawTablesForAI(input);
  let tables = [];
  try { tables = parseQuotationFile(input); } catch (error) {
    if ((config.demoMode && !config.ai.allowDemoExternal) || !config.ai.apiKey || config.ai.provider !== 'openai') throw error;
  }
  const parserItems = tables.flatMap((table) => table.items);
  // Demo mode only calls an external provider after an explicit administrator opt-in.
  if ((config.demoMode && !config.ai.allowDemoExternal) || !config.ai.apiKey) return { mode: config.demoMode ? 'demo-parser' : 'local-parser', tables, items: parserItems };
  if (config.ai.provider !== 'openai') return { mode: 'local-parser', tables, items: parserItems, warning: 'AI extraction requires AI_PROVIDER=openai; no file was sent externally.' };
  try { return { mode: 'ai', tables, items: await extractWithOpenAI(rawTables) }; }
  catch (error) { return { mode: 'local-parser', tables, items: parserItems, warning: `AI không khả dụng: ${error.message}. Đã dùng parser nội bộ.` }; }
}
