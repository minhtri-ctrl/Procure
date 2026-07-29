import { useState } from 'react';
import { api } from '../api.js';
import SupplierSelect, { refreshSuppliers } from './SupplierSelect.jsx';

const MAX_BYTES = 5 * 1024 * 1024;
const fingerprint = (file) => `${file.name}:${file.size}:${file.lastModified}`;
const readFile = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',').pop()); reader.onerror = reject; reader.readAsDataURL(file); });
const blank = (source) => ({ selected: true, item_name: '', quantity: '', unit_price: '', vat_percent: '', supplier_name: '', supplier_id: '', add_supplier: false, source, raw: '' });

export default function QuotationReview({ onApply, orderItems = [], title = 'Tải báo giá & AI nhập liệu' }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [applied, setApplied] = useState(new Set());
  const updateFile = (key, patch) => setFiles((all) => all.map((f) => f.key === key ? { ...f, ...patch } : f));
  const updateRow = (key, index, patch) => updateFile(key, { items: (files.find((f) => f.key === key)?.items || []).map((row, i) => i === index ? { ...row, ...patch } : row) });
  const upload = async (event) => {
    const chosen = [...(event.target.files || [])]; event.target.value = '';
    if (!chosen.length) return;
    const fresh = chosen.filter((file) => !files.some((old) => old.key === fingerprint(file)));
    if (!fresh.length) { setError('Các file này đã nằm trong phiên review.'); return; }
    if (fresh.some((file) => file.size > MAX_BYTES)) { setError('Mỗi file báo giá tối đa 5 MB.'); return; }
    if (files.length + fresh.length > 3) { setError('Tối đa 3 file cho mỗi lượt phân tích.'); return; }
    setBusy(true); setError('');
    try {
      const payload = await Promise.all(fresh.map(async (file) => ({ client_id: fingerprint(file), filename: file.name, data_base64: await readFile(file) })));
      setFiles((old) => [...old, ...fresh.map((file) => ({ key: fingerprint(file), filename: file.name, previewUrl: URL.createObjectURL(file), status: 'processing', items: [], data_base64: null }))]);
      const result = await api.post('/quotation-extractions/extract-batch', { files: payload });
      setFiles((old) => old.map((entry) => {
        const response = (result.files || []).find((file) => file.client_id === entry.key);
        if (!response) return entry;
        return { ...entry, ...response, data_base64: payload.find((file) => file.client_id === entry.key)?.data_base64 || null,
          items: (response.items || []).map((item) => ({ ...item, selected: true, supplier_id: item.supplier_match?.status === 'matched' ? item.supplier_match.supplier_id : '', add_supplier: false, target_item_id: '' })) };
      }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const issues = (row) => [
    !row.selected && null,
    !String(row.item_name || '').trim() && 'Thiếu tên hàng',
    !(Number(row.quantity) > 0) && 'SL phải lớn hơn 0',
    !(Number(row.unit_price) >= 0) && 'Thiếu đơn giá',
    !(Number(row.vat_percent) >= 0 && Number(row.vat_percent) <= 100) && 'VAT% không hợp lệ',
    !row.supplier_id && !row.add_supplier && 'Chọn NCC hệ thống hoặc xác nhận thêm NCC mới',
  ].filter(Boolean);
  const apply = async () => {
    const rows = files.flatMap((file) => (file.items || []).filter((row) => row.selected).map((row, rowIndex) => ({ ...row, file, rowIndex })));
    if (!rows.length) { setError('Chọn ít nhất một dòng để áp dụng.'); return; }
    if (rows.some((row) => issues(row).length)) { setError('Hoàn tất các dòng cảnh báo trước khi áp dụng.'); return; }
    const duplicate = rows.filter((row) => applied.has(`${row.file.fingerprint}:${row.rowIndex}`));
    if (duplicate.length && !window.confirm(`${duplicate.length} dòng đã từng áp dụng. Bạn có chủ đích thêm/cập nhật lại không?`)) return;
    setBusy(true); setError('');
    try {
      const byName = new Map();
      for (const row of rows) if (!row.supplier_id && row.add_supplier) {
        const name = String(row.supplier_name || '').trim();
        if (!byName.has(name.toLowerCase())) byName.set(name.toLowerCase(), api.post('/suppliers', { name, is_active: 1 }));
      }
      const created = await Promise.all([...byName.entries()].map(async ([name, request]) => [name, await request]));
      const createdIds = new Map(created.map(([name, value]) => [name, value.id]));
      refreshSuppliers();
      const selected = rows.map((row) => ({ ...row, supplier_id: row.supplier_id || createdIds.get(String(row.supplier_name).trim().toLowerCase()) }));
      await onApply(selected);
      setApplied((old) => new Set([...old, ...selected.map((row) => `${row.file.fingerprint}:${row.rowIndex}`)]));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <div className="card" style={{ marginTop: 16 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
      <div><h3 style={{ margin: 0 }}>🤖 {title}</h3><div className="muted" style={{ marginTop: 4 }}>Excel/XLSX/CSV/PDF/PNG/JPG/WEBP; tối đa 5 MB/file, 3 file/lượt. Luôn review trước khi áp dụng.</div></div>
      <label className="btn btn-primary" style={{ cursor: busy ? 'wait' : 'pointer' }}>{busy ? 'Đang xử lý…' : title}<input type="file" multiple accept=".xlsx,.xls,.csv,.pdf,.png,.jpg,.jpeg,.webp" disabled={busy} onChange={upload} style={{ display: 'none' }} /></label>
    </div>
    {files.map((file) => <div key={file.key} className="card" style={{ marginTop: 12, background: '#fffaf0', border: '1px solid #f2c46d' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><strong>{file.filename}</strong><span className={file.status === 'error' ? 'error' : 'muted'}>{file.status === 'processing' ? 'Đang phân tích…' : file.status === 'error' ? file.error : file.mode === 'demo-parser' ? 'DEMO: parser nội bộ, không phải AI.' : file.mode === 'ai' ? 'AI: cần đối chiếu file gốc.' : 'Parser nội bộ.'}</span>{file.previewUrl && <a href={file.previewUrl} target="_blank" rel="noreferrer">Mở file gốc</a>}</div>
      {file.status === 'success' && <div className="table-wrap" style={{ marginTop: 8 }}><table><thead><tr><th>Áp dụng</th><th>TÊN HÀNG</th><th>SL</th><th>ĐƠN GIÁ</th><th>VAT%</th><th>NCC AI đọc</th><th>NCC hệ thống</th>{orderItems.length > 0 && <th>Cập nhật dòng</th>}<th>Cảnh báo</th><th></th></tr></thead><tbody>
        {(file.items || []).map((row, index) => { const warnings = [...(row.issues || []), ...issues(row)]; const match = row.supplier_match || {}; return <tr key={index}>
          <td><input type="checkbox" checked={!!row.selected} onChange={(e) => updateRow(file.key, index, { selected: e.target.checked })} /></td><td><input value={row.item_name || ''} onChange={(e) => updateRow(file.key, index, { item_name: e.target.value })} /></td><td><input type="number" min="0" value={row.quantity ?? ''} onChange={(e) => updateRow(file.key, index, { quantity: e.target.value })} /></td><td><input type="number" min="0" value={row.unit_price ?? ''} onChange={(e) => updateRow(file.key, index, { unit_price: e.target.value })} /></td><td><input type="number" min="0" max="100" value={row.vat_percent ?? ''} onChange={(e) => updateRow(file.key, index, { vat_percent: e.target.value })} /></td>
          <td><input value={row.supplier_name || ''} onChange={(e) => updateRow(file.key, index, { supplier_name: e.target.value, supplier_id: '', add_supplier: false })} />{match.status === 'ambiguous' && <div className="error">NCC có thể trùng: {(match.candidates || []).map((x) => x.name).join(', ')}</div>}</td>
          <td><SupplierSelect minWidth={150} value={row.supplier_id || ''} onChange={(value) => updateRow(file.key, index, { supplier_id: value, add_supplier: false })} /><label className="muted" style={{ display: 'block', marginTop: 4 }}><input type="checkbox" checked={!!row.add_supplier} disabled={!!row.supplier_id || !String(row.supplier_name || '').trim()} onChange={(e) => updateRow(file.key, index, { add_supplier: e.target.checked })} /> Thêm NCC này khi áp dụng</label></td>
          {orderItems.length > 0 && <td><select value={row.target_item_id || ''} onChange={(e) => updateRow(file.key, index, { target_item_id: e.target.value })}><option value="">Thêm dòng mới</option>{orderItems.map((item) => <option key={item.id} value={item.id}>Cập nhật: {item.item_name}</option>)}</select></td>}
          <td>{warnings.length ? <span className="error">{[...new Set(warnings)].join('; ')}</span> : <span style={{ color: '#16803c' }}>Đủ dữ liệu</span>}<div className="muted">{typeof row.raw === 'string' ? row.raw : row.raw?.sheet ? `${row.raw.sheet} dòng ${row.raw.row || ''}` : ''}</div></td><td><button className="btn-sm btn-danger" onClick={() => updateFile(file.key, { items: file.items.filter((_, i) => i !== index) })}>×</button></td>
        </tr>; })}</tbody></table></div>}
      {file.status === 'success' && <button className="btn-sm" style={{ marginTop: 8 }} onClick={() => updateFile(file.key, { items: [...file.items, blank(file)] })}>+ Thêm dòng</button>}
    </div>)}
    {files.some((file) => file.status === 'success') && <button className="btn-primary" style={{ marginTop: 12 }} disabled={busy} onClick={apply}>Áp dụng các dòng đã chọn</button>}
    {error && <div className="error" style={{ marginTop: 8 }}>{error}</div>}
  </div>;
}
