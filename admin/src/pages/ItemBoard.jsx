import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtVND, fmtNum } from '../api.js';
import { useMeta } from '../meta.jsx';
import { LINE_STATUSES, lineStatusOf } from '../lineStatus.js';
import Modal from '../components/Modal.jsx';

const FLAGS = [
  { code: 'overdue_receipt', label: '🔴 Quá hạn nhận hàng', color: '#dc2626' },
  { code: 'due_soon_receipt', label: '🟡 Sắp đến hạn nhận (≤3 ngày)', color: '#d97706' },
  { code: 'due_soon_payment', label: '🟠 Sắp đến hạn thanh toán (≤7 ngày)', color: '#ea580c' },
  { code: 'missing_contract', label: '🔵 >20tr chưa có ĐĐH/HĐ', color: '#2563eb' },
  { code: 'missing_supplier', label: 'Thiếu NCC', color: '#dc2626' },
  { code: 'missing_pr', label: 'Thiếu PR', color: '#d97706' },
  { code: 'missing_design_link', label: 'Thiếu link thiết kế', color: '#7c3aed' },
  { code: 'missing_price', label: 'Thiếu đơn giá', color: '#b45309' },
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
  const [dateFrom, setDateFrom] = useState(''); const [dateTo, setDateTo] = useState('');
  const [selected, setSelected] = useState(() => new Set()); const [bulkStatus, setBulkStatus] = useState(''); const [detail, setDetail] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setErr('');
    const params = new URLSearchParams();
    if (activeStatus) params.set('line_status', activeStatus);
    if (activeFlag) params.set('flag', activeFlag);
    if (q.trim()) params.set('q', q.trim());
    if (dateFrom) params.set('date_from', dateFrom); if (dateTo) params.set('date_to', dateTo);
    api.get(`/orders/items/all?${params.toString()}`)
      .then((d) => { setRows(d.data); setCounts(d.counts || {}); setFlagCounts(d.flagCounts || {}); setTotal(d.total || 0); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [activeStatus, activeFlag, q, dateFrom, dateTo]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (item, code) => {
    setSavingId(item.id); setErr('');
    try { await api.patch(`/orders/items/${item.id}/progress`, { progress: code }); load(); }
    catch (e) { setErr(e.message); }
    finally { setSavingId(null); }
  };
  const toggleSelected = (id) => setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const applyBulk = async () => { if (!selected.size || !bulkStatus) return; if (!confirm(`Cập nhật ${selected.size} dòng sang trạng thái đã chọn?`)) return; try { await api.patch('/orders/items/progress/bulk', { item_ids: [...selected], progress: bulkStatus }); setSelected(new Set()); load(); } catch (e) { setErr(e.message); } };

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
        <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', padding: 10, marginBottom: 10 }}><div className="field" style={{ margin: 0 }}><label>Hạn nhận từ</label><input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></div><div className="field" style={{ margin: 0 }}><label>đến</label><input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></div><button className="btn-sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>Xóa lọc ngày</button></div>

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
        {selected.size > 0 && <div className="card" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, padding: 10 }}><strong>Đã chọn {selected.size} dòng</strong><select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}><option value="">Chọn trạng thái mới</option>{LINE_STATUSES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select><button className="btn-primary" disabled={!bulkStatus} onClick={applyBulk}>Áp dụng hàng loạt</button><button className="btn-sm" onClick={() => setSelected(new Set())}>Bỏ chọn</button></div>}

        {loading && <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Đang tải…</div>}
        {!loading && !orders.length && <div className="muted" style={{ padding: 24, textAlign: 'center' }}>Không có mặt hàng nào.</div>}

        {!loading && orders.map((o) => (
          <OrderGroup key={o.order_id} order={o} open={openOrders.has(o.order_id)} onToggle={() => toggleOrder(o.order_id)}
            savingId={savingId} onChangeStatus={changeStatus} selected={selected} onToggleSelected={toggleSelected} onDetail={setDetail} />
        ))}
      </div>
      {detail && <ItemDetail item={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function OrderGroup({ order, open, onToggle, savingId, onChangeStatus, selected, onToggleSelected, onDetail }) {
  const { L } = useMeta();
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
                <th></th><th>{L('item_board.col.ten_hang', 'Tên hàng')}</th><th>{L('item_board.col.loai', 'Loại')}</th><th className="r">{L('item_board.col.sl', 'SL')}</th>
                <th className="r">{L('item_board.col.don_gia', 'Đơn giá')}</th><th className="r">{L('item_board.col.tong', 'Tổng')}</th><th>{L('item_board.col.ncc', 'NCC')}</th>
                <th style={{ minWidth: 160 }}>{L('item_board.col.trang_thai_xu_ly', 'Trạng thái xử lý')}</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => {
                const st = lineStatusOf(it.line_status);
                return (
                  <tr key={it.id} onClick={() => onDetail(it)} style={{ cursor: 'pointer' }}>
                    <td><input type="checkbox" checked={selected.has(it.id)} onClick={(e) => e.stopPropagation()} onChange={() => onToggleSelected(it.id)} /></td>
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
                        onClick={(e) => e.stopPropagation()} onChange={(e) => onChangeStatus(it, e.target.value)}
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

function ItemDetail({ item, onClose }) {
  return <Modal title={`Chi tiết dòng: ${item.item_name}`} onClose={onClose} hideSubmit><div className="info-grid"><div><label>Mã đơn</label><div>{item.order_code}</div></div><div><label>NCC</label><div>{item.supplier_name || 'Chưa chọn'}</div></div><div><label>Số PR</label><div>{item.so_pr || 'Chưa có'}</div></div><div><label>Đơn giá</label><div>{fmtVND(item.unit_price)}</div></div></div><div className="field"><label>Link thiết kế</label>{item.design_link ? <a href={item.design_link} target="_blank" rel="noreferrer">Mở liên kết</a> : <span className="muted">Chưa có</span>}</div><div className="field"><label>Ghi chú</label><div>{item.note || item.description || '-'}</div></div></Modal>;
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
