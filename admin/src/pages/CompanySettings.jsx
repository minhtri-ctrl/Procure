import { useEffect, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';

const ROLE_LABEL = {
  contract: 'Ký hợp đồng / ĐĐH (Bên A)',
  thu_kho: 'Thủ kho (phiếu kho)',
  ke_toan: 'Kế toán (PXK)',
  truong_phong: 'Trưởng phòng (PNK)',
};
const ROLE_KEYS = Object.keys(ROLE_LABEL);

export default function CompanySettings() {
  const [company, setCompany] = useState({ name: '', address: '', tax_code: '', phone: '', email: '' });
  const [busyCompany, setBusyCompany] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [rows, setRows] = useState([]);
  const [teams, setTeams] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [rowErr, setRowErr] = useState('');

  const load = () => {
    api.get('/settings/company').then((r) => setCompany({ name: '', address: '', tax_code: '', phone: '', email: '', ...r })).catch(() => {});
    api.get('/signatories?limit=200').then((r) => setRows(r.data)).catch(() => {});
    api.get('/teams?limit=200').then((r) => setTeams(r.data)).catch(() => {});
  };
  useEffect(load, []);

  const saveCompany = async () => {
    setBusyCompany(true); setErr(''); setMsg('');
    try { await api.put('/settings/company', company); setMsg('Đã lưu thông tin công ty'); }
    catch (e) { setErr(e.message); } finally { setBusyCompany(false); }
  };

  const openNew = () => { setForm({ role_key: 'contract', scope: 'default', name: '', title: '', phone: '', email: '' }); setRowErr(''); setEditing({}); };
  const openEdit = (r) => { setForm({ ...r }); setRowErr(''); setEditing(r); };
  const save = async () => {
    setBusy(true); setRowErr('');
    try {
      if (editing.id) await api.put(`/signatories/${editing.id}`, form);
      else await api.post('/signatories', form);
      setEditing(null); load();
    } catch (e) { setRowErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (r) => { if (!confirm(`Xoá người ký "${r.name}" (${ROLE_LABEL[r.role_key] || r.role_key} • ${r.scope})?`)) return; await api.del(`/signatories/${r.id}`); load(); };

  return (
    <>
      <div className="topbar"><h1>Cấu hình công ty</h1></div>
      <div className="content">
        <div className="card" style={{ maxWidth: 640, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Thông tin công ty (Bên A)</h3>
          <p className="muted">Dùng để điền tự động vào hợp đồng / đơn đặt hàng .docx — sửa 1 lần, không cần sửa tay trong file mẫu.</p>
          <div className="field"><label>Tên công ty</label><input value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} /></div>
          <div className="field"><label>Địa chỉ</label><input value={company.address} onChange={(e) => setCompany({ ...company, address: e.target.value })} /></div>
          <div className="row">
            <div className="field"><label>Mã số thuế</label><input value={company.tax_code} onChange={(e) => setCompany({ ...company, tax_code: e.target.value })} /></div>
            <div className="field"><label>Điện thoại</label><input value={company.phone} onChange={(e) => setCompany({ ...company, phone: e.target.value })} /></div>
          </div>
          <div className="field"><label>Email</label><input value={company.email} onChange={(e) => setCompany({ ...company, email: e.target.value })} /></div>
          {msg && <div style={{ color: 'var(--green)' }}>{msg}</div>}
          {err && <div className="error">{err}</div>}
          <button className="btn-primary" onClick={saveCompany} disabled={busyCompany} style={{ marginTop: 8 }}>{busyCompany ? 'Đang lưu…' : 'Lưu thông tin công ty'}</button>
        </div>

        <div className="card">
          <div className="toolbar" style={{ padding: 0, marginBottom: 10 }}>
            <div>
              <h3 style={{ margin: 0 }}>Người ký mặc định</h3>
              <p className="muted" style={{ margin: '4px 0 0' }}>Chức danh, tên, liên hệ người ký hợp đồng / thủ kho / kế toán / trưởng phòng. Có thể đặt riêng theo Team (VD: AOV) — không có riêng sẽ dùng dòng "Mặc định".</p>
            </div>
            <div className="spacer" />
            <button className="btn-primary" onClick={openNew}>+ Thêm người ký</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Vai trò</th><th>Phạm vi (team)</th><th>Họ tên</th><th>Chức danh</th><th>Điện thoại</th><th>Email</th><th></th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>{ROLE_LABEL[r.role_key] || r.role_key}</td>
                    <td>{r.scope === 'default' ? <span className="muted">Mặc định</span> : <strong>{r.scope}</strong>}</td>
                    <td>{r.name}</td><td>{r.title || '-'}</td><td>{r.phone || '-'}</td><td>{r.email || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-sm" onClick={() => openEdit(r)}>Sửa</button>{' '}
                      <button className="btn-sm btn-danger" onClick={() => remove(r)}>Xoá</button>
                    </td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="center-msg">Chưa có người ký</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Sửa người ký' : 'Thêm người ký'} onClose={() => setEditing(null)} onSubmit={save} busy={busy}>
          <div className="row">
            <div className="field"><label>Vai trò *</label>
              <select value={form.role_key} onChange={(e) => setForm({ ...form, role_key: e.target.value })}>
                {ROLE_KEYS.map((k) => <option key={k} value={k}>{ROLE_LABEL[k]}</option>)}
              </select>
            </div>
            <div className="field"><label>Phạm vi (team)</label>
              <select value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                <option value="default">Mặc định (mọi team)</option>
                {teams.map((t) => <option key={t.id} value={t.code}>{t.code} — {t.name}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Họ và tên *</label><input value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="row">
            <div className="field"><label>Chức danh</label><input placeholder="VD: Giám đốc / Tổng giám đốc" value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div className="field"><label>Điện thoại</label><input value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          </div>
          <div className="field"><label>Email</label><input value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          {rowErr && <div className="error">{rowErr}</div>}
        </Modal>
      )}
    </>
  );
}
