import { useEffect, useState } from 'react';
import { api, fmtVND } from '../api.js';
import { STATUS_LABEL } from './Orders.jsx';

function Stat({ label, value }) {
  return <div className="card stat"><div className="label">{label}</div><div className="value">{value}</div></div>;
}

export default function Dashboard() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/dashboard').then(setD).catch((e) => setErr(e.message)); }, []);

  if (err) return <><Top /><div className="content"><div className="error">{err}</div></div></>;
  if (!d) return <><Top /><div className="content center-msg">Đang tải…</div></>;

  const maxTeam = Math.max(1, ...d.by_team.map((t) => Number(t.spend)));
  return (
    <>
      <Top />
      <div className="content">
        <div className="grid cols-4">
          <Stat label="Tổng đơn hàng" value={d.total_orders} />
          <Stat label="Tổng chi tiêu" value={fmtVND(d.total_spend)} />
          <Stat label="YC chờ xử lý" value={d.pending_requests} />
          <Stat label="Nhà cung cấp" value={d.supplier_count} />
        </div>

        <div className="grid cols-2" style={{ marginTop: 16 }}>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Đơn theo trạng thái</h3>
            {d.by_status.map((s) => (
              <div key={s.status} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0' }}>
                <span className={`badge b-${s.status}`}>{STATUS_LABEL[s.status] || s.status}</span>
                <strong>{s.count}</strong>
              </div>
            ))}
          </div>
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Chi tiêu theo Team</h3>
            {d.by_team.map((t, i) => (
              <div key={i} style={{ padding: '5px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>{t.team || '(không rõ)'}</span><span className="muted">{fmtVND(t.spend)}</span>
                </div>
                <div style={{ height: 7, background: '#eef1f6', borderRadius: 4, marginTop: 3 }}>
                  <div style={{ width: `${(Number(t.spend) / maxTeam) * 100}%`, height: '100%', background: 'var(--primary)', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Hoạt động gần đây</h3>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead><tr><th>Mã đơn</th><th>Dự án</th><th>NCC</th><th>Trạng thái</th><th>Giá trị</th></tr></thead>
              <tbody>
                {d.recent.map((o) => (
                  <tr key={o.order_code}>
                    <td><strong>{o.order_code}</strong></td>
                    <td>{o.project_name}</td>
                    <td>{o.supplier_name || '-'}</td>
                    <td><span className={`badge b-${o.status}`}>{STATUS_LABEL[o.status] || o.status}</span></td>
                    <td>{fmtVND(o.total_amount)}</td>
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

function Top() {
  return <div className="topbar"><h1>Dashboard</h1></div>;
}
