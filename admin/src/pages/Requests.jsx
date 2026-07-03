import { useEffect, useState } from 'react';
import { api, fmtVND, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';

const STATUS = { new: 'Mới', confirmed: 'Đã duyệt', rejected: 'Từ chối', completed: 'Hoàn tất' };

export default function Requests() {
  const { user } = useAuth();
  const canWrite = ['admin', 'purchasing'].includes(user.role);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [detail, setDetail] = useState(null);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.get(`/requests?q=${encodeURIComponent(q)}&status=${status}&limit=100`).then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [q, status]);

  const openDetail = async (row) => setDetail(await api.get(`/requests/${row.id}`));
  const setReqStatus = async (id, s) => { await api.patch(`/requests/${id}/status`, { status: s }); setDetail(null); load(); };
  const convert = async (id) => {
    const r = await api.post(`/requests/${id}/convert`);
    alert(`Đã tạo đơn hàng ${r.order_code}`);
    setDetail(null); load();
  };

  return (
    <>
      <div className="topbar"><h1>Yêu cầu mua hàng</h1></div>
      <div className="content">
        <div className="toolbar">
          <input className="search" placeholder="Tìm mã YC / dự án…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ width: 160 }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Tất cả</option>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <div className="spacer" />
          <button className="btn-primary" onClick={() => setCreating(true)}>+ Tạo yêu cầu</button>
        </div>
        {err && <div className="error">{err}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Mã YC</th><th>Dự án</th><th>Người YC</th><th>Team</th><th>Ngày YC</th><th>Số dòng</th><th>Trạng thái</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(r)}>
                  <td><strong>{r.request_code}</strong></td>
                  <td>{r.project_name}</td>
                  <td>{r.requester_name}</td>
                  <td>{r.team_name || '-'}</td>
                  <td>{fmtDate(r.request_date)}</td>
                  <td>{r.item_count}</td>
                  <td><span className={`badge b-${r.status}`}>{STATUS[r.status] || r.status}</span></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7} className="center-msg">Không có yêu cầu</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {detail && (
        <Modal title={`Yêu cầu ${detail.request_code}`} onClose={() => setDetail(null)}>
          <p><strong>{detail.project_name}</strong> — {detail.requester_name} ({detail.requester_email})</p>
          <p className="muted">Ngày YC: {fmtDate(detail.request_date)} · Cần trước: {fmtDate(detail.expected_date)}</p>
          <span className={`badge b-${detail.status}`}>{STATUS[detail.status]}</span>
          <div className="table-wrap" style={{ marginTop: 14 }}>
            <table>
              <thead><tr><th>#</th><th>Tên hàng</th><th>SL</th><th>Ngân sách</th><th>NCC đề xuất</th></tr></thead>
              <tbody>
                {detail.items.map((it) => (
                  <tr key={it.id}><td>{it.line_no}</td><td>{it.item_name}</td><td>{it.quantity}</td><td>{fmtVND(it.budget)}</td><td>{it.suggested_supplier || '-'}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          {canWrite && detail.status === 'new' && (
            <div className="modal-actions">
              <button className="btn-danger" onClick={() => setReqStatus(detail.id, 'rejected')}>Từ chối</button>
              <button onClick={() => setReqStatus(detail.id, 'confirmed')}>Duyệt</button>
              <button className="btn-primary" onClick={() => convert(detail.id)}>Duyệt & tạo đơn</button>
            </div>
          )}
          {canWrite && detail.status === 'confirmed' && (
            <div className="modal-actions">
              <button className="btn-primary" onClick={() => convert(detail.id)}>Tạo đơn hàng</button>
            </div>
          )}
        </Modal>
      )}

      {creating && <RequestForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </>
  );
}

function RequestForm({ onClose, onSaved }) {
  const [teams, setTeams] = useState([]);
  const [form, setForm] = useState({ project_name: '', team_id: '', request_date: '', expected_date: '', note: '' });
  const [items, setItems] = useState([{ item_name: '', quantity: 1, budget: '', suggested_supplier: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.get('/teams?limit=200').then((r) => setTeams(r.data)); }, []);

  const setItem = (i, k, v) => setItems(items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems([...items, { item_name: '', quantity: 1, budget: '', suggested_supplier: '' }]);
  const rmItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.post('/requests', { ...form, team_id: form.team_id || null, items: items.filter((it) => it.item_name) });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Tạo yêu cầu mua" onClose={onClose} onSubmit={save} busy={busy} submitLabel="Gửi yêu cầu">
      <div className="row">
        <div className="field"><label>Tên dự án *</label><input required value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} /></div>
        <div className="field"><label>Team</label>
          <select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
            <option value="">-- chọn --</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
      </div>
      <div className="row">
        <div className="field"><label>Ngày yêu cầu</label><input type="date" value={form.request_date} onChange={(e) => setForm({ ...form, request_date: e.target.value })} /></div>
        <div className="field"><label>Cần trước ngày</label><input type="date" value={form.expected_date} onChange={(e) => setForm({ ...form, expected_date: e.target.value })} /></div>
      </div>
      <label>Danh sách hàng</label>
      {items.map((it, i) => (
        <div className="row" key={i} style={{ marginBottom: 8 }}>
          <input placeholder="Tên hàng" value={it.item_name} onChange={(e) => setItem(i, 'item_name', e.target.value)} />
          <input placeholder="SL" type="number" style={{ maxWidth: 80 }} value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} />
          <input placeholder="Ngân sách" type="number" value={it.budget} onChange={(e) => setItem(i, 'budget', e.target.value)} />
          <button type="button" className="btn-sm btn-danger" onClick={() => rmItem(i)}>×</button>
        </div>
      ))}
      <button type="button" className="btn-sm" onClick={addItem}>+ Thêm dòng</button>
      {err && <div className="error">{err}</div>}
    </Modal>
  );
}
