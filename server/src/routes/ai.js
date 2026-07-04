import { Router } from 'express';
import { query } from '../db.js';
import { authRequired } from '../middleware/auth.js';
import { wrap } from '../util.js';
import { config } from '../config.js';
import { moneyVnd } from '../lib/vn.js';

const router = Router();
router.use(authRequired);

// ---- Bộ công cụ (function tools) đọc dữ liệu thật, bám procureAskAI ----
const TOOLS = [
  { name: 'get_full_statistics', description: 'Số liệu tổng quan: số đơn, tổng chi tiêu, số NCC, số sản phẩm, YC chờ.', input_schema: { type: 'object', properties: {} } },
  { name: 'search_orders', description: 'Tìm đơn hàng theo từ khoá và/hoặc trạng thái.', input_schema: { type: 'object', properties: { q: { type: 'string' }, status: { type: 'string' } } } },
  { name: 'get_order_detail', description: 'Chi tiết một đơn hàng theo mã đơn (order_code).', input_schema: { type: 'object', properties: { order_code: { type: 'string' } }, required: ['order_code'] } },
  { name: 'get_supplier_info', description: 'Thông tin nhà cung cấp và tổng chi tiêu.', input_schema: { type: 'object', properties: { name: { type: 'string' } } } },
  { name: 'get_warehouse_status', description: 'Tình trạng tồn kho (theo SKU nếu có).', input_schema: { type: 'object', properties: { sku: { type: 'string' } } } },
  { name: 'generate_report', description: 'Báo cáo chi tiêu theo team/supplier/month.', input_schema: { type: 'object', properties: { by: { type: 'string', enum: ['team', 'supplier', 'month'] } } } },
  { name: 'get_data_schema', description: 'Danh sách bảng và ý nghĩa trong hệ thống.', input_schema: { type: 'object', properties: {} } },
];

async function executeTool(name, input = {}) {
  switch (name) {
    case 'get_full_statistics': {
      const [[o]] = [await query('SELECT COUNT(*) c, COALESCE(SUM(total_amount),0) s FROM orders WHERE status<>"cancelled"')];
      const [[sup]] = [await query('SELECT COUNT(*) c FROM suppliers')];
      const [[pr]] = [await query('SELECT COUNT(*) c FROM products')];
      const [[req]] = [await query('SELECT COUNT(*) c FROM purchase_requests WHERE status="new"')];
      return { total_orders: o.c, total_spend: Number(o.s), suppliers: sup.c, products: pr.c, pending_requests: req.c };
    }
    case 'search_orders': {
      const where = [];
      const params = [];
      if (input.q) { where.push('(order_code LIKE ? OR project_name LIKE ? OR requester_name LIKE ?)'); params.push(`%${input.q}%`, `%${input.q}%`, `%${input.q}%`); }
      if (input.status) { where.push('status = ?'); params.push(input.status); }
      const rows = await query(`SELECT order_code, project_name, status, total_amount FROM orders ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY id DESC LIMIT 15`, params);
      return { count: rows.length, orders: rows };
    }
    case 'get_order_detail': {
      const [ord] = await query('SELECT * FROM orders WHERE order_code = ?', [input.order_code]);
      if (!ord) return { error: 'Không tìm thấy đơn ' + input.order_code };
      const items = await query('SELECT item_name, quantity, unit_price, line_total FROM order_items WHERE order_id = ?', [ord.id]);
      return { order: { order_code: ord.order_code, project: ord.project_name, status: ord.status, total: Number(ord.total_amount) }, items };
    }
    case 'get_supplier_info': {
      const where = input.name ? 'WHERE s.name LIKE ?' : '';
      const params = input.name ? [`%${input.name}%`] : [];
      const rows = await query(
        `SELECT s.name, s.vendor_no, s.payment_term_days, COUNT(o.id) AS orders, COALESCE(SUM(o.total_amount),0) AS spend
         FROM suppliers s LEFT JOIN orders o ON o.supplier_id=s.id ${where} GROUP BY s.id ORDER BY spend DESC LIMIT 15`, params);
      return { suppliers: rows.map((r) => ({ ...r, spend: Number(r.spend) })) };
    }
    case 'get_warehouse_status': {
      const where = input.sku ? 'WHERE sku LIKE ?' : '';
      const params = input.sku ? [`%${input.sku}%`] : [];
      const rows = await query(`SELECT sku, item_name, warehouse, qty_on_hand, total_value FROM warehouse_stock ${where} ORDER BY sku LIMIT 30`, params);
      return { stock: rows };
    }
    case 'generate_report': {
      const by = input.by || 'team';
      if (by === 'supplier') return { by, rows: await query('SELECT s.name AS label, COALESCE(SUM(o.total_amount),0) AS spend FROM orders o LEFT JOIN suppliers s ON s.id=o.supplier_id GROUP BY o.supplier_id ORDER BY spend DESC LIMIT 10') };
      if (by === 'month') return { by, rows: await query('SELECT DATE_FORMAT(request_date,"%Y-%m") AS label, COALESCE(SUM(total_amount),0) AS spend FROM orders WHERE request_date IS NOT NULL GROUP BY label ORDER BY label DESC LIMIT 12') };
      return { by, rows: await query('SELECT t.name AS label, COALESCE(SUM(o.total_amount),0) AS spend FROM orders o LEFT JOIN teams t ON t.id=o.team_id GROUP BY o.team_id ORDER BY spend DESC LIMIT 10') };
    }
    case 'get_data_schema':
      return { tables: ['orders/order_items (đơn hàng)', 'purchase_requests (yêu cầu mua)', 'suppliers (NCC)', 'products (SKU)', 'warehouse_stock/inventory_moves (kho)', 'contracts (hợp đồng)', 'email_logs (lịch sử email)', 'ratings (đánh giá)', 'teams', 'categories', 'users'] };
    default:
      return { error: 'Unknown tool ' + name };
  }
}

