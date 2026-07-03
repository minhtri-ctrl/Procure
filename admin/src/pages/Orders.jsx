import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtVND, fmtDate } from '../api.js';

export const STATUS_LABEL = {
  draft: 'Nháp', waiting: 'Chờ xử lý', in_progress: 'Đang xử lý', quoted: 'Đã báo giá',
  ordered: 'Đã đặt hàng', received: 'Đã nhận', paid: 'Đã thanh toán', completed: 'Hoàn tất', cancelled: 'Đã huỷ',
};
const STATUS_LIST = Object.keys(STATUS_LABEL);

export default function Orders() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const nav = useNavigate();

  const load = () => {
    api.get(`/orders?q=${encodeURIComponent(q)}&status=${status}&limit=100`).then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, [q, status]);

  return (
    <>
      <div className="topbar"><h1>Đơn hàng</h1></div>
      <div className="content">
        <div className="toolbar">
          <input className="search" placeholder="Tìm mã đơn / dự án…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {STATUS_LIST.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </div>
        {err && <div className="error">{err}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Mã đơn</th><th>Dự án</th><th>Team</th><th>NCC</th><th>Ngày YC</th><th>Số dòng</th><th>Giá trị</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/orders/${o.id}`)}>
                  <td><strong>{o.order_code}</strong></td>
                  <td>{o.project_name}</td>
                  <td>{o.team_name || '-'}</td>
                  <td>{o.supplier_name || '-'}</td>
                  <td>{fmtDate(o.request_date)}</td>
                  <td>{o.item_count}</td>
                  <td>{fmtVND(o.total_amount)}</td>
                  <td><span className={`badge b-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={8} className="center-msg">Không có đơn hàng</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
