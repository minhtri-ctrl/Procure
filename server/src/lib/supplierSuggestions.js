import { query } from '../db.js';
import { config } from '../config.js';

const words = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((x) => x.length > 1);

function externalStatus() {
  // This adapter boundary intentionally does not invent external suppliers. A real provider must be configured separately.
  return config.ai.externalSupplierSearchProvider
    ? { status: 'adapter_pending', provider: config.ai.externalSupplierSearchProvider, message: 'Đã cấu hình provider tìm NCC bên ngoài nhưng adapter chưa được triển khai.' }
    : { status: 'not_configured', message: 'Chưa cấu hình tìm NCC bên ngoài. Hệ thống không tự tạo hoặc bịa NCC.' };
}

function canUseAi() {
  return config.ai.supplierSuggestions && config.ai.provider === 'openai' && !!config.ai.apiKey
    && (!config.demoMode || config.ai.allowDemoExternal);
}

async function rankWithAi(itemName, candidates) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const schema = {
    type: 'object', additionalProperties: false, required: ['suggestions'],
    properties: { suggestions: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['supplier_id', 'score', 'reason', 'confidence'], properties: { supplier_id: { type: 'integer' }, score: { type: 'integer', minimum: 0, maximum: 100 }, reason: { type: 'string', maxLength: 240 }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } } } } },
  };
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: `Bearer ${config.ai.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: process.env.SUPPLIER_SUGGESTION_AI_MODEL || config.ai.model,
        messages: [
          { role: 'system', content: 'Rank only the supplied internal suppliers for procurement. Never invent a supplier or change a supplier. Favor semantic item match, recent purchases, price evidence, active status and contract. Return only the JSON schema.' },
          { role: 'user', content: JSON.stringify({ requested_item: itemName, candidates }) },
        ],
        response_format: { type: 'json_schema', json_schema: { name: 'supplier_ranking', strict: true, schema } }, max_tokens: 1200,
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'AI không thể xếp hạng NCC');
    const allowed = new Map(candidates.map((candidate) => [Number(candidate.supplier_id), candidate]));
    const ranked = (JSON.parse(data.choices?.[0]?.message?.content || '{}').suggestions || [])
      .map((entry) => allowed.has(Number(entry.supplier_id)) ? { ...allowed.get(Number(entry.supplier_id)), score: Number(entry.score), reason: String(entry.reason), confidence: entry.confidence } : null)
      .filter(Boolean);
    return ranked.length ? ranked : candidates;
  } finally { clearTimeout(timeout); }
}

// Advisory only: this service never changes a line supplier. It ranks system history, then signals an external-search gap.
export async function suggestSuppliers(input = {}) {
  const itemName = String(input.item_name || '').trim();
  if (!itemName) return { suggestions: [], mode: 'rule-based', message: 'Chưa đủ dữ liệu để đề xuất (thiếu tên hàng).', external: externalStatus() };
  const [suppliers, history] = await Promise.all([
    query('SELECT id, name, is_active, master_contract FROM suppliers ORDER BY is_active DESC, name LIMIT 200'),
    query(`SELECT i.supplier_id, COUNT(*) AS purchase_count, AVG(i.unit_price) AS average_price, MIN(i.unit_price) AS min_price, MAX(i.unit_price) AS max_price, MAX(o.created_at) AS last_purchase, GROUP_CONCAT(DISTINCT i.item_name ORDER BY i.id DESC SEPARATOR ' ') AS item_names FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.supplier_id IS NOT NULL AND o.deleted_at IS NULL GROUP BY i.supplier_id`),
  ]);
  const wanted = new Set(words(itemName));
  const bySupplier = new Map(history.map((row) => [String(row.supplier_id), row]));
  const candidates = suppliers.map((supplier) => {
    const evidence = bySupplier.get(String(supplier.id)); const corpus = new Set([...words(supplier.name), ...words(evidence?.item_names)]);
    const overlap = [...wanted].filter((token) => corpus.has(token)).length; const used = Number(evidence?.purchase_count || 0); const active = Number(supplier.is_active) === 1;
    const score = Math.min(100, Math.round(overlap * 30 + Math.min(used, 8) * 6 + (supplier.master_contract ? 10 : 0) + (active ? 12 : -25)));
    return { supplier_id: supplier.id, supplier_name: supplier.name, score, reason: overlap ? 'Khớp tên hàng và lịch sử mua trong ProcureOS.' : 'Có lịch sử cung cấp trong ProcureOS.', confidence: overlap >= 2 && used >= 2 ? 'high' : used ? 'medium' : 'low', evidence: { purchase_count: used, average_price: evidence?.average_price ? Number(evidence.average_price) : null, min_price: evidence?.min_price ? Number(evidence.min_price) : null, max_price: evidence?.max_price ? Number(evidence.max_price) : null, last_purchase: evidence?.last_purchase || null, master_contract: supplier.master_contract || null, matched_terms: [...wanted].filter((token) => corpus.has(token)) }, warning: !active ? 'NCC không hoạt động' : !overlap ? 'Chưa có lịch sử mặt hàng tương tự' : null, active, overlap };
  }).filter((candidate) => candidate.active && (candidate.overlap > 0 || candidate.evidence.purchase_count > 0)).sort((a, b) => b.score - a.score).slice(0, 8);
  if (!candidates.length) return { suggestions: [], mode: 'rule-based', message: 'Không có NCC nội bộ có lịch sử phù hợp.', external: externalStatus() };
  if (!canUseAi()) return { suggestions: candidates.slice(0, 5).map(({ active, overlap, ...candidate }) => candidate), mode: 'rule-based', message: 'Đề xuất từ dữ liệu nội bộ; AI xếp hạng chưa được bật.', external: null };
  try {
    const ranked = await rankWithAi(itemName, candidates.map(({ active, overlap, ...candidate }) => candidate));
    return { suggestions: ranked, mode: 'ai-system', message: 'AI đã xếp hạng NCC dựa trên dữ liệu nội bộ được cung cấp.', external: null };
  } catch (error) {
    return { suggestions: candidates.slice(0, 5).map(({ active, overlap, ...candidate }) => candidate), mode: 'rule-based', message: `AI không khả dụng: ${error.message}. Đã dùng xếp hạng dữ liệu nội bộ.`, external: null };
  }
}
