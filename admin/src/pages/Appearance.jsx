import { useState } from 'react';
import { api } from '../api.js';
import { useMeta } from '../meta.jsx';

const FIELDS = [
  { key: 'primary', label: 'Màu chính (nút, nhấn mạnh)' },
  { key: 'sidebar', label: 'Màu thanh bên (sidebar)' },
  { key: 'bg', label: 'Màu nền trang' },
  { key: 'accent', label: 'Màu phụ (accent/link)' },
];
const PRESETS = {
  'Garena (cam)': { primary: '#ff5722', sidebar: '#16202e', bg: '#f4f6fb', accent: '#2563eb' },
  'Xanh dương': { primary: '#2563eb', sidebar: '#0f172a', bg: '#f1f5f9', accent: '#0891b2' },
  'Xanh lá': { primary: '#16a34a', sidebar: '#14312a', bg: '#f0fdf4', accent: '#0d9488' },
  'Tím': { primary: '#7c3aed', sidebar: '#1e1b2e', bg: '#f5f3ff', accent: '#db2777' },
};

export default function Appearance() {
  const { theme, setTheme, applyTheme, reloadTheme } = useMeta();
  const [form, setForm] = useState({ primary: '#ff5722', sidebar: '#16202e', bg: '#f4f6fb', accent: '#2563eb', ...theme });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const set = (k, v) => { const next = { ...form, [k]: v }; setForm(next); applyTheme(next); };
  const applyPreset = (p) => { const next = { ...form, ...PRESETS[p] }; setForm(next); applyTheme(next); };
  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    try { await api.put('/settings/theme', form); setTheme(form); await reloadTheme(); setMsg('Đã lưu giao diện'); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const reset = () => { const d = { primary: '#ff5722', sidebar: '#16202e', bg: '#f4f6fb', accent: '#2563eb' }; setForm(d); applyTheme(d); };

  return (
    <>
      <div className="topbar"><h1>Giao diện</h1></div>
      <div className="content">
        <div className="card" style={{ maxWidth: 560 }}>
          <h3 style={{ marginTop: 0 }}>Bảng màu</h3>
          <p className="muted">Chỉnh màu và xem trước ngay lập tức. Bấm Lưu để áp dụng cho mọi người.</p>
          <div className="field">
            <label>Mẫu có sẵn</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {Object.keys(PRESETS).map((p) => <button key={p} className="btn-sm" onClick={() => applyPreset(p)}>{p}</button>)}
            </div>
          </div>
          {FIELDS.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="color" value={form[f.key] || '#000000'} onChange={(e) => set(f.key, e.target.value)} style={{ width: 60, height: 40, padding: 2 }} />
                <input value={form[f.key] || ''} onChange={(e) => set(f.key, e.target.value)} style={{ maxWidth: 160 }} />
              </div>
            </div>
          ))}
          {msg && <div style={{ color: 'var(--green)' }}>{msg}</div>}
          {err && <div className="error">{err}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button onClick={reset}>Mặc định</button>
            <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu giao diện'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
