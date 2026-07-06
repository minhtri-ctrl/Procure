import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtVND, fmtNum, fmtDate, getToken } from '../api.js';
import { useMeta } from '../meta.jsx';
import { useAuth } from '../auth.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import BulkDeleteButton from '../components/BulkDeleteButton.jsx';

export default function Orders() {
  const { states, L } = useMeta();
  const { user } = useAuth();
  const canWrite = ['admin', 'purchasing'].includes(user.role);
  const canPurge = ['admin', 'pm'].includes(user.role);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const nav = useNavigate();

  const load = () => {
    api.get(`/orders?q=${encodeURIComponent(q)}&status=${status}&limit=100`).then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, [q, status]);

  const download = async (format) => {
    const res = await fetch(`/api/orders/export?format=${format}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `procureos-orders.${format === 'csv' ? 'csv' : 'xlsx'}`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="topbar">
        <h1>Đơn hàng</h1>
        {canWrite && <button className="btn-primary" onClick={() => nav('/orders/new')}>+ Tạo đơn mới</button>}
      </div>
      <div className="content">
        <div className="toolbar">
          <input className="search" placeholder="Tìm mã đơn / dự án…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ width: 180 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả trạng thái</option>
            {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
          <div className="spacer" />
          <button onClick={() => download('xlsx')}>⬇ Excel</button>
          <button onClick={() => download('csv')}>⬇ CSV</button>
          {canWrite && <button className="btn-primary" onClick={() => nav('/orders/new')}>+ Tạo đơn</button>}
          {canPurge && <BulkDeleteButton entity="đơn hàng" countPath="/orders/count" deletePath="/orders" onDone={(n) => { alert(`Đã xóa ${n} đơn hàng`); load(); }} />}
        </div>
        {err && <div className="error">{err}</div>}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{L('orders.col.ma_don', 'Mã đơn')}</th>
                <th>{L('orders.col.du_an', 'Dự án')}</th>
                <th>{L('orders.col.team', 'Team')}</th>
                <th>{L('orders.col.ncc', 'NCC')}</th>
                <th>{L('orders.col.ngay_yc', 'Ngày YC')}</th>
                <th>{L('orders.col.so_dong', 'Số dòng')}</th>
                <th>{L('orders.col.gia_tri', 'Giá trị')}</th>
                <th>{L('orders.col.trang_thai', 'Trạng thái')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/orders/${o.id}`)}>
                  <td><strong>{o.order_code}</strong></td>
                  <td className="truncate" title={o.project_name}>{o.project_name}</td>
                  <td>{o.team_name || '-'}</td>
                  <td className="truncate" title={o.supplier_name}>{o.supplier_name || '-'}</td>
                  <td>{fmtDate(o.request_date)}</td>
                  <td>{fmtNum(o.item_count)}</td>
                  <td>{fmtVND(o.total_amount)}</td>
                  <td><StatusBadge code={o.status} /></td>
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
