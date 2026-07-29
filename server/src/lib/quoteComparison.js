import { config } from '../config.js';

const clean = (value) => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const num = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value) => Math.max(0, Math.min(100, Math.round(value)));

function lineTotal(item) {
  const quantity = num(item.quantity); const unitPrice = num(item.unit_price); const vat = num(item.vat_percent);
  if (quantity === null || unitPrice === null) return null;
  const beforeVat = quantity * unitPrice;
  return { before_vat: beforeVat, vat_amount: vat === null ? null : beforeVat * vat / 100, after_vat: vat === null ? null : beforeVat * (1 + vat / 100) };
}

function defaultWeights(input = {}) {
  const base = { total_cost: 45, unit_price: 25, delivery: 15, reputation: 10, commercial_terms: 5 };
  const requested = input && typeof input === 'object' ? input : {};
  const sum = Object.keys(base).reduce((total, key) => total + Math.max(0, Number(requested[key] ?? base[key]) || 0), 0) || 100;
  return Object.fromEntries(Object.keys(base).map((key) => [key, Math.round((Math.max(0, Number(requested[key] ?? base[key]) || 0) / sum) * 100)]));
}

function scoreQuotes(quotes, weights) {
  const totals = quotes.map((quote) => quote.total_after_vat).filter((value) => value !== null);
  const minTotal = totals.length ? Math.min(...totals) : null;
  const maxReputation = Math.max(1, ...quotes.map((quote) => quote.reputation_score || 0));
  return quotes.map((quote) => {
    const cost = minTotal !== null && quote.total_after_vat !== null ? clamp(100 * minTotal / Math.max(quote.total_after_vat, 1)) : 0;
    const reputation = clamp(100 * (quote.reputation_score || 0) / maxReputation);
    const completeness = quote.missing_fields.length ? Math.max(25, 100 - quote.missing_fields.length * 20) : 100;
    const score = clamp(cost * (weights.total_cost + weights.unit_price) / 70 + reputation * weights.reputation / 100 + completeness * (weights.delivery + weights.commercial_terms) / 100);
    return { ...quote, scores: { cost, reputation, completeness, total: score } };
  }).sort((a, b) => b.scores.total - a.scores.total);
}

function findMatch(item, quote) {
  const key = clean(item.item_name);
  return (quote.items || []).find((candidate) => clean(candidate.item_name) === key) || null;
}

async function rankWithAi(quotes, weights) {
  if (!(config.ai.provider === 'openai' && config.ai.apiKey && (!config.demoMode || config.ai.allowDemoExternal))) return null;
  const schema = { type: 'object', additionalProperties: false, required: ['recommended_quote_id', 'reason', 'warnings'], properties: { recommended_quote_id: { type: ['string', 'null'] }, reason: { type: 'string', maxLength: 500 }, warnings: { type: 'array', maxItems: 12, items: { type: 'string', maxLength: 200 } } } };
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', signal: controller.signal, headers: { Authorization: `Bearer ${config.ai.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.QUOTE_COMPARISON_AI_MODEL || config.ai.model, messages: [{ role: 'system', content: 'Compare only supplied procurement quotes. Do not invent terms, suppliers, or facts. Recommend at most one supplied quote and explain uncertainty. Return only JSON matching the schema.' }, { role: 'user', content: JSON.stringify({ weights, quotes: quotes.map(({ source_file, items, ...quote }) => ({ ...quote, source_file, item_count: items.length })) }) }], response_format: { type: 'json_schema', json_schema: { name: 'quote_comparison', strict: true, schema } }, max_tokens: 800 }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'AI comparison unavailable');
    const result = JSON.parse(data.choices?.[0]?.message?.content || '{}');
    return quotes.some((quote) => quote.quote_id === result.recommended_quote_id) ? result : null;
  } finally { clearTimeout(timeout); }
}

// Advisory only. This function neither persists files nor modifies orders, suppliers, or line items.
export async function compareQuotes(files = [], weightsInput = {}, supplierRows = []) {
  const weights = defaultWeights(weightsInput);
  const supplierByName = new Map(supplierRows.map((supplier) => [clean(supplier.name), supplier]));
  const usable = files.filter((file) => file.status === 'success').slice(0, 3);
  const quotes = usable.map((file, index) => {
    const items = (file.items || []).map((item) => ({ ...item, totals: lineTotal(item) }));
    const matchedSupplier = supplierByName.get(clean(items.find((item) => item.supplier_name)?.supplier_name || ''));
    const totals = items.map((item) => item.totals).filter(Boolean);
    const missing = [...new Set(items.flatMap((item) => item.issues || []))];
    if (!matchedSupplier) missing.push('Chưa đối chiếu được NCC với dữ liệu ProcureOS');
    return { quote_id: file.client_id || `quote-${index + 1}`, source_file: { client_id: file.client_id, filename: file.filename, fingerprint: file.fingerprint }, supplier_name: items.find((item) => item.supplier_name)?.supplier_name || null, supplier_match: matchedSupplier ? { supplier_id: matchedSupplier.id, supplier_name: matchedSupplier.name } : null, reputation_score: Number(matchedSupplier?.reputation_score || 0), purchase_count: Number(matchedSupplier?.purchase_count || 0), total_before_vat: totals.length ? totals.reduce((sum, value) => sum + value.before_vat, 0) : null, total_vat: totals.length && totals.every((value) => value.vat_amount !== null) ? totals.reduce((sum, value) => sum + value.vat_amount, 0) : null, total_after_vat: totals.length && totals.every((value) => value.after_vat !== null) ? totals.reduce((sum, value) => sum + value.after_vat, 0) : null, delivery_time: null, payment_terms: null, warranty: null, missing_fields: missing, items };
  });
  const ranked = scoreQuotes(quotes, weights);
  const itemKeys = [...new Set(ranked.flatMap((quote) => quote.items.map((item) => clean(item.item_name)).filter(Boolean)))];
  const rows = itemKeys.map((key) => ({ item_key: key, item_name: ranked.flatMap((quote) => quote.items).find((item) => clean(item.item_name) === key)?.item_name || key, quotes: ranked.map((quote) => { const item = findMatch({ item_name: key }, quote); return item ? { quote_id: quote.quote_id, supplier_name: item.supplier_name || quote.supplier_name, quantity: item.quantity, unit_price: item.unit_price, vat_percent: item.vat_percent, total_after_vat: item.totals?.after_vat ?? null, issues: item.issues || [] } : { quote_id: quote.quote_id, missing: true }; }) }));
  const ai = await rankWithAi(ranked, weights).catch((error) => ({ error: error.message }));
  const fallback = ranked[0] ? { recommended_quote_id: ranked[0].quote_id, reason: 'Xếp hạng theo trọng số đã chọn và dữ liệu trích xuất; cần người dùng xác nhận trước khi áp dụng.', warnings: ranked.flatMap((quote) => quote.missing_fields).slice(0, 12) } : { recommended_quote_id: null, reason: 'Chưa có báo giá hợp lệ để so sánh.', warnings: [] };
  return { mode: ai && !ai.error ? 'ai' : config.demoMode ? 'demo-rule-based' : 'rule-based', weights, quotes: ranked, rows, recommendation: ai && !ai.error ? ai : fallback, warnings: [...new Set(ranked.flatMap((quote) => quote.missing_fields))].slice(0, 20) };
}
