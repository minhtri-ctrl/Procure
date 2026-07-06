import { useState } from 'react';
import { api } from '../api.js';
import { refreshSuppliers } from '../components/SupplierSelect.jsx';

export default function ImportData() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');
  const [fileName, setFileName] = useState('');

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name); setErr(''); setResult(null);
    const rd = new FileReader();
    rd.onload = async () => {
      const b64 = String(rd.result).split(',')[1];
      setBusy(true);
      try { setResult(await api.post('/import', { fileBase64: b64 })); refreshSuppliers(); }
      catch (e2) { setErr(e2.message); } finally { setBusy(false); }
    };
    rd.readAsDataURL(f);
  };

  return (
    <>
      <div className="topbar"><h1>Nhập dữ liệu (Import)</h1></div>
      <div className="content">
        <div className="card" style={{ maxWidth: 620 }}>
          <p className="muted">Chọn file Excel chứa sheet <b>DATA</b> (đơn hàng), <b>NCC</b> (nhà cung cấp), <b>DM_SP</b> (loại hàng). Hệ sẽ nạp/cập nhật vào hệ thống (import lại sẽ ghi đè theo mã đơn).</p>
          <input type="file" accept=".xlsx,.xls" onChange={onFile} disabled={busy} />
          {fileName && <div className="muted" style={{ marginTop: 8 }}>File: {fileName}</div>}
          {busy && <div style={{ marginTop: 10 }}>Đang nhập dữ liệu… (có thể mất 30–60 giây)</div>}
          {err && <div className="error">{err}</div>}
          {result && (
            <div style={{ marginTop: 12, color: 'var(--green)' }}>
              ✅ Đã nhập: {result.categories || 0} loại hàng · {result.suppliers || 0} NCC · {result.orders || 0} đơn hàng · {result.order_items || 0} dòng hàng.
            </div>
          )}
        </div>
      </div>
    </>
  );
}
