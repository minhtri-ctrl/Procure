import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtVND, fmtNum } from '../api.js';
import { LINE_STATUSES, lineStatusOf } from '../lineStatus.js';

// Màn "Xử lý mặt hàng": Buyer xem & cập nhật tiến trình TỪNG dòng hàng của mọi đơn,
// gom nhóm theo trạng thái xử lý — không phải mở từng đơn.
export default function ItemBoard() {
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [total, setTotal] = useState(0);
  const [active, setActive] = useState(''); // '' = tất cả
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(() => {
    setLoading(true); setErr('');
    const params = new URLSearchParams();
    if (active) params.set('line_status', active);
    if (q.trim()) params.set('q', q.trim());
    api.get(`/orders/items/all?${params.toString()}`)
      .then((d) => { setRows(d.data); setCounts(d.counts || {}); setTotal(d.total || 0); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [active, q]);

  useEffect(() => { load(); }, [load]);

  const changeStatus = async (item, code) => {
    setSavingId(item.id); setErr('');
    try { await api.patch(`/orders/items/${item.id}/progress`, { progress: code }); load(); }
    catch (e) { setErr(e.message); }
    finally { setSavingId(null); }
  };

  return (
    <>
      <div className="topbar">
        <h1>🧩 Xử lý mặt hàng</h1>
        <input placeholder="Tìm mã đơn / tên hàng / dự án…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 320 }} />
      </div>
      <div className="content">
        {err && <div className="error">{err}</div>}

        {/* Tab lọc theo trạng thái + số lượng mỗi nhóm */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          <Chip label="Tất cả" count={total} color="#334155" activeCode={active} code="" onClick={() => setActive('')} />
          {LINE_STATUSES.map((s) => (
            <Chip key={s.code} label={s.name} count={counts[s.code] || 0} color={s.color} activeCode={active} code={s.code} onClick={() => setActive(s.code)} />
          ))}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Mã đơn</th><th>Tên hàng</th><th>Loại</th><th className="r">SL</th>
                  <th className="r">Đơn giá</th><th className="r">Tổng</th><th>NCC</th><th>Team</th>
                  <th style={{ minWidth: 160 }}>Trạng thái xử lý</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => {
                  const st = lineStatusOf(it.line_status);
                  return (
                    <tr key={it.id}>
                      <td><Link to={`/orders/${it.order_id}`}>{it.order_code}</Link>
                        {it.item_code && <div className="muted" style={{ fontSize: 12 }}>{it.item_code}</div>}
                      </td>
                      <td>{it.item_name}<div className="muted" style={{ fontSize: 12 }}>{it.project_name || ''}</div></td>
                      <td>{it.loai_hh || '-'}</td>
                      <td className="r">{fmtNum(it.quantity)}</td>
                      <td className="r">{fmtVND(it.unit_price)}</td>
                      <td className="r"><strong>{fmtVND(it.line_total)}</strong></td>
                      <td>{it.supplier_name || '-'}</td>
                      <td>{it.team_name || '-'}</td>
                      <td>
                        <span className="badge" style={{ background: st.color + '22', color: st.color, border: `1px solid ${st.color}55`, marginRight: 6 }}>{st.name}</span>
                        <select
                          value={it.line_status}
                          disabled={savingId === it.id}
                          onChange={(e) => changeStatus(it, e.target.value)}
                          style={{ marginTop: 4, width: '100%' }}
                        >
                          {LINE_STATUSES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {!loading && !rows.length && <tr><td colSpan={9} className="muted" style={{ padding: 24, textAlign: 'center' }}>Không có mặt hàng nào.</td></tr>}
                {loading && <tr><td colSpan={9} className="muted" style={{ padding: 24, textAlign: 'center' }}>Đang tải…</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
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
