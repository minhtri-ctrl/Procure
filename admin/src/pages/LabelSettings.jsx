import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useMeta } from '../meta.jsx';
import { buildLabelManifest } from '../labelDefs.js';

const MANIFEST = buildLabelManifest();

// Trang admin "Tuỳ chỉnh nhãn": sửa CHỈ phần hiển thị (tên menu/tên cột/label form),
// không đụng tên cột DB hay logic. Lưu vào settings.ui_labels (key -> text tuỳ chỉnh);
// MetaProvider.reloadLabels() áp dụng ngay cho toàn app sau khi lưu, không cần deploy lại.
export default function LabelSettings() {
  const { labels, setLabels, reloadLabels } = useMeta();
  const [draft, setDraft] = useState(() => ({ ...labels }));
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const groups = useMemo(() => {
    const byGroup = {};
    for (const item of MANIFEST) {
      if (q && !item.default.toLowerCase().includes(q.toLowerCase()) && !item.key.includes(q.toLowerCase())) continue;
      (byGroup[item.group] ||= []).push(item);
    }
    return byGroup;
  }, [q]);

  const setVal = (key, v) => setDraft((d) => ({ ...d, [key]: v }));
  const resetOne = (key) => setDraft((d) => { const n = { ...d }; delete n[key]; return n; });
  const resetAll = () => setDraft({});

  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    try {
      // Chỉ lưu những nhãn khác rỗng — key trống nghĩa là dùng lại mặc định.
      const clean = Object.fromEntries(Object.entries(draft).filter(([, v]) => v != null && v !== ''));
      await api.put('/settings/labels', clean);
      setLabels(clean);
      await reloadLabels();
      setMsg('Đã lưu nhãn hiển thị.');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="topbar"><h1>Tuỳ chỉnh nhãn</h1></div>
      <div className="content">
        <div className="card" style={{ marginBottom: 16 }}>
          <p className="muted" style={{ marginTop: 0 }}>
            Đổi tên hiển thị của mục menu, tiêu đề cột bảng và nhãn ô nhập liệu — <b>không</b> ảnh hưởng dữ liệu hay cấu trúc bảng trong hệ thống.
            Sửa xong bấm <b>Lưu</b>, giao diện của mọi người cập nhật ngay, không cần deploy lại.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="search" placeholder="Tìm nhãn…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
            <div className="spacer" />
            <button onClick={resetAll}>Khôi phục mặc định (tất cả)</button>
            <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : '💾 Lưu'}</button>
          </div>
          {msg && <div style={{ color: 'var(--green)', marginTop: 8 }}>{msg}</div>}
          {err && <div className="error" style={{ marginTop: 8 }}>{err}</div>}
        </div>

        {Object.entries(groups).map(([group, items]) => (
          <div className="card" key={group} style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>{group}</h3>
            <table>
              <thead><tr><th style={{ width: '30%' }}>Mặc định</th><th>Hiển thị tuỳ chỉnh</th><th style={{ width: '30%' }}>Xem trước</th><th></th></tr></thead>
              <tbody>
                {items.map((item) => {
                  const val = draft[item.key] ?? '';
                  const preview = val || item.default;
                  return (
                    <tr key={item.key}>
                      <td className="muted">{item.default}</td>
                      <td>
                        <input
                          value={val}
                          placeholder={item.default}
                          onChange={(e) => setVal(item.key, e.target.value)}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td><span className="badge">{preview}</span></td>
                      <td>{val && <button className="btn-sm" onClick={() => resetOne(item.key)}>Mặc định</button>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {!Object.keys(groups).length && <div className="center-msg">Không tìm thấy nhãn phù hợp</div>}
      </div>
    </>
  );
}
