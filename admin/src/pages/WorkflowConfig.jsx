import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useMeta } from '../meta.jsx';
import Modal from '../components/Modal.jsx';

const ACTORS = ['buyer', 'requester', 'warehouse', 'admin'];

export default function WorkflowConfig() {
  const { reloadStates } = useMeta();
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.get('/workflow/all').then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm({ color: '#64748b', sort_order: (rows.length + 1) * 10, is_terminal: 0, is_active: 1, actor: 'buyer' }); setEditing({}); };
  const openEdit = (r) => { setForm({ ...r }); setEditing(r); };
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const payload = { ...form, sort_order: Number(form.sort_order || 0), is_terminal: form.is_terminal ? 1 : 0, is_active: form.is_active ? 1 : 0 };
      if (editing.id) await api.put(`/workflow/${editing.id}`, payload);
      else await api.post('/workflow', payload);
      setEditing(null); load(); reloadStates();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (r) => { if (confirm(`Xoá trạng thái "${r.name}"?`)) { await api.del(`/workflow/${r.id}`); load(); reloadStates(); } };

  return (
    <>
      <div className="topbar"><h1>Cấu hình Workflow</h1><button className="btn-primary" onClick={openNew}>+ Thêm trạng thái</button></div>
      <div className="content">
        <p className="muted">Điều chỉnh các bước tiến trình đơn hàng (tên, màu, thứ tự, vai trò phụ trách). Áp dụng ngay cho toàn hệ thống.</p>
        {err && <div className="error">{err}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Thứ tự</th><th>Mã</th><th>Tên</th><th>Màu</th><th>Vai trò</th><th>Kết thúc</th><th>Hiển thị</th><th></th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.sort_order}</td><td><code>{r.code}</code></td>
                  <td><span className="badge" style={{ background: r.color + '22', color: r.color, border: `1px solid ${r.color}55` }}>{r.name}</span></td>
                  <td><span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, background: r.color, verticalAlign: 'middle' }} /> {r.color}</td>
                  <td>{r.actor || '-'}</td><td>{r.is_terminal ? '✓' : ''}</td><td>{r.is_active ? '✓' : '✕'}</td>
                  <td><button className="btn-sm" onClick={() => openEdit(r)}>Sửa</button>{' '}<button className="btn-sm btn-danger" onClick={() => remove(r)}>Xoá</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Sửa trạng thái' : 'Thêm trạng thái'} onClose={() => setEditing(null)} onSubmit={save} busy={busy}>
          <div className="row">
            <div className="field"><label>Mã (code) *</label><input value={form.code ?? ''} disabled={!!editing.id} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="vd: quoted" /></div>
            <div className="field"><label>Thứ tự</label><input type="number" value={form.sort_order ?? 0} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
          </div>
          <div className="field"><label>Tên hiển thị *</label><input value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="row">
            <div className="field"><label>Màu</label><input type="color" value={form.color ?? '#64748b'} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ height: 40, padding: 2 }} /></div>
            <div className="field"><label>Vai trò phụ trách</label>
              <select value={form.actor ?? 'buyer'} onChange={(e) => setForm({ ...form, actor: e.target.value })}>{ACTORS.map((a) => <option key={a} value={a}>{a}</option>)}</select>
            </div>
          </div>
          <div className="row">
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!form.is_terminal} onChange={(e) => setForm({ ...form, is_terminal: e.target.checked })} /> Trạng thái kết thúc</label>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} /> Đang hiển thị</label>
          </div>
          {err && <div className="error">{err}</div>}
        </Modal>
      )}
    </>
  );
}
