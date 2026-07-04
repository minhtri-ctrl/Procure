import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, fmtVND, fmtDate, getToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { LOAI_HH } from '../constants.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { states } = useMeta();
  const [o, setO] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const canWrite = ['admin', 'purchasing'].includes(user.role);

  const load = () => api.get(`/orders/${id}`).then((d) => { setO(d); setNewStatus(d.status); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); api.get('/suppliers?limit=500').then((r) => setSuppliers(r.data)); }, [id]);

  const changeStatus = async () => {
    setErr(''); setMsg('');
    try { await api.patch(`/orders/${id}/status`, { status: newStatus, note }); setNote(''); load(); setMsg('Đã cập nhật tiến trình'); }
    catch (e) { setErr(e.message); }
  };
  const sendEmail = async (type) => {
    setErr(''); setMsg('');
    try { const r = await api.post('/emails/send', { order_id: Number(id), type }); setMsg(`Đã gửi email tới ${r.to || '(chưa có email)'}`); load(); }
    catch (e) { setErr(e.message); }
  };
  const del = async () => { if (confirm('Xoá đơn hàng này?')) { await api.del(`/orders/${id}`); nav('/orders'); } };

  if (err && !o) return <><div className="topbar"><h1>Chi tiết đơn</h1></div><div className="content"><div className="error">{err}</div></div></>;
  if (!o) return <div className="content center-msg">Đang tải…</div>;

  return (
    <>
      <div className="topbar">
        <h1>Đơn {o.order_code} <StatusBadge code={o.status} /></h1>
        <div>
          <button onClick={() => nav('/orders')}>← Quay lại</button>{' '}
          {canWrite && <button className="btn-danger" onClick={del}>Xoá</button>}
        </div>
      </div>
      <div className="content">
        {msg && <div style={{ color: 'var(--green)', marginBottom: 10 }}>{msg}</div>}
        {err && <div className="error">{err}</div>}

        <div className="grid cols-2">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Thông tin đơn</h3>
            <Info label="Dự án" value={o.project_name} />
            <Info label="Người YC" value={`${o.requester_name || ''} ${o.requester_email ? '(' + o.requester_email + ')' : ''}`} />
            <Info label="Team" value={o.team_name} />
            <Info label="Hạng mục" value={o.hang_muc} />
            <Info label="Điểm nhận" value={o.receiving_point} />
            <Info label="Ngày YC" value={fmtDate(o.request_date)} />
            <Info label="Ngày nhận" value={fmtDate(o.expected_date)} />
            <Info label="PM" value={o.pm} />
            <Info label="Tổng giá trị" value={fmtVND(o.total_amount)} />
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>⚙️ Tiến trình</h3>
            <div className="field">
              <label>Chuyển trạng thái</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Ghi chú</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do / ghi chú" /></div>
            <button className="btn-primary" onClick={changeStatus}>Cập nhật tiến trình</button>

            {canWrite && (
              <div style={{ marginTop: 14 }}>
                <label>Gửi email</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <button className="btn-sm" onClick={() => sendEmail('confirm')}>Xác nhận NCC</button>
                  <button className="btn-sm" onClick={() => sendEmail('handover')}>Bàn giao</button>
                  <button className="btn-sm" onClick={() => sendEmail('survey')}>Khảo sát</button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <label>Lịch sử tiến trình</label>
              <div style={{ maxHeight: 160, overflowY: 'auto', fontSize: 13, marginTop: 4 }}>
                {(o.history || []).map((h) => (
                  <div key={h.id} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)' }}>
                    <StatusBadge code={h.to_status} /> <span className="muted">· {String(h.created_at).slice(0, 16).replace('T', ' ')} · {h.changed_by}</span>
                    {h.note && <div className="muted">{h.note}</div>}
                  </div>
                ))}
                {!(o.history || []).length && <div className="muted">Chưa có lịch sử</div>}
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Chi tiết hàng ({o.items.length})</h3>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead><tr><th>Mã hàng</th><th>Loại</th><th>Tên hàng</th><th>SL</th><th>Đơn giá</th><th>VAT</th><th>Thành tiền</th><th>Tổng</th><th>NCC</th><th>Số PR</th><th>BG</th>{canWrite && <th></th>}</tr></thead>
              <tbody>
                {o.items.map((it) => (
                  <tr key={it.id}>
                    <td>{it.item_code || '-'}</td>
                    <td>{it.loai_hh || '-'}</td>
                    <td>{it.item_name}</td>
                    <td className="r">{it.quantity}</td>
                    <td className="r">{fmtVND(it.unit_price)}</td>
                    <td className="c">{(Number(it.vat_rate) * 100).toFixed(0)}%</td>
                    <td className="r">{fmtVND(it.thanh_tien ?? it.line_total)}</td>
                    <td className="r"><strong>{fmtVND(it.line_total)}</strong></td>
                    <td>{it.supplier_name || '-'}</td>
                    <td>{it.so_pr || '-'}</td>
                    <td>{it.quotation_url ? <a href={it.quotation_url} target="_blank" rel="noreferrer">📎</a> : '-'}</td>
                    {canWrite && <td><button className="btn-sm" onClick={() => setEditing(it)}>Sửa</button></td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && <LineEdit item={editing} suppliers={suppliers} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

function Info({ label, value }) {
  return (
    <div style={{ display: 'flex', padding: '5px 0', fontSize: 14 }}>
      <span className="muted" style={{ width: 150, flexShrink: 0 }}>{label}</span>
      <span>{value || '-'}</span>
    </div>
  );
}

// Buyer sửa dòng: giá, SL, VAT, NCC, master, số PR, thiết kế, upload báo giá.
function LineEdit({ item, suppliers, onClose, onSaved }) {
  const [f, setF] = useState({
    loai_hh: item.loai_hh || 'Vật phẩm', item_name: item.item_name || '', description: item.description || '',
    quantity: item.quantity || 0, unit_price: item.unit_price || 0, vatPct: Math.round((Number(item.vat_rate) || 0) * 100),
    unit: item.unit || '', supplier_id: item.supplier_id || '', master_contract: item.master_contract || '',
    so_pr: item.so_pr || '', design_link: item.design_link || '', note: item.note || '',
  });
  const [bg, setBg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pickNcc = (sid) => { const s = suppliers.find((x) => String(x.id) === String(sid)); setF({ ...f, supplier_id: sid, master_contract: s?.master_contract || f.master_contract }); };
  const onFile = (e) => { const file = e.target.files?.[0]; if (!file) return; const rd = new FileReader(); rd.onload = () => setBg(rd.result); rd.readAsDataURL(file); };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.put(`/orders/items/${item.id}`, {
        loai_hh: f.loai_hh, item_name: f.item_name, description: f.description, unit: f.unit,
        quantity: Number(f.quantity || 0), unit_price: Number(f.unit_price || 0), vat_rate: Number(f.vatPct || 0) / 100,
        supplier_id: f.supplier_id || null, master_contract: f.master_contract, so_pr: f.so_pr, design_link: f.design_link, note: f.note,
      });
      if (bg) await api.post(`/uploads/order-quote/${item.id}`, { data: bg, filename: 'bao-gia' });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Sửa dòng: ${item.item_code || item.item_name}`} onClose={onClose} onSubmit={save} busy={busy}>
      <div className="row">
        <div className="field"><label>Loại HH</label><select value={f.loai_hh} onChange={(e) => setF({ ...f, loai_hh: e.target.value })}>{LOAI_HH.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
        <div className="field"><label>ĐVT</label><input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></div>
      </div>
      <div className="field"><label>Tên hàng</label><input value={f.item_name} onChange={(e) => setF({ ...f, item_name: e.target.value })} /></div>
      <div className="row">
        <div className="field"><label>Số lượng</label><input type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></div>
        <div className="field"><label>Đơn giá</label><input type="number" value={f.unit_price} onChange={(e) => setF({ ...f, unit_price: e.target.value })} /></div>
        <div className="field"><label>VAT %</label><input type="number" value={f.vatPct} onChange={(e) => setF({ ...f, vatPct: e.target.value })} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Nhà cung cấp</label>
          <select value={f.supplier_id} onChange={(e) => pickNcc(e.target.value)}>
            <option value="">-- NCC --</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Master Contract</label><input value={f.master_contract} onChange={(e) => setF({ ...f, master_contract: e.target.value })} /></div>
      </div>
      <div className="row">
        <div className="field"><label>Số PR</label><input value={f.so_pr} onChange={(e) => setF({ ...f, so_pr: e.target.value })} /></div>
        <div className="field"><label>Link thiết kế</label><input value={f.design_link} onChange={(e) => setF({ ...f, design_link: e.target.value })} /></div>
      </div>
      <div className="field"><label>Ghi chú</label><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      <div className="field">
        <label>File báo giá (FILE_BG)</label>
        {item.quotation_url && !bg && <div><a href={item.quotation_url} target="_blank" rel="noreferrer">Xem file hiện tại</a></div>}
        <input type="file" onChange={onFile} />
      </div>
      {err && <div className="error">{err}</div>}
    </Modal>
  );
}