const SYSTEM = 'Bạn là trợ lý AI của hệ thống quản lý mua hàng ProcureOS (Garena VN). ' +
  'Luôn trả lời NGẮN GỌN bằng tiếng Việt. Dùng các công cụ để lấy số liệu thật trước khi trả lời. ' +
  'Định dạng tiền theo VND. Nếu không có dữ liệu, nói rõ.';

// ---- Gọi Claude (Anthropic Messages API) với vòng lặp tool-use ----
async function chatAnthropic(message, history) {
  const messages = history.map((h) => ({ role: h.role, content: h.content })).concat([{ role: 'user', content: message }]);
  const tools = TOOLS.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  for (let i = 0; i < 5; i++) {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': config.ai.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.ai.model, max_tokens: 1024, system: SYSTEM, tools, messages }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'Lỗi Anthropic API');
    if (data.stop_reason === 'tool_use') {
      messages.push({ role: 'assistant', content: data.content });
      const results = [];
      for (const b of data.content) {
        if (b.type === 'tool_use') results.push({ type: 'tool_result', tool_use_id: b.id, content: JSON.stringify(await executeTool(b.name, b.input)) });
      }
      messages.push({ role: 'user', content: results });
      continue;
    }
    return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
  }
  return 'Xin lỗi, tôi chưa xử lý xong yêu cầu.';
}

// ---- Gọi OpenAI (chat/completions) với function calling ----
async function chatOpenAI(message, history) {
  const messages = [{ role: 'system', content: SYSTEM }, ...history, { role: 'user', content: message }];
  const tools = TOOLS.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
  for (let i = 0; i < 5; i++) {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.ai.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.ai.model, max_tokens: 1024, messages, tools }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || 'Lỗi OpenAI API');
    const msg = data.choices[0].message;
    if (msg.tool_calls?.length) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        const out = await executeTool(tc.function.name, JSON.parse(tc.function.arguments || '{}'));
        messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(out) });
      }
      continue;
    }
    return (msg.content || '').trim();
  }
  return 'Xin lỗi, tôi chưa xử lý xong yêu cầu.';
}

// ---- Fallback không cần API key: định tuyến ý định + format tiếng Việt ----
function norm(s) { return String(s || '').normalize('NFD').split('').filter(function(c){var x=c.charCodeAt(0);return x<768||x>879;}).map(function(c){var x=c.charCodeAt(0);return (x===272||x===273)?'d':c;}).join('').toLowerCase(); }

