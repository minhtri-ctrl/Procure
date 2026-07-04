import { useState } from 'react';
import { useAuth } from '../auth.jsx';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (mode === 'login') await login(email, password);
      else await register(email, password, fullName);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <h1>Procure<span>OS</span></h1>
        <p>Hệ thống quản lý mua hàng · chỉ email @garena.vn</p>
        {mode === 'register' && (
          <div className="field"><label>Họ tên</label><input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
        )}
        <div className="field">
          <label>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="ban@garena.vn" autoFocus />
        </div>
        <div className="field">
          <label>Mật khẩu</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <div className="error">{err}</div>}
        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Đang xử lý…' : mode === 'login' ? 'Đăng nhập' : 'Đăng ký'}
        </button>
        <p style={{ textAlign: 'center', marginTop: 14, marginBottom: 0 }}>
          {mode === 'login'
            ? <>Chưa có tài khoản? <a href="#" onClick={(e) => { e.preventDefault(); setMode('register'); setErr(''); }}>Đăng ký</a></>
            : <>Đã có tài khoản? <a href="#" onClick={(e) => { e.preventDefault(); setMode('login'); setErr(''); }}>Đăng nhập</a></>}
        </p>
      </form>
    </div>
  );
}
