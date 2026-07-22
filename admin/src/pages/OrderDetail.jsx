import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, fmtVND, fmtNum, fmtDate, getToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import { useMeta } from '../meta.jsx';
import { LOAI_HH } from '../constants.js';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import SupplierSelect from '../components/SupplierSelect.jsx';
import { LINE_STATUSES, normalizeLineStatus } from '../lineStatus.js';

export default function OrderDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { states, L } = useMeta();
  const [o, setO] = useState(null);
  const [teams, setTeams] = useState([]);
  const [editHdr, setEditHdr] = useState(false);
  const [editing, setEditing] = useState(null);
  const [supplierEdit, setSupplierEdit] = useState(null);
  const [newStatus, setNewStatus] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const canWrite = ['admin', 'purchasing'].includes(user.role);

  const load = () => api.get(`/orders/${id}`).then((d) => { setO(d); setNewStatus(d.status); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); api.get('/teams?limit=200').then((r) => setTeams(r.data)); }, [id]);

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
  const del = async () => { if (confirm('Xoá đơn hàng này? (xóa mềm, có thể khôi phục)')) { await api.del(`/orders/${id}`); nav('/orders'); } };
  const toCatalog = async (itemId) => {
    setErr(''); setMsg('');
    try { const r = await api.post(`/orders/items/${itemId}/to-catalog`); setMsg(`Đã đẩy sang Danh mục SP — mã hàng ${r.item_code}, chờ nhập kho`); load(); }
    catch (e) { setErr(e.message); }
  };
  const handover = async (itemId) => { try { await api.post(`/orders/items/${itemId}/handover`); setMsg('Đã bàn giao trực tiếp'); load(); } catch (e) { setErr(e.message); } };
  const setLineStatus = async (itemId, code) => {
    setErr(''); setMsg('');
    try { await api.patch(`/orders/items/${itemId}/progress`, { progress: code }); load(); }
    catch (e) { setErr(e.message); }
  };
  const deleteLine = async (itemId) => {
    if (!confirm('Xóa dòng hàng này?')) return;
    try { await api.del(`/orders/items/${itemId}`); setMsg('Đã xóa dòng hàng'); load(); } catch (e) { setErr(e.message); }
  };
  const sendQuote = async () => {
    setErr(''); setMsg('');
    if (!confirm('Gửi báo giá để Requester xác nhận? Đơn sẽ chuyển sang "Chờ xác nhận báo giá".')) return;
    try { await api.post(`/orders/${id}/send-quote`); setMsg('Đã gửi báo giá — chờ Requester xác nhận'); load(); }
    catch (e) { setErr(e.message); }
  };
  const quoteResponse = async (decision) => {
    setErr(''); setMsg('');
    try { await api.post(`/orders/${id}/quote-response`, { decision, note }); setNote(''); load(); setMsg(decision === 'confirm' ? 'Đã xác nhận báo giá' : 'Đã từ chối báo giá'); }
    catch (e) { setErr(e.message); }
  };

  // Requester (hoặc admin thay mặt) được xác nhận khi đơn đang chờ xác nhận báo giá.
  const isOwner = o && o.requester_email && o.requester_email === user.email;
  const canRespondQuote = o && o.status === 'pending_confirmation' && (user.role === 'admin' || isOwner);

  if (err && !o) return <><div className="topbar"><h1>Chi tiết đơn</h1></div><div className="content"><div className="error">{err}</div></div></>;
  if (!o) return <div className="content center-msg">Đang tải…</div>;

  return (
    <>
      <div className="topbar">
        <h1>Đơn {o.order_code} <StatusBadge code={o.status} /></h1>
        <div>
          <button onClick={() => nav('/orders')}>← Quay lại</button>{' '}
          {canWrite && <button onClick={() => setEditHdr(true)}>✏️ Sửa đơn</button>}{' '}
          {canWrite && <button className="btn-danger" onClick={del}>Xoá</button>}
        </div>
      </div>
      <div className="content">
        {msg && <div style={{ color: 'var(--green)', marginBottom: 10 }}>{msg}</div>}
        {err && <div className="error">{err}</div>}

        {canRespondQuote && (
          <div className="card" style={{ marginBottom: 16, border: '2px solid #db2777', background: '#fdf2f8' }}>
            <h3 style={{ marginTop: 0, color: '#db2777' }}>⏳ Báo giá chờ bạn xác nhận</h3>
            <p style={{ marginTop: 0 }}>Tổng giá trị: <strong>{fmtVND(o.total_amount)}</strong>. Vui lòng kiểm tra chi tiết hàng bên dưới rồi xác nhận hoặc từ chối (kèm ghi chú nếu từ chối).</p>
            <div className="field"><label>{L('order_detail.field.note_reject', 'Ghi chú (bắt buộc khi từ chối)')}</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do từ chối / góp ý…" /></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => quoteResponse('confirm')} style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 'var(--radius)', cursor: 'pointer', fontWeight: 600 }}>✅ Xác nhận báo giá</button>
              <button onClick={() => { if (!note.trim()) { setErr('Vui lòng nhập lý do từ chối'); return; } quoteResponse('reject'); }} style={{ background: '#b91c1c', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: 'var(--radius)', cursor: 'pointer', fontWeight: 600 }}>❌ Từ chối</button>
            </div>
          </div>
        )}

        <div className="grid cols-2">
          <div className="card">
            <h3 style={{ marginTop: 0 }}>Thông tin đơn</h3>
            <Info label={L('order_detail.info.du_an', 'Dự án')} value={o.project_name} />
            <Info label={L('order_detail.info.nguoi_yc', 'Người YC')} value={`${o.requester_name || ''} ${o.requester_email ? '(' + o.requester_email + ')' : ''}`} />
            <Info label={L('order_detail.info.team', 'Team')} value={o.team_name} />
            <Info label={L('order_detail.info.hang_muc', 'Hạng mục')} value={o.hang_muc} />
            <Info label={L('order_detail.info.diem_nhan', 'Điểm nhận')} value={o.receiving_point} />
            <Info label={L('order_detail.info.ngay_yc', 'Ngày YC')} value={fmtDate(o.request_date)} />
            <Info label={L('order_detail.info.ngay_nhan', 'Ngày nhận')} value={fmtDate(o.expected_date)} />
            <Info label={L('order_detail.info.pm', 'PM')} value={o.pm} />
            <Info label={L('order_detail.info.so_qdnb', 'Số QĐNB')} value={o.qdnb_tbkm} />
            <Info label="Link QĐNB" value={o.qdnb_link ? <a href={o.qdnb_link} target="_blank" rel="noreferrer">Mở liên kết</a> : ''} />
            <Info label={L('order_detail.info.tong_gia_tri', 'Tổng giá trị')} value={fmtVND(o.total_amount)} />
            {Object.entries(o.custom_fields || {}).map(([k, v]) => <Info key={k} label={k} value={String(v)} />)}
          </div>

          <div className="card">
            <h3 style={{ marginTop: 0 }}>⚙️ Tiến trình</h3>
            <div className="field">
              <label>{L('order_detail.field.change_status', 'Chuyển trạng thái')}</label>
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
                {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label>{L('order_detail.field.note', 'Ghi chú')}</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Lý do / ghi chú" /></div>
            <button className="btn-primary" onClick={changeStatus}>Cập nhật tiến trình</button>
            {canWrite && o.status !== 'pending_confirmation' && (
              <button onClick={sendQuote} style={{ marginTop: 8, width: '100%', background: '#db2777', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 'var(--radius)', cursor: 'pointer', fontWeight: 600 }}>
                📩 Gửi báo giá để Requester xác nhận
              </button>
            )}

            {canWrite && (
              <div style={{ marginTop: 14 }}>
                <label>{L('order_detail.field.send_email', 'Gửi email')}</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  <button className="btn-sm" onClick={() => sendEmail('confirm')}>Xác nhận NCC</button>
                  <button className="btn-sm" onClick={() => sendEmail('handover')}>Bàn giao</button>
                  <button className="btn-sm" onClick={() => sendEmail('survey')}>Khảo sát</button>
                </div>
              </div>
            )}

            <div style={{ marginTop: 14 }}>
              <label>{L('order_detail.field.history', 'Lịch sử tiến trình')}</label>
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
          <h3 style={{ marginTop: 0 }}>Nhà cung cấp theo đơn</h3>
          {(o.order_suppliers || []).length ? <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {o.order_suppliers.map((s) => <button key={s.supplier_id} className="btn-sm" onClick={() => setSupplierEdit(s)}>{s.supplier_name} · {fmtVND(s.supplier_total)}</button>)}
          </div> : <div className="muted">Chưa có NCC từ các dòng hàng. Chọn NCC khi thêm/sửa dòng hàng để quản lý điều khoản theo đơn.</div>}
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><h3 style={{ marginTop: 0 }}>Chi tiết hàng ({o.items.length})</h3>{canWrite && <button className="btn-primary" onClick={() => setEditing({})}>+ Thêm dòng hàng</button>}</div>
          <div className="table-wrap" style={{ border: 'none' }}>
            <table>
              <thead><tr>
                <th>{L('order_detail.col.ma_hang', 'Mã hàng')}</th>
                <th>{L('order_detail.col.loai', 'Loại')}</th>
                <th>{L('order_detail.col.ten_hang', 'Tên hàng')}</th>
                <th>{L('order_detail.col.sl', 'SL')}</th>
                <th>{L('order_detail.col.don_gia', 'Đơn giá')}</th>
                <th>{L('order_detail.col.tong', 'Tổng')}</th>
                <th>{L('order_detail.col.ncc', 'NCC')}</th>
                <th>{L('order_detail.col.bg', 'BG')}</th>
                <th>PR</th><th>Link thiết kế</th>
                <th>{L('order_detail.col.tien_trinh_dong', 'Tiến trình dòng')}</th>
                {canWrite && <th>{L('order_detail.col.xu_ly', 'Xử lý')}</th>}
              </tr></thead>
              <tbody>
                {o.items.map((it) => (
                  <tr key={it.id} onClick={() => setEditing(it)} style={{ cursor: canWrite ? 'pointer' : 'default' }}>
                    <td>{it.item_code || <span className="muted">chưa có</span>}</td>
                    <td>{it.loai_hh || '-'}</td>
                    <td>{it.item_name}</td>
                    <td className="r">{fmtNum(it.quantity)}</td>
                    <td className="r">{fmtVND(it.unit_price)}</td>
                    <td className="r"><strong>{fmtVND(it.line_total)}</strong></td>
                    <td>{it.supplier_name || '-'}</td>
                    <td>{it.quotation_url ? <a href={it.quotation_url} target="_blank" rel="noreferrer">📎</a> : '-'}</td>
                    <td>{it.so_pr || '-'}</td>
                    <td>{it.design_link ? <a href={it.design_link} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Mở</a> : '-'}</td>
                    <td>
                      {canWrite ? (
                        <select value={normalizeLineStatus(it.progress)} onClick={(e) => e.stopPropagation()} onChange={(e) => setLineStatus(it.id, e.target.value)}>
                          {LINE_STATUSES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
                        </select>
                      ) : (LINE_STATUSES.find((s) => s.code === normalizeLineStatus(it.progress))?.name || '-')}
                    </td>
                    {canWrite && (
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <button className="btn-sm" onClick={(e) => { e.stopPropagation(); setEditing(it); }}>Sửa</button>{' '}
                        {!it.in_catalog && <button className="btn-sm" title="Đẩy sang Danh mục SP → sinh mã hàng, chờ nhập kho" onClick={() => toCatalog(it.id)}>→ Kho</button>}{' '}
                        <button className="btn-sm" title="Bàn giao trực tiếp cho Requester" onClick={(e) => { e.stopPropagation(); handover(it.id); }}>Bàn giao</button>{' '}
                        <button className="btn-sm btn-danger" onClick={(e) => { e.stopPropagation(); deleteLine(it.id); }}>Xóa</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && <LineEdit item={editing} orderId={o.id} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {supplierEdit && <OrderSupplierEdit orderId={o.id} supplier={supplierEdit} onClose={() => setSupplierEdit(null)} onSaved={() => { setSupplierEdit(null); load(); }} />}
      {editHdr && <EditOrder order={o} teams={teams} onClose={() => setEditHdr(false)} onSaved={() => { setEditHdr(false); load(); }} />}
    </>
  );
}

// Sửa thông tin đơn (header) + trường tùy chỉnh (thêm/bớt tự do).
function EditOrder({ order, teams, onClose, onSaved }) {
  const { L } = useMeta();
  const [f, setF] = useState({
    project_name: order.project_name || '', receiving_point: order.receiving_point || '', hang_muc: order.hang_muc || '',
    qdnb_tbkm: order.qdnb_tbkm || '', pm: order.pm || '', team_id: order.team_id || '', supplier_id: order.supplier_id || '',
    request_date: (order.request_date || '').slice(0, 10), expected_date: (order.expected_date || '').slice(0, 10),
    qdnb_link: order.qdnb_link || '', note: order.note || '',
  });
  const [cf, setCf] = useState(Object.entries(order.custom_fields || {}).map(([k, v]) => ({ k, v })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setF({ ...f, [k]: v });

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const custom = {};
      cf.forEach((r) => { if (r.k.trim()) custom[r.k.trim()] = r.v; });
      await api.put(`/orders/${order.id}`, { ...f, team_id: f.team_id || null, supplier_id: f.supplier_id || null, custom_fields: custom });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Sửa đơn ${order.order_code}`} onClose={onClose} onSubmit={save} busy={busy}>
      <div className="field"><label>{L('order_detail.field.ten_du_an', 'Tên dự án')}</label><input value={f.project_name} onChange={(e) => set('project_name', e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>{L('order_detail.field.team', 'Team')}</label>
          <select value={f.team_id} onChange={(e) => set('team_id', e.target.value)}><option value="">--</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </div>
        <div className="field"><label>{L('order_detail.field.hang_muc', 'Hạng mục')}</label><input value={f.hang_muc} onChange={(e) => set('hang_muc', e.target.value)} /></div>
      </div>
      <div className="field"><label>{L('order_detail.field.diem_nhan', 'Điểm nhận')}</label><input value={f.receiving_point} onChange={(e) => set('receiving_point', e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>{L('order_detail.field.ngay_yc', 'Ngày YC')}</label><input type="date" value={f.request_date} onChange={(e) => set('request_date', e.target.value)} /></div>
        <div className="field"><label>{L('order_detail.field.ngay_nhan', 'Ngày nhận')}</label><input type="date" value={f.expected_date} onChange={(e) => set('expected_date', e.target.value)} /></div>
      </div>
      <div className="row">
        <div className="field"><label>{L('order_detail.field.so_qdnb', 'Số QĐNB')}</label><input value={f.qdnb_tbkm} onChange={(e) => set('qdnb_tbkm', e.target.value)} /></div>
        <div className="field"><label>{L('order_detail.field.pm', 'PM')}</label><input value={f.pm} onChange={(e) => set('pm', e.target.value)} /></div>
      </div>
      <div className="field"><label>Link QĐNB</label><input type="url" value={f.qdnb_link} onChange={(e) => set('qdnb_link', e.target.value)} placeholder="https://..." /></div>
      <div className="field"><label>{L('order_detail.field.ghi_chu', 'Ghi chú')}</label><input value={f.note} onChange={(e) => set('note', e.target.value)} /></div>

      <label>{L('order_detail.field.custom_fields', 'Trường tùy chỉnh (thêm/bớt tự do)')}</label>
      {cf.map((r, i) => (
        <div className="row" key={i} style={{ marginBottom: 6 }}>
          <input placeholder="Tên trường" value={r.k} onChange={(e) => setCf(cf.map((x, j) => (j === i ? { ...x, k: e.target.value } : x)))} />
          <input placeholder="Giá trị" value={r.v} onChange={(e) => setCf(cf.map((x, j) => (j === i ? { ...x, v: e.target.value } : x)))} />
          <button type="button" className="btn-sm btn-danger" onClick={() => setCf(cf.filter((_, j) => j !== i))}>×</button>
        </div>
      ))}
      <button type="button" className="btn-sm" onClick={() => setCf([...cf, { k: '', v: '' }])}>+ Thêm trường</button>
      {err && <div className="error">{err}</div>}
    </Modal>
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
function LineEdit({ item, orderId, onClose, onSaved }) {
  const { L } = useMeta();
  const [f, setF] = useState({
    loai_hh: item.loai_hh || 'Vật phẩm', item_name: item.item_name || '', description: item.description || '',
    quantity: item.quantity || 0, unit_price: item.unit_price || 0, vatPct: Math.round((Number(item.vat_rate) || 0) * 100),
    unit: item.unit || '', supplier_id: item.supplier_id || '', master_contract: item.master_contract || '',
    so_pr: item.so_pr || '', design_link: item.design_link || '', note: item.note || '', progress: normalizeLineStatus(item.progress),
  });
  const [bg, setBg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const pickNcc = (sid, s) => setF({ ...f, supplier_id: sid, master_contract: s?.master_contract || f.master_contract });
  const onFile = (e) => { const file = e.target.files?.[0]; if (!file) return; const rd = new FileReader(); rd.onload = () => setBg(rd.result); rd.readAsDataURL(file); };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const payload = {
        loai_hh: f.loai_hh, item_name: f.item_name, description: f.description, unit: f.unit,
        quantity: Number(f.quantity || 0), unit_price: Number(f.unit_price || 0), vat_rate: Number(f.vatPct || 0) / 100,
        supplier_id: f.supplier_id || null, master_contract: f.master_contract, so_pr: f.so_pr, design_link: f.design_link, note: f.note, progress: f.progress,
      };
      if (!payload.item_name.trim()) throw new Error('Tên hàng là bắt buộc');
      const result = item.id ? await api.put(`/orders/items/${item.id}`, payload) : await api.post(`/orders/${orderId}/items`, payload);
      if (bg && item.id) await api.post(`/uploads/order-quote/${item.id}`, { data: bg, filename: 'bao-gia' });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={item.id ? `Sửa dòng: ${item.item_code || item.item_name}` : 'Thêm dòng hàng'} onClose={onClose} onSubmit={save} busy={busy}>
      <div className="row">
        <div className="field"><label>{L('order_detail.line.loai_hh', 'Loại HH')}</label><select value={f.loai_hh} onChange={(e) => setF({ ...f, loai_hh: e.target.value })}>{LOAI_HH.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
        <div className="field"><label>{L('order_detail.line.dvt', 'ĐVT')}</label><input value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} /></div>
      </div>
      <div className="field"><label>Tiến trình dòng</label><select value={f.progress} onChange={(e) => setF({ ...f, progress: e.target.value })}>{LINE_STATUSES.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></div>
      <div className="field"><label>{L('order_detail.line.ten_hang', 'Tên hàng')}</label><input value={f.item_name} onChange={(e) => setF({ ...f, item_name: e.target.value })} /></div>
      <div className="row">
        <div className="field"><label>{L('order_detail.line.so_luong', 'Số lượng')}</label><input type="number" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} /></div>
        <div className="field"><label>{L('order_detail.line.don_gia', 'Đơn giá')}</label><input type="number" value={f.unit_price} onChange={(e) => setF({ ...f, unit_price: e.target.value })} /></div>
        <div className="field"><label>{L('order_detail.line.vat', 'VAT %')}</label><input type="number" value={f.vatPct} onChange={(e) => setF({ ...f, vatPct: e.target.value })} /></div>
      </div>
      <div className="row">
        <div className="field"><label>{L('order_detail.line.ncc', 'Nhà cung cấp')}</label>
          <SupplierSelect value={f.supplier_id} onChange={(v, s) => pickNcc(v, s)} />
        </div>
        <div className="field"><label>{L('order_detail.line.master_contract', 'Master Contract')}</label><input value={f.master_contract} onChange={(e) => setF({ ...f, master_contract: e.target.value })} /></div>
      </div>
      <div className="row">
        <div className="field"><label>{L('order_detail.line.so_pr', 'Số PR')}</label><input value={f.so_pr} onChange={(e) => setF({ ...f, so_pr: e.target.value })} /></div>
        <div className="field"><label>{L('order_detail.line.link_thiet_ke', 'Link thiết kế')}</label><input value={f.design_link} onChange={(e) => setF({ ...f, design_link: e.target.value })} /></div>
      </div>
      <div className="field"><label>{L('order_detail.line.ghi_chu', 'Ghi chú')}</label><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
      <div className="field">
        <label>{L('order_detail.line.file_bg', 'File báo giá (FILE_BG)')}</label>
        {item.quotation_url && !bg && <div><a href={item.quotation_url} target="_blank" rel="noreferrer">Xem file hiện tại</a></div>}
        <input type="file" onChange={onFile} />
      </div>
      {err && <div className="error">{err}</div>}
    </Modal>
  );
}

function OrderSupplierEdit({ orderId, supplier, onClose, onSaved }) {
  const [f, setF] = useState({
    payment_method: supplier.payment_method || '', payment_time: supplier.payment_time || '',
    contract_no: supplier.contract_no || '', vendor_link: supplier.vendor_link || '', discount_type: supplier.discount_type || 'percent', discount_value: supplier.discount_value || 0,
  });
  const [custom, setCustom] = useState(Object.entries(supplier.custom_fields || {}).map(([k, v]) => ({ k, v })));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const custom_fields = {}; custom.forEach(({ k, v }) => { if (k.trim()) custom_fields[k.trim()] = v; });
      await api.put(`/orders/${orderId}/suppliers/${supplier.supplier_id}`, { ...f, custom_fields }); onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return <Modal title={`NCC theo đơn: ${supplier.supplier_name}`} onClose={onClose} onSubmit={save} busy={busy}>
    <div className="card" style={{ padding: 10, marginBottom: 10, background: '#f8fafc' }}><div>Tạm tính: <strong>{fmtVND(supplier.supplier_subtotal)}</strong></div><div>Chiết khấu: <strong>{fmtVND(supplier.discount_amount)}</strong></div><div>Thành tiền NCC: <strong>{fmtVND(supplier.supplier_total)}</strong></div></div>
    <div className="row"><div className="field"><label>Loại chiết khấu</label><select value={f.discount_type} onChange={(e) => setF({ ...f, discount_type: e.target.value })}><option value="percent">Phần trăm (%)</option><option value="amount">Số tiền (đ)</option></select></div><div className="field"><label>Giá trị chiết khấu</label><input type="number" min="0" max={f.discount_type === 'percent' ? 100 : undefined} value={f.discount_value} onChange={(e) => setF({ ...f, discount_value: e.target.value })} /></div></div>
    <div className="field"><label>Hình thức thanh toán</label><select value={f.payment_method} onChange={(e) => setF({ ...f, payment_method: e.target.value })}><option value="">-- Chọn --</option>{['30-70', '50-50', '100', 'Thanh toán sau', 'Khác'].map((x) => <option key={x}>{x}</option>)}</select></div>
    <div className="field"><label>Thời gian thanh toán</label><input value={f.payment_time} onChange={(e) => setF({ ...f, payment_time: e.target.value })} /></div>
    <div className="field"><label>Số hợp đồng</label><input value={f.contract_no} onChange={(e) => setF({ ...f, contract_no: e.target.value })} /></div>
    <div className="field"><label>Link Vendor</label><input type="url" value={f.vendor_link} onChange={(e) => setF({ ...f, vendor_link: e.target.value })} /></div>
    <label>Trường tùy chỉnh</label>{custom.map((r, i) => <div className="row" key={i}><input placeholder="Tên" value={r.k} onChange={(e) => setCustom(custom.map((x, j) => j === i ? { ...x, k: e.target.value } : x))} /><input placeholder="Giá trị" value={r.v} onChange={(e) => setCustom(custom.map((x, j) => j === i ? { ...x, v: e.target.value } : x))} /><button type="button" className="btn-sm btn-danger" onClick={() => setCustom(custom.filter((_, j) => j !== i))}>×</button></div>)}
    <button type="button" className="btn-sm" onClick={() => setCustom([...custom, { k: '', v: '' }])}>+ Thêm trường</button>{err && <div className="error">{err}</div>}
  </Modal>;
}
