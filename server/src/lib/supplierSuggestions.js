import { query } from '../db.js';

const words = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').split(/[^a-z0-9]+/).filter((x) => x.length > 1);

// Deterministic and advisory: this service never changes a line's supplier.
export async function suggestSuppliers(input = {}) {
  const itemName = String(input.item_name || '').trim();
  if (!itemName) return { suggestions: [], mode: 'rule-based', message: 'Chưa đủ dữ liệu để đề xuất (thiếu tên hàng).' };
  const [suppliers, history] = await Promise.all([
    query('SELECT id, name, is_active, master_contract FROM suppliers ORDER BY is_active DESC, name LIMIT 200'),
    query(`SELECT i.supplier_id, COUNT(*) AS purchase_count, MAX(i.unit_price) AS recent_price, MAX(o.created_at) AS last_purchase, GROUP_CONCAT(DISTINCT i.item_name ORDER BY i.id DESC SEPARATOR ' ') AS item_names FROM order_items i JOIN orders o ON o.id=i.order_id WHERE i.supplier_id IS NOT NULL AND o.deleted_at IS NULL GROUP BY i.supplier_id`),
  ]);
  const wanted = new Set(words(itemName));
  const bySupplier = new Map(history.map((row) => [String(row.supplier_id), row]));
  const suggestions = suppliers.map((supplier) => {
    const evidence = bySupplier.get(String(supplier.id)); const corpus = new Set([...words(supplier.name), ...words(evidence?.item_names)]);
    const overlap = [...wanted].filter((token) => corpus.has(token)).length; const used = Number(evidence?.purchase_count || 0); const active = Number(supplier.is_active) === 1;
    const score = Math.min(100, Math.round(overlap * 28 + Math.min(used, 8) * 6 + (supplier.master_contract ? 10 : 0) + (active ? 12 : -25)));
    return { supplier_id: supplier.id, supplier_name: supplier.name, score, reason: overlap ? 'Khớp tên hàng và lịch sử mua gần đây.' : used ? 'Có lịch sử cung cấp trong ProcureOS.' : 'NCC hoạt động, chưa có đủ lịch sử tương đồng.', evidence: { purchase_count: used, recent_price: evidence?.recent_price ? Number(evidence.recent_price) : null, last_purchase: evidence?.last_purchase || null, master_contract: supplier.master_contract || null }, warning: !active ? 'NCC không hoạt động' : !used ? 'Ít dữ liệu lịch sử' : null };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
  return suggestions.length ? { suggestions, mode: 'rule-based' } : { suggestions: [], mode: 'rule-based', message: 'Chưa đủ dữ liệu để đề xuất. Bạn vẫn có thể chọn NCC thủ công.' };
}
