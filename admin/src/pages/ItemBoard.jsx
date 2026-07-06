import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtVND, fmtNum } from '../api.js';
import { LINE_STATUSES, lineStatusOf } from '../lineStatus.js';

const FLAGS = [
  { code: 'overdue_receipt', label: '🔴 Quá hạn nhận hàng', color: '#dc2626' },
  { code: 'due_soon_receipt', label: '🟡 Sắp đến hạn nhận (≤3 ngày)', color: '#d97706' },
  { code: 'due_soon_payment', label: '🟠 Sắp đến hạn thanh toán (≤7 ngày)', color: '#ea580c' },
  { code: 'missing_contract', label: '🔵 >20tr chưa có ĐĐH/HĐ', color: '#2563eb' },
];

function fmtDate(d) {
  if (!d) return '-';
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('vi-VN');
}

// Màn "Xử lý mặt hàng": Buyer xem & cập nhật tiến trình từng dòng hàng của mọi đơn,
// gom nhóm THEO ĐƠN HÀNG (accordion) + cờ cảnh báo nghiệp vụ tự động.
export default function ItemBoard() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [flagCounts, setFlagCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [activeStatus, setActiveStatus] = useState(''); // '' = tất cả
  const [activeFlag, setActiveFlag] = useState('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [savingId, setSavingId] = useState(null);
  const [openOrders, setOpenOrders] = useState(() => new Set());

  const load = useCallback(() => {
    setLoading(true); setErr('');
    const params = new URLSearchParams();
    if (activeStatus) params.set('line_status', activeStatus);
    if (activeFlag) params.set('flag', activeFlag);
    if (q.trim()) params.set('q', q.trim());
    api.get(`/orders/items/all?${params.toString()}`)
      .then((d) => { setRows(d.data); setCounts(d.counts || {}); setFlagCounts(d.flagCounts || {}); setTotal(d.total || 0); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [activeStatus, activeFlag, q]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (item, code) => {
    setSavingId(item.id); setErr('');
    try { await api.patch(`/orders/items/${item.id}/progress`, { progress: code }); load(); }
    catch (e) { setErr(e.message); }
    finally { setSavingId(null); }
  };

  // Gom các dòng hàng theo đơn (order_id) — giữ nguyên thứ tự đã sắp xếp từ server (mới nhất trước).
  const orders = useMemo(() => {
    const map = new Map();
    for (const r of rows) {
      if (!map.has(r.order_id)) {
        map.set(r.order_id, {
          order_id: r.order_id, order_code: r.order_code, project_name: r.project_name,
          team_name: r.team_name, expected_date: r.expected_date, total_amount: r.total_amount,
          flags: r.flags, items: [], suppliers: new Set(),
        });
      }
      const o = map.get(r.order_id);
      o.items.push(r);
      if (r.supplier_name) o.suppliers.add(r.supplier_name);
    }
    return [...map.values()];
  }, [rows]);

  const toggleOrder = (id) => setOpenOrders((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const expandAll = () => setOpenOrders(new Set(orders.map((o) => o.order_id)));
  const collapseAll = () => setOpenOrders(new Set());

  return (
    <>
      <div className="topbar">
        <h1>🧩 Xử lý mặt hàng</h1>
        <input placeholder="Tìm mã đơn / tên hàng / dự án…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 320 }} />
      </div>
      <div className="content">
        {err && <div className="error">{err}</div>}

        {/* Chip cờ cảnh báo nghiệp vụ */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          {FLAGS.map((f) => (
            <Chip key={f.code} label={f.label} count={flagCounts[f.code] || 0} color={f.color}
              activeCode={activeFlag} code={f.code} onClick={() => setActiveFlag(activeFlag === f.code ? '' : f.code)} />
          ))}
        </div>

        {/* Chip lọc theo trạng thái xử lý dòng + số lượng mỗi nhóm */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <Chip label="Tất cả" count={total} color="#334155" activeCode={activeStatus} code="" onClick={() => setActiveStatus('')} />
          {LINE_STATUSES.map((s) => (
            <Chip key={s.code} label={s.name} count={counts[s.code] || 0} color={s.color} activeCode={activeStatus} code={s.code} onClick={() => setActiveStatus(s.code)} />
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 8 }}>
          <button className="btn-sm" onClick={expandAll}>Mở tất cả</button>
          <button className="btn-sm" onClick={collapseAll}>Thu gọn tất cả</button>
        </div>

        {loading && <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Đang tải…</div>}
        {!loading && !orders.length && <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Không có mặt hàng nào.</div>}

        {!loading && orders.map((o) => (
          <OrderGroup key={o.order_id} order={o} open={openOrders.has(o.order_id)} onToggle={() => toggleOrder(o.order_id)}
            savingId={savingId} onChangeStatus={changeStatus} />
        ))}
      </div>
    </>
  );
}

function OrderGroup({ order, open, onToggle, savingId, onChangeStatus }) {
  const f = order.flags || {};
  const activeFlags = FLAGS.filter((fl) => f[fl.code]);
  return (
    <div className="card" style={{ padding: 0, marginBottom: 10 }}>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{open ? '▼' : '▶'}</span>
        <Link to={`/orders/${order.order_id}`} onClick={(e) => e.stopPropagation()} style={{ fontWeight: 600 }}>{order.order_code}</Link>
        <span className="muted">{order.project_name || ''}</span>
        <span className="muted">· {order.team_name || '-'}</span>
        <span className="muted">· {[...order.suppliers].join(', ') || '-'}</span>
        <span className="muted">· Hạn nhận: {fmtDate(order.expected_date)}</span>
        <strong style={{ marginLeft: 'auto' }}>{fmtVND(order.total_amount)}</strong>
        <span className="muted">({order.items.length} dòng)</span>
      </div>
      {!!activeFlags.length && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '0 14px 10px' }}>
          {activeFlags.map((fl) => (
            <span key={fl.code} className="badge" style={{ background: fl.color + '22', color: fl.color, border: `1px solid ${fl.color}55`, fontSize: 12 }}>{fl.label}</span>
          ))}
        </div>
      )}
      {open && (
        <div className="table-wrap" style={{ border: 'none', borderTop: '1px solid var(--border)' }}>
          <table>
            <thead>
              <tr>
                <th>Tên hàng</th><th>Loại</th><th className="r">SL</th>
                <th className="r">Đơn giá</th><th className="r">Tổng</th><th>NCC</th>
                <th style={{ minWidth: 160 }}>Trạng thái xử lý</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => {
                const st = lineStatusOf(it.line_status);
                return (
                  <tr key={it.id}>
                    <td>{it.item_name}{it.item_code && <div className="muted" style={{ fontSize: 12 }}>{it.item_code}</div>}</td>
                    <td>{it.loai_hh || '-'}</td>
                    <td className="r">{fmtNum(it.quantity)}</td>
                    <td className="r">{fmtVND(it.unit_price)}</td>
                    <td className="r"><strong>{fmtVND(it.line_total)}</strong></td>
                    <td>{it.supplier_name || '-'}</td>
                    <td>
                      <span className="badge" style={{ background: st.color + '22', color: st.color, border: `1px solid ${st.color}55`, marginRight: 6 }}>{st.name}</span>
                      <select
                        value={it.line_status}
                        disabled={savingId === it.id}
                        onChange={(e) => onChangeStatus(it, e.target.value)}
                        style={{ marginTop: 4, width: '100%' }}
                      >
                        {LINE_STATUSES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Chip({ label, count, color, code, activeCode, onClick }) {
  const on = activeCode === code;
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, cursor: 'pointer',
        border: `1px solid ${on ? color : 'var(--border)'}`,
        background: on ? color : '#fff', color: on ? '#fff' : 'var(--text)', fontWeight: on ? 600 : 400,
      }}
    >
      <span>{label}</span>
      <span style={{ background: on ? '#ffffff33' : color + '22', color: on ? '#fff' : color, borderRadius: 10, padding: '1px 8px', fontSize: 12, fontWeight: 600 }}>{fmtNum(count)}</span>
    </button>
  );
}
