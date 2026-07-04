import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';

const TYPES = [
  { key: 'confirm', label: 'Xác nhận đơn hàng (→ NCC)' },
  { key: 'handover', label: 'Bàn giao đơn hàng (→ người YC)' },
  { key: 'survey', label: 'Khảo sát đánh giá (→ người YC)' },
  { key: 'wh_notify', label: 'Thông báo nhập kho (→ người YC)' },
];

export default function Emails() {
  const { user } = useAuth();
  const canWrite = ['admin', 'purchasing'].includes(user.role);
  const [tab, setTab] = useState('compose');
  return (
    <>
      <div className="topbar"><h1>Trung tâm Email</h1></div>
      <div className="content">
        <div className="toolbar tabs">
          <button className={tab === 'compose' ? 'btn-primary' : ''} onClick={() => setTab('compose')}>Soạn & gửi</button>
          <button className={tab === 'logs' ? 'btn-primary' : ''} onClick={() => setTab('logs')}>Lịch sử gửi</button>
          <button className={tab === 'ratings' ? 'btn-primary' : ''} onClick={() => setTab('ratings')}>Đánh giá</button>
        </div>
        {tab === 'compose' && <Compose canWrite={canWrite} />}
        {tab === 'logs' && <Logs />}
        {tab === 'ratings' && <Ratings />}
      </div>
    </>
  );
}

function Compose({ canWrite }) {
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [type, setType] = useState('confirm');
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/orders?limit=200').then((r) => setOrders(r.data)); }, []);

  const doPreview = async () => {
    setErr(''); setMsg('');
    if (!orderId) { setErr('Chọn đơn hàng'); return; }
    try { setPreview(await api.post('/emails/preview', { order_id: Number(orderId), type })); }
    catch (e) { setErr(e.message); }
  };
  const doSend = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      const r = await api.post('/emails/send', { order_id: Number(orderId), type });
      setMsg(`Đã ghi nhận gửi tới ${r.to}${r.po_no ? ` · PO ${r.po_no}` : ''}`);
      setPreview(null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="card">
      <div className="row">
        <div className="field"><label>Đơn hàng</label>
          <select value={orderId} onChange={(e) => { setOrderId(e.target.value); setPreview(null); }}>
            <option value="">-- chọn đơn --</option>
            {orders.map((o) => <option key={o.id} value={o.id}>{o.order_code} — {o.project_name}</option>)}
          </select>
        </div>
        <div className="field"><label>Loại email</label>
          <select value={type} onChange={(e) => { setType(e.target.value); setPreview(null); }}>
            {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={doPreview}>Xem trước</button>
        {canWrite && <button className="btn-primary" onClick={doSend} disabled={!preview || busy}>{busy ? 'Đang gửi…' : 'Gửi'}</button>}
      </div>
      {err && <div className="error">{err}</div>}
      {msg && <div style={{ color: 'var(--green)', marginTop: 8 }}>{msg}</div>}
      {preview && (
        <div className="email-preview">
          <div className="email-meta">
            <div><b>Tới:</b> {preview.to || '(chưa có email)'}</div>
            <div><b>CC:</b> {preview.cc}</div>
            <div><b>Tiêu đề:</b> {preview.subject}</div>
            {preview.po_no && <div><b>Số PO:</b> {preview.po_no}</div>}
          </div>
          <div dangerouslySetInnerHTML={{ __html: preview.body }} />
        </div>
      )}
    </div>
  );
}

function Logs() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/emails/logs').then((r) => setRows(r.data)); }, []);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Thời gian</th><th>Mã đơn</th><th>Loại email</th><th>Người nhận</th><th>Email</th><th>Trạng thái</th><th>PO</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.sent_at ? String(r.sent_at).slice(0, 16).replace('T', ' ') : ''}</td>
              <td><strong>{r.order_code}</strong></td><td>{r.email_type}</td>
              <td>{r.recipient_name}</td><td>{r.recipient_email}</td>
              <td><span className="badge b-completed">{r.status}</span></td><td>{r.po_no || ''}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={7} className="center-msg">Chưa có lịch sử</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Ratings() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get('/emails/ratings').then((r) => setRows(r.data)); }, []);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Thời gian</th><th>Mã đơn</th><th>Dự án</th><th>Chất lượng</th><th>Giá cả</th><th>Giao hàng</th><th>Hỗ trợ</th><th>TB</th><th>Nhận xét</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{fmtDate(r.rated_at)}</td><td><strong>{r.order_code}</strong></td><td>{r.project_name}</td>
              <td className="c">{r.score_quality}</td><td className="c">{r.score_price}</td><td className="c">{r.score_delivery}</td>
              <td className="c">{r.score_support}</td><td className="c"><strong>⭐ {r.score_avg}</strong></td><td>{r.comment}</td>
            </tr>
          ))}
          {!rows.length && <tr><td colSpan={9} className="center-msg">Chưa có đánh giá</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