async function chatLocal(message) {
  const t = norm(message);
  if (/(thong ke|tong quan|dashboard|bao nhieu don|so don)/.test(t)) {
    const s = await executeTool('get_full_statistics');
    return `📊 Tổng quan: ${s.total_orders} đơn hàng · tổng chi tiêu ${moneyVnd(s.total_spend)}đ · ${s.suppliers} NCC · ${s.products} sản phẩm · ${s.pending_requests} yêu cầu chờ xử lý.`;
  }
  if (/(ton kho|kho hang|inventory|con hang|ton)/.test(t)) {
    const r = await executeTool('get_warehouse_status', {});
    if (!r.stock.length) return 'Kho hiện chưa có dữ liệu tồn.';
    return '🏬 Tồn kho:\n' + r.stock.map((s) => `• ${s.sku} — ${s.item_name || ''}: ${s.qty_on_hand} (${moneyVnd(s.total_value)}đ)`).join('\n');
  }
  if (/(nha cung cap|ncc|supplier|vendor)/.test(t)) {
    const r = await executeTool('get_supplier_info', {});
    return '🏢 Nhà cung cấp:\n' + r.suppliers.map((s) => `• ${s.name}: ${s.orders} đơn · ${moneyVnd(s.spend)}đ · công nợ ${s.payment_term_days} ngày`).join('\n');
  }
  if (/(bao cao|chi tieu|report|theo team|theo thang|theo nha)/.test(t)) {
    const by = /thang/.test(t) ? 'month' : /nha|ncc|supplier/.test(t) ? 'supplier' : 'team';
    const r = await executeTool('generate_report', { by });
    return `📈 Chi tiêu theo ${by === 'team' ? 'team' : by === 'month' ? 'tháng' : 'NCC'}:\n` + r.rows.map((x) => `• ${x.label || '(không rõ)'}: ${moneyVnd(x.spend)}đ`).join('\n');
  }
  const code = (message.match(/[A-Za-z]{2,}-\d{3,}-\d{3,}/) || [])[0];
  if (code) {
    const r = await executeTool('get_order_detail', { order_code: code });
    if (r.error) return r.error;
    return `📦 Đơn ${r.order.order_code} — ${r.order.project} · trạng thái ${r.order.status} · tổng ${moneyVnd(r.order.total)}đ\n` + r.items.map((it) => `• ${it.item_name} x${it.quantity} = ${moneyVnd(it.line_total)}đ`).join('\n');
  }
  if (/(don|order|tim)/.test(t)) {
    const kw = message.replace(/tìm|đơn|order|hàng/gi, '').trim();
    const r = await executeTool('search_orders', kw ? { q: kw } : {});
    if (!r.orders.length) return 'Không tìm thấy đơn phù hợp.';
    return '📦 Đơn hàng:\n' + r.orders.map((o) => `• ${o.order_code} — ${o.project_name} (${o.status}) ${moneyVnd(o.total_amount)}đ`).join('\n');
  }
  return 'Tôi có thể giúp: thống kê tổng quan, tìm đơn hàng (vd "đơn DH-2607-0001"), tồn kho, nhà cung cấp, báo cáo chi tiêu theo team/tháng/NCC. Bạn muốn xem gì?';
}

router.get('/status', wrap(async (req, res) => {
  res.json({ enabled: !!config.ai.apiKey, provider: config.ai.provider, model: config.ai.apiKey ? config.ai.model : 'intent-router (không cần key)' });
}));

router.post('/chat', wrap(async (req, res) => {
  const { message, history = [] } = req.body || {};
  if (!message) return res.status(400).json({ error: 'Thiếu nội dung' });
  const hist = Array.isArray(history) ? history.slice(-8) : [];
  try {
    let reply;
    if (config.ai.apiKey) reply = config.ai.provider === 'openai' ? await chatOpenAI(message, hist) : await chatAnthropic(message, hist);
    else reply = await chatLocal(message);
    res.json({ reply, mode: config.ai.apiKey ? config.ai.provider : 'local' });
  } catch (e) {
    // Nếu LLM lỗi (key sai, không truy cập được...) -> fallback intent router.
    const reply = await chatLocal(message);
    res.json({ reply, mode: 'local', warning: e.message });
  }
}));

export default router;
