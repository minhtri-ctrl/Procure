import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, fmtVND, fmtDate } from '../api.js';
import { STATUS_LABEL } from './Orders.jsx';
import { useAuth } from '../auth.jsx';

const STATUS_LIST = Object.keys(STATUS_LABEL);

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const [o, setO] = useState(null);
  const [err, setErr] = useState('');
  const canWrite = ['admin', 'purchasing'].includes(user.role);

  const load = () => api.get(`/orders/${id}`).then(setO).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);

  const changeStatus = async (status) => { await api.patch(`/orders/${id}/status`, { status }); load(); };
  const del = async () => { if (confirm('Xoá đơn hàng này?')) { await api.del(`/orders/${id}`); nav('/orders'); } };

  if (err) return <><div className="topbar"><h1>Chi tiết đơn</h1></div><div className="content"><div className="error">{err}</div></div></>;
  if (!o) return <div className="content center-msg">Đang tải…</div>;

  return (
    <>
      <div className="topbar">
        <h1>Đơn {o.order_code}</h1>
        <div>
          <button onClick={() => nav('/orders')}>← Quay lại</button>{' '}
          {canWrite && <button className="btn-danger" onClick={del}>Xoá đơn</button>}
        </div>
      </div>
      <div className="content">
        <div className="grid cols-2">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Thông tin đơn</h3>
            <Info label="Dự án" value={o.project_name} />
            <Info label="Người YC" value={`${o.requester_name || ''} (${o.requester_email || ''})`} />
            <Info label="Team" value={o.team_name} />
            <Info label="Nhà cung cấp" value={o.supplier_name} />
            <Info label="Ngày YC" value={fmtDate(o.request_date)} />
            <Info label="Ngày nhận dự kiến" value={fmtDate(o.expected_date)} />
            <Info label="Số PR" value={o.pr_no} />
            <Info label="Ghi chú" value={o.note} />
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Trạng thái</h3>
            <div style={{ marginBottom: 12 }}>
              <span className={`badge b-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span>
            </div>
            {canWrite && (
              <div className="field">
                <label>Đổi trạng thái</label>
                <select value={o.status} onChange={(e) => changeStatus(e.target.value)}>
                  {STATUS_LIST.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                </select>
              </div>
            )}
            <Info label="Tổng giá trị" value={fmtVND(o.total_amount)} />
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Danh sách hàng ({o.items.length})</h3>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead><tr><th>Tên hàng</th><th>Mã</th><th>ĐVT</th><th>SL</th><th>Đơn giá</th><th>VAT</th><th>Thành tiền</th></tr></thead>
              <tbody>
                {o.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.item_name}</td>
                    <td>{it.item_code || '-'}</td>
                    <td>{it.unit || '-'}</td>
                    <td>{it.quantity}</td>
                    <td>{fmtVND(it.unit_price)}</td>
                    <td>{(Number(it.vat_rate) * 100).toFixed(0)}%</td>
                    <td><strong>{fmtVND(it.line_total)}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ display: 'flex', padding: '5px 0', fontSize: 14 }}>
      <span className="muted" style={{ width: 160, flexShrink: 0 }}>{label}</span>
      <span>{value || '-'}</span>
    </div>
  );
}
