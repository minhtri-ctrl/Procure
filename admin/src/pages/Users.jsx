import { useEffect, useState } from 'react';
import { api, fmtDate } from '../api.js';
import Modal from '../components/Modal.jsx';

const ROLES = { admin: 'Admin', purchasing: 'Mua hàng', warehouse: 'Kho', requester: 'Người YC' };

export default function Users() {
  const [rows, setRows] = useState([]);
  const [teams, setTeams] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.get('/users').then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); api.get('/teams?limit=200').then((r) => setTeams(r.data)); }, []);

  const openNew = () => { setForm({ role: 'requester' }); setEditing({}); };
  const openEdit = (row) => { setForm({ ...row, password: '' }); setEditing(row); };
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const payload = { ...form, team_id: form.team_id || null };
      if (editing.id) await api.put(`/users/${editing.id}`, payload);
      else await api.post('/users', payload);
      setEditing(null); load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (row) => { if (confirm(`Xoá "${row.email}"?`)) { await api.del(`/users/${row.id}`); load(); } };

  return (
    <>
      <div className="topbar"><h1>Người dùng</h1></div>
      <div className="content">
        <div className="toolbar"><div className="spacer" /><button className="btn-primary" onClick={openNew}>+ Thêm người dùng</button></div>
        {err && <div className="error">{err}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>Email</th><th>Họ tên</th><th>Vai trò</th><th>Team</th><th>Đăng nhập cuối</th><th></th></tr></thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.email}</strong></td>
                  <td>{u.full_name}</td>
                  <td><span className="badge b-in_progress">{ROLES[u.role] || u.role}</span></td>
                  <td>{u.team_name || '-'}</td>
                  <td>{u.last_login_at ? fmtDate(u.last_login_at) : '-'}</td>
                  <td>
                    <button className="btn-sm" onClick={() => openEdit(u)}>Sửa</button>{' '}
                    <button className="btn-sm btn-danger" onClick={() => remove(u)}>Xoá</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Sửa người dùng' : 'Thêm người dùng'} onClose={() => setEditing(null)} onSubmit={save} busy={busy}>
          <div className="field"><label>Email *</label><input type="email" required value={form.email ?? ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label>Họ tên</label><input value={form.full_name ?? ''} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="row">
            <div className="field"><label>Vai trò</label>
              <select value={form.role ?? 'requester'} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="field"><label>Team</label>
              <select value={form.team_id ?? ''} onChange={(e) => setForm({ ...form, team_id: e.target.value })}>
                <option value="">--</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Mật khẩu {editing.id && '(để trống nếu không đổi)'}</label>
            <input type="password" value={form.password ?? ''} onChange={(e) => setForm({ ...form, password: e.target.value })} required={!editing.id} />
          </div>
          {err && <div className="error">{err}</div>}
        </Modal>
      )}
    </>
  );
}
