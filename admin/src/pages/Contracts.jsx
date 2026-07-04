import { useEffect, useState } from 'react';
import { api, fmtVND, fmtDate, getToken } from '../api.js';
import { useAuth } from '../auth.jsx';
// getToken dùng cho tải .docx
import Modal from '../components/Modal.jsx';

const TYPE_LABEL = { DDH: 'Đơn đặt hàng', HD: 'Hợp đồng DV' };

export default function Contracts() {
  const { user } = useAuth();
  const canWrite = ['admin', 'purchasing'].includes(user.role);
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => api.get(`/contracts?q=${encodeURIComponent(q)}`).then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [q]);

  const autoRun = async () => {
    setErr(''); setMsg('');
    try { const r = await api.post('/contracts/auto-run'); setMsg(`Đã tạo ${r.created} hợp đồng tự động (đơn ≥ 20 triệu)`); load(); }
    catch (e) { setErr(e.message); }
  };
  const viewDoc = (c) => {
    // Mở văn bản HĐ (đính token để qua auth).
    const w = window.open('', '_blank');
    api.get(`/contracts/${c.id}`).then(() => {
      fetch(`/api/contracts/${c.id}/document`, { headers: { Authorization: `Bearer ${getToken()}` } })
        .then((res) => res.text()).then((html) => { w.document.write(html); w.document.close(); });
    });
  };
  const del = async (c) => { if (confirm(`Xoá hợp đồng ${c.contract_no}?`)) { await api.del(`/contracts/${c.id}`); load(); } };
  const downloadDocx = async (c) => {
    const res = await fetch(`/api/contracts/${c.id}/docx`, { headers: { Authorization: `Bearer ${getToken()}` } });
    if (!res.ok) { setErr('Không tạo được .docx'); return; }
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${c.contract_no || 'hop-dong'}.docx`; a.click(); URL.revokeObjectURL(url);
  };
  const uploadTpl = (type) => (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => { try { await api.post(`/contracts/template/${type}`, { fileBase64: String(rd.result).split(',')[1] }); setMsg(`Đã cập nhật mẫu ${type}`); } catch (e2) { setErr(e2.message); } };
    rd.readAsDataURL(f); e.target.value = '';
  };

  return (
    <>
      <div className="topbar">
        <h1>Hợp đồng</h1>
        {canWrite && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={() => setCreating(true)}>+ Tạo từ đơn hàng</button>
            <button onClick={autoRun}>⚙ Tạo tự động</button>
          </div>
        )}
      </div>
      <div className="content">
        <div className="toolbar">
          <input className="search" placeholder="Tìm số HĐ / mã đơn / NCC…" value={q} onChange={(e) => setQ(e.target.value)} />
          {user.role === 'admin' && <>
            <div className="spacer" />
            <label className="btn btn-sm" style={{ cursor: 'pointer' }}>Mẫu ĐĐH (PO)<input type="file" accept=".docx" style={{ display: 'none' }} onChange={uploadTpl('DDH')} /></label>
            <label className="btn btn-sm" style={{ cursor: 'pointer' }}>Mẫu HĐ<input type="file" accept=".docx" style={{ display: 'none' }} onChange={uploadTpl('HD')} /></label>
          </>}
        </div>
        {err && <div className="error">{err}</div>}
        {msg && <div style={{ color: 'var(--green)', marginBottom: 10 }}>{msg}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Số HĐ</th><th>Loại</th><th>Mã đơn</th><th>NCC</th><th>Giá trị</th><th>Người ký</th><th>Ngày ký</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.contract_no}</strong></td>
                  <td><span className="badge b-in_progress">{TYPE_LABEL[c.type] || c.type}</span></td>
                  <td>{c.order_code}</td><td>{c.supplier_name || '-'}</td>
                  <td className="r">{fmtVND(c.amount)}</td><td>{c.our_signer}</td><td>{fmtDate(c.sign_date)}</td>
                  <td>{c.status || '-'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn-sm" onClick={() => viewDoc(c)}>Xem</button>{' '}
                    <button className="btn-sm" onClick={() => downloadDocx(c)}>⬇ .docx</button>{' '}
                    {canWrite && <button className="btn-sm" onClick={() => setEditing(c)}>Sửa</button>}{' '}
                    {canWrite && <button className="btn-sm btn-danger" onClick={() => del(c)}>Xoá</button>}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={9} className="center-msg">Chưa có hợp đồng</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {creating && <CreateForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {editing && <EditForm contract={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function CreateForm({ onClose, onSaved }) {
  const [orders, setOrders] = useState([]);
  const [orderId, setOrderId] = useState('');
  const [type, setType] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { api.get('/orders?limit=200').then((r) => setOrders(r.data)); }, []);
  const save = async () => {
    if (!orderId) { setErr('Chọn đơn hàng'); return; }
    setBusy(true); setErr('');
    try { await api.post('/contracts/from-order', { order_id: Number(orderId), type: type || undefined }); onSaved(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title="Tạo hợp đồng từ đơn hàng" onClose={onClose} onSubmit={save} busy={busy} submitLabel="Tạo hợp đồng">
      <div className="field"><label>Đơn hàng *</label>
        <select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
          <option value="">-- chọn đơn --</option>
          {orders.map((o) => <option key={o.id} value={o.id}>{o.order_code} — {o.project_name} ({o.supplier_name || 'chưa có NCC'})</option>)}
        </select>
      </div>
      <div className="field"><label>Loại (bỏ trống = tự quyết theo hợp đồng khung NCC)</label>
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tự động</option>
          <option value="DDH">Đơn đặt hàng (DDH)</option>
          <option value="HD">Hợp đồng dịch vụ (HĐ)</option>
        </select>
      </div>
      {err && <div className="error">{err}</div>}
    </Modal>
  );
}

function EditForm({ contract, onClose, onSaved }) {
  const [form, setForm] = useState({
    contract_no: contract.contract_no || '', sign_date: (contract.sign_date || '').slice(0, 10),
    status: contract.status || '', our_signer: contract.our_signer || '', vendor_signer: contract.vendor_signer || '',
    payment_method: contract.payment_method || '',
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try { await api.put(`/contracts/${contract.id}`, form); onSaved(); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Sửa hợp đồng ${contract.contract_no}`} onClose={onClose} onSubmit={save} busy={busy}>
      <div className="row">
        <div className="field"><label>Số hợp đồng</label><input value={form.contract_no} onChange={(e) => setForm({ ...form, contract_no: e.target.value })} /></div>
        <div className="field"><label>Ngày ký</label><input type="date" value={form.sign_date} onChange={(e) => setForm({ ...form, sign_date: e.target.value })} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Người ký (bên A)</label><input value={form.our_signer} onChange={(e) => setForm({ ...form, our_signer: e.target.value })} /></div>
        <div className="field"><label>Người ký (bên B)</label><input value={form.vendor_signer} onChange={(e) => setForm({ ...form, vendor_signer: e.target.value })} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Hình thức TT</label><input value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })} placeholder="VD: Trước 50 / Sau 50" /></div>
        <div className="field"><label>Trạng thái</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
            <option value="Nháp">Nháp</option><option value="Đã ký">Đã ký</option><option value="Đã huỷ">Đã huỷ</option>
          </select>
        </div>
      </div>
      {err && <div className="error">{err}</div>}
    </Modal>
  );
}
