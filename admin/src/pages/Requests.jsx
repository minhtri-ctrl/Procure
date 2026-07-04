import { useEffect, useState } from 'react';
import { api, fmtVND, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';
import BulkDeleteButton from '../components/BulkDeleteButton.jsx';
import { LOAI_HH, DIEM_NHAN, HANG_MUC } from '../constants.js';
import SupplierSelect from '../components/SupplierSelect.jsx';

const STATUS = { new: 'Mới', confirmed: 'Đã duyệt', rejected: 'Từ chối', completed: 'Hoàn tất' };

export default function Requests() {
  const { user } = useAuth();
  const canWrite = ['admin', 'purchasing'].includes(user.role);
  const canPurge = ['admin', 'pm'].includes(user.role);
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
  const delOne = async (id, code) => {
    if (!confirm(`Xóa yêu cầu ${code}? (xóa mềm, có thể khôi phục)`)) return;
    try { await api.del(`/requests/${id}`); setDetail(null); load(); }
    catch (e) { alert(e.message); }
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
          {canPurge && <BulkDeleteButton entity="yêu cầu mua" countPath="/requests/count" deletePath="/requests" onDone={(n) => { alert(`Đã xóa ${n} yêu cầu`); load(); }} />}
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
          {canWrite && (
            <div className="modal-actions" style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10 }}>
              <button className="btn-danger" onClick={() => delOne(detail.id, detail.request_code)}>🗑 Xóa yêu cầu này</button>
            </div>
          )}
        </Modal>
      )}

      {creating && <RequestForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
    </>
  );
}

function RequestForm({ onClose, onSaved }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState([]);
  const [diemCustom, setDiemCustom] = useState(false);
  const [form, setForm] = useState({
    project_name: '', team_id: '', pm: '', requester_name: user.name, requester_email: user.email,
    hang_muc: 'Mua sắm / sản xuất', receiving_point: '', request_date: '', expected_date: '', note: '',
  });
  const [items, setItems] = useState([{ loai_hh: 'Vật phẩm', item_name: '', description: '', unit: 'cái', quantity: 1, budget: '', suggested_supplier: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/teams?limit=200').then((r) => setTeams(r.data));
  }, []);

  const setF = (k, v) => setForm({ ...form, [k]: v });
  const pickTeam = (id) => { const t = teams.find((x) => String(x.id) === id); setForm({ ...form, team_id: id, pm: t?.lead_name || form.pm }); };
  const setItem = (i, k, v) => setItems(items.map((it, idx) => (idx === i ? { ...it, [k]: v } : it)));
  const addItem = () => setItems([...items, { loai_hh: 'Vật phẩm', item_name: '', description: '', unit: 'cái', quantity: 1, budget: '', suggested_supplier: '' }]);
  const rmItem = (i) => setItems(items.filter((_, idx) => idx !== i));

  const save = async () => {
    setErr('');
    if (!form.project_name) { setErr('Nhập tên dự án'); return; }
    const rows = items.filter((it) => it.item_name);
    if (!rows.length) { setErr('Cần ít nhất 1 dòng hàng'); return; }
    setBusy(true);
    try {
      await api.post('/requests', { ...form, team_id: form.team_id || null, items: rows });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Tạo yêu cầu mua" onClose={onClose} onSubmit={save} busy={busy} submitLabel="Gửi yêu cầu">
      <div className="row">
        <div className="field"><label>Tên dự án *</label><input required value={form.project_name} onChange={(e) => setF('project_name', e.target.value)} /></div>
        <div className="field"><label>Team</label>
          <select value={form.team_id} onChange={(e) => pickTeam(e.target.value)}>
            <option value="">-- chọn --</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="field"><label>PM</label><input value={form.pm} onChange={(e) => setF('pm', e.target.value)} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Người yêu cầu</label><input value={form.requester_name} onChange={(e) => setF('requester_name', e.target.value)} /></div>
        <div className="field"><label>Email</label><input type="email" value={form.requester_email} onChange={(e) => setF('requester_email', e.target.value)} /></div>
        <div className="field"><label>Hạng mục</label>
          <select value={form.hang_muc} onChange={(e) => setF('hang_muc', e.target.value)}>{HANG_MUC.map((h) => <option key={h} value={h}>{h}</option>)}</select>
        </div>
      </div>
      <div className="row">
        <div className="field"><label>Ngày yêu cầu</label><input type="date" value={form.request_date} onChange={(e) => setF('request_date', e.target.value)} /></div>
        <div className="field"><label>Cần trước ngày</label><input type="date" value={form.expected_date} onChange={(e) => setF('expected_date', e.target.value)} /></div>
        <div className="field"><label>Điểm nhận</label>
          <select value={diemCustom ? '__c' : form.receiving_point} onChange={(e) => {
            if (e.target.value === '__c') { setDiemCustom(true); setF('receiving_point', ''); }
            else { setDiemCustom(false); setF('receiving_point', e.target.value); }
          }}>
            <option value="">-- chọn --</option>{DIEM_NHAN.map((d) => <option key={d} value={d}>{d}</option>)}<option value="__c">Khác</option>
          </select>
        </div>
      </div>
      {diemCustom && <div className="field"><input placeholder="Nhập điểm nhận" value={form.receiving_point} onChange={(e) => setF('receiving_point', e.target.value)} /></div>}
      <div className="field"><label>Ghi chú chung</label><input value={form.note} onChange={(e) => setF('note', e.target.value)} /></div>

      <label>Danh sách hàng cần mua</label>
      <div className="table-wrap" style={{ marginBottom: 8 }}>
        <table><thead><tr><th>Loại HH</th><th>Tên hàng</th><th>Mô tả</th><th>SL</th><th>ĐVT</th><th>Ngân sách</th><th>NCC đề xuất</th><th></th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={i}>
                <td><select style={{ minWidth: 110 }} value={it.loai_hh} onChange={(e) => setItem(i, 'loai_hh', e.target.value)}>{LOAI_HH.map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
                <td><input style={{ minWidth: 130 }} value={it.item_name} onChange={(e) => setItem(i, 'item_name', e.target.value)} /></td>
                <td><input style={{ minWidth: 110 }} value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} /></td>
                <td><input type="number" style={{ width: 55 }} value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} /></td>
                <td><input style={{ width: 55 }} value={it.unit} onChange={(e) => setItem(i, 'unit', e.target.value)} /></td>
                <td><input type="number" style={{ width: 100 }} value={it.budget} onChange={(e) => setItem(i, 'budget', e.target.value)} /></td>
                <td><SupplierSelect minWidth={150} valueKey="name" value={it.suggested_supplier} onChange={(v) => setItem(i, 'suggested_supplier', v)} /></td>
                <td><button type="button" className="btn-sm btn-danger" onClick={() => rmItem(i)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button type="button" className="btn-sm" onClick={addItem}>+ Thêm dòng</button>
      {err && <div className="error">{err}</div>}
    </Modal>
  );
}
