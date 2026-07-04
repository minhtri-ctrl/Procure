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

const SMTP_DEFAULT = { host: '', port: 587, secure: false, user: '', pass: '', from_name: '', from_email: '' };

export default function CompanySettings() {
  const [company, setCompany] = useState({ name: '', address: '', tax_code: '', phone: '', email: '' });
  const [busyCompany, setBusyCompany] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [smtp, setSmtp] = useState(SMTP_DEFAULT);
  const [smtpConfigured, setSmtpConfigured] = useState(false);
  const [busySmtp, setBusySmtp] = useState(false);
  const [smtpMsg, setSmtpMsg] = useState('');
  const [smtpErr, setSmtpErr] = useState('');
  const [testBusy, setTestBusy] = useState(false);

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
    api.get('/settings/smtp').then((r) => { setSmtp({ ...SMTP_DEFAULT, ...r, pass: '' }); setSmtpConfigured(!!r.configured); }).catch(() => {});
  };
  useEffect(load, []);

  const saveCompany = async () => {
    setBusyCompany(true); setErr(''); setMsg('');
    try { await api.put('/settings/company', company); setMsg('Đã lưu thông tin công ty'); }
    catch (e) { setErr(e.message); } finally { setBusyCompany(false); }
  };

  const saveSmtp = async () => {
    setBusySmtp(true); setSmtpErr(''); setSmtpMsg('');
    try { await api.put('/settings/smtp', smtp); setSmtpMsg('Đã lưu cấu hình SMTP'); load(); }
    catch (e) { setSmtpErr(e.message); } finally { setBusySmtp(false); }
  };

  const testSmtp = async () => {
    setTestBusy(true); setSmtpErr(''); setSmtpMsg('');
    try { await api.post('/settings/smtp/test', {}); setSmtpMsg('Đã gửi email thử — kiểm tra hộp thư của bạn'); }
    catch (e) { setSmtpErr(e.message); } finally { setTestBusy(false); }
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

        <div className="card" style={{ maxWidth: 640, marginBottom: 20 }}>
          <h3 style={{ marginTop: 0 }}>Cấu hình SMTP gửi email thật</h3>
          <p className="muted">
            Trạng thái: {smtpConfigured ? <span style={{ color: 'var(--green)' }}>✅ Đã cấu hình — email gửi thật qua SMTP</span> : <span style={{ color: 'var(--red, #b91c1c)' }}>⚠️ Chưa cấu hình — email chỉ được ghi vào lịch sử (mô phỏng), không gửi thật</span>}.
            Điền thông tin máy chủ SMTP (VD: Gmail: smtp.gmail.com, cổng 587, dùng mật khẩu ứng dụng) rồi bấm Lưu, sau đó bấm "Gửi thử" để xác nhận.
          </p>
          <div className="row">
            <div className="field"><label>SMTP Host</label><input placeholder="smtp.gmail.com" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} /></div>
            <div className="field"><label>Port</label><input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} /></div>
          </div>
          <div className="field">
            <label><input type="checkbox" checked={!!smtp.secure} onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })} style={{ width: 'auto', marginRight: 6 }} />Dùng SSL (port 465, tắt nếu dùng STARTTLS 587)</label>
          </div>
          <div className="row">
            <div className="field"><label>Tài khoản (user)</label><input value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} /></div>
            <div className="field"><label>Mật khẩu {smtp.has_password && <span className="muted">(để trống = giữ nguyên)</span>}</label><input type="password" value={smtp.pass} onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })} /></div>
          </div>
          <div className="row">
            <div className="field"><label>Tên người gửi</label><input placeholder="Phòng Mua Hàng Garena VN" value={smtp.from_name} onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })} /></div>
            <div className="field"><label>Email người gửi</label><input value={smtp.from_email} onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })} /></div>
          </div>
          {smtpMsg && <div style={{ color: 'var(--green)' }}>{smtpMsg}</div>}
          {smtpErr && <div className="error">{smtpErr}</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn-primary" onClick={saveSmtp} disabled={busySmtp}>{busySmtp ? 'Đang lưu…' : 'Lưu cấu hình SMTP'}</button>
            <button className="btn-sm" onClick={testSmtp} disabled={testBusy || !smtpConfigured}>{testBusy ? 'Đang gửi…' : '📧 Gửi thử'}</button>
          </div>
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
