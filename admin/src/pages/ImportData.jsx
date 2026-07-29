import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { refreshSuppliers } from '../components/SupplierSelect.jsx';

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc file Excel. Hãy chọn lại file và thử lại.'));
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.readAsDataURL(file);
  });
}

const columns = ['source_row', 'order_code', 'item_name', 'quantity', 'unit_price', 'vat_rate', 'supplier_name', 'loai_hh', 'request_date', 'expected_date'];
const label = { source_row: 'Dòng', order_code: 'Mã đơn', item_name: 'Tên hàng', quantity: 'SL', unit_price: 'Đơn giá', vat_rate: 'VAT', supplier_name: 'NCC', loai_hh: 'Loại hàng', request_date: 'Ngày YC', expected_date: 'Ngày nhận' };

export default function ImportData() {
  const [file, setFile] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); const [batches, setBatches] = useState([]); const [message, setMessage] = useState('');
  const loadHistory = async () => { try { setBatches((await api.get('/import/batches')).data || []); } catch { /* import history is non-critical */ } };
  useEffect(() => { loadHistory(); }, []);
  const issues = useMemo(() => preview?.rows?.flatMap((row) => row.issues?.map((issue) => ({ row: row.source_row, ...issue })) || []) || [], [preview]);
  const choose = (event) => { setFile(event.target.files?.[0] || null); setPreview(null); setError(''); setMessage(''); };
  const inspect = async () => {
    if (!file) return; setBusy(true); setError(''); setMessage('');
    try {
      if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error('File Excel vượt quá 10 MB. Hãy tối ưu hoặc tách file trước khi nhập.');
      const b64 = await readFileAsBase64(file);
      if (!b64) throw new Error('File Excel rỗng hoặc không thể mã hóa.');
      setPreview(await api.post('/import/preview', { fileBase64: b64, filename: file.name }));
    }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const commit = async () => { if (!preview) return; setBusy(true); setError(''); try { const result = await api.post(`/import/batches/${preview.batch_id}/commit`, {}); setMessage(`Đã nhập ${result.summary.created_orders} đơn và ${result.summary.created_items} dòng hàng; bỏ qua ${result.summary.skipped_orders} đơn đã tồn tại.`); refreshSuppliers(); loadHistory(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const rollback = async (id) => { if (!window.confirm('Rollback sẽ xóa mềm các đơn được tạo từ batch này. Tiếp tục?')) return; setBusy(true); try { const result = await api.post(`/import/batches/${id}/rollback`, {}); setMessage(`Đã rollback ${result.rolled_back_orders} đơn.`); loadHistory(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <><div className="topbar"><h1>Nhập dữ liệu</h1></div><div className="content">
    <div className="card"><h3>1. Tải và kiểm tra file</h3><p className="muted">Hỗ trợ Excel .xlsx/.xls có sheet DATA, NCC, DM_SP. Hệ dùng hàng 2 của DATA làm header kỹ thuật; chưa có dữ liệu nào được ghi trước khi xác nhận.</p><div className="row"><input type="file" accept=".xlsx,.xls" onChange={choose} disabled={busy} /><button className="btn-primary" disabled={!file || busy} onClick={inspect}>{busy ? 'Đang kiểm tra…' : 'Đọc & kiểm tra file'}</button></div>{file && <div className="muted" style={{ marginTop: 8 }}>Đã chọn: {file.name}</div>}</div>
    {error && <div className="error">{error}</div>}{message && <div style={{ color: 'var(--green)', margin: '10px 0' }}>✓ {message}</div>}
    {preview && <><div className="card"><h3>2. Mapping và tổng quan</h3><p className="muted">Header phát hiện: {preview.headers?.join(', ')}</p><div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))' }}>{Object.entries(preview.summary || {}).map(([k, v]) => <div className="field" key={k}><label>{k.replaceAll('_', ' ')}</label><strong>{v}</strong></div>)}</div><p className="muted">Mapping mặc định: MA_DH → Mã đơn, TEN_HANG → Tên hàng, SO_LUONG → Số lượng, DON_GIA → Đơn giá, VAT → VAT, NCC → Nhà cung cấp. File không khớp header cần được chuẩn hóa theo mẫu trước khi xác nhận.</p></div>
      <div className="card"><h3>3. Preview và lỗi dữ liệu</h3>{issues.length > 0 && <div className="error">Có {issues.length} lỗi/cảnh báo trong 250 dòng đầu. Dòng lỗi chặn nhập; cảnh báo vẫn có thể nhập.</div>}<div className="table-wrap"><table><thead><tr>{columns.map((c) => <th key={c}>{label[c]}</th>)}<th>Kiểm tra</th></tr></thead><tbody>{preview.rows?.map((row) => <tr key={row.source_row} style={{ background: row.issues?.some((x) => x.severity === 'error') ? '#fff1f2' : undefined }}>{columns.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}<td>{row.issues?.map((x, i) => <div key={i} className={x.severity === 'error' ? 'error' : 'muted'}>{x.field}: {x.message}</div>)}</td></tr>)}</tbody></table></div><p className="muted">Preview hiển thị tối đa 250 dòng; batch lưu đầy đủ để kiểm tra/audit.</p><button className="btn-primary" disabled={busy || preview.summary?.error_rows > 0} onClick={commit}>{busy ? 'Đang ghi an toàn…' : '4. Xác nhận ghi vào hệ thống'}</button>{preview.summary?.error_rows > 0 && <span className="error"> Sửa các dòng lỗi trong file rồi kiểm tra lại trước khi nhập.</span>}</div></>}
    <div className="card"><h3>Lịch sử import</h3><div className="table-wrap"><table><thead><tr><th>Batch</th><th>File</th><th>Trạng thái</th><th>Người tạo</th><th>Thời điểm</th><th /></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td>#{batch.id}</td><td>{batch.filename}</td><td><span className="badge">{batch.status}</span></td><td>{batch.created_by}</td><td>{String(batch.created_at || '').slice(0, 19)}</td><td>{batch.status === 'committed' && <button className="btn-danger btn-sm" disabled={busy} onClick={() => rollback(batch.id)}>Rollback</button>}</td></tr>)}{!batches.length && <tr><td colSpan="6" className="muted">Chưa có lịch sử import.</td></tr>}</tbody></table></div></div>
  </div></>;
}
