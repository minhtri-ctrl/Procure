import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { refreshSuppliers } from '../components/SupplierSelect.jsx';

const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024;
const dataColumns = ['source_row', 'order_code', 'order_line_no', 'order_line_count', 'item_name', 'quantity', 'unit_price', 'vat_rate', 'supplier_name', 'loai_hh', 'request_date', 'expected_date'];
const dataLabels = { source_row: 'Dòng', order_code: 'Mã đơn', item_name: 'Tên hàng', quantity: 'SL', unit_price: 'Đơn giá', vat_rate: 'VAT', supplier_name: 'NCC', loai_hh: 'Loại hàng', request_date: 'Ngày YC', expected_date: 'Ngày nhận' };

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc file Excel. Hãy chọn lại file và thử lại.'));
    reader.onload = () => resolve(String(reader.result || '').split(',')[1] || '');
    reader.readAsDataURL(file);
  });
}

function value(row, column) { return String(row?.[column] ?? ''); }

export default function ImportData() {
  const [file, setFile] = useState(null); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [preview, setPreview] = useState(null); const [batches, setBatches] = useState([]); const [message, setMessage] = useState(''); const [activeSheet, setActiveSheet] = useState('DATA');
  const loadHistory = async () => { try { setBatches((await api.get('/import/batches')).data || []); } catch { /* non-critical */ } };
  useEffect(() => { loadHistory(); }, []);
  const issues = useMemo(() => preview?.rows?.flatMap((row) => row.issues?.map((issue) => ({ row: row.source_row, ...issue })) || []) || [], [preview]);
  const blockingIssues = useMemo(() => issues.filter((item) => item.severity === 'error'), [issues]);
  const warnings = useMemo(() => issues.filter((item) => item.severity === 'warning'), [issues]);
  const current = preview?.sheet_previews?.[activeSheet] || { headers: [], rows: [] };
  const displayColumns = activeSheet === 'DATA' ? dataColumns : ['source_row', ...(current.headers || [])];
  const choose = (event) => { setFile(event.target.files?.[0] || null); setPreview(null); setError(''); setMessage(''); setActiveSheet('DATA'); };
  const inspect = async () => {
    if (!file) return; setBusy(true); setError(''); setMessage('');
    try {
      if (file.size > MAX_IMPORT_FILE_BYTES) throw new Error('File Excel vượt quá 10 MB. Hãy tối ưu hoặc tách file trước khi nhập.');
      const fileBase64 = await readFileAsBase64(file);
      if (!fileBase64) throw new Error('File Excel rỗng hoặc không thể mã hóa.');
      setPreview(await api.post('/import/preview', { fileBase64, filename: file.name }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const commit = async () => { if (!preview) return; setBusy(true); setError(''); try { const result = await api.post(`/import/batches/${preview.batch_id}/commit`, {}); setMessage(`Đã nhập ${result.summary.created_orders} đơn, ${result.summary.created_items} dòng hàng; bổ sung ${result.summary.created_suppliers} NCC và ${result.summary.created_categories} danh mục mới; bỏ qua ${result.summary.skipped_orders} đơn đã tồn tại.`); refreshSuppliers(); loadHistory(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  const rollback = async (id) => { if (!window.confirm('Rollback sẽ xóa mềm các đơn được tạo từ batch này. Tiếp tục?')) return; setBusy(true); try { const result = await api.post(`/import/batches/${id}/rollback`, {}); setMessage(`Đã rollback ${result.rolled_back_orders} đơn.`); loadHistory(); } catch (e) { setError(e.message); } finally { setBusy(false); } };
  return <><div className="topbar"><h1>Nhập dữ liệu</h1></div><div className="content">
    <div className="card"><h3>1. Tải và kiểm tra file</h3><p className="muted">Hỗ trợ Excel .xlsx/.xls có sheet DATA, NCC, DM_SP. Dòng 2 của DATA là header kỹ thuật; dữ liệu chỉ được ghi sau khi bạn xác nhận.</p><div className="row"><input type="file" accept=".xlsx,.xls" onChange={choose} disabled={busy} /><button className="btn-primary" disabled={!file || busy} onClick={inspect}>{busy ? 'Đang kiểm tra…' : 'Đọc & kiểm tra file'}</button></div>{file && <div className="muted" style={{ marginTop: 8 }}>Đã chọn: {file.name}</div>}</div>
    {error && <div className="error">{error}</div>}{message && <div style={{ color: 'var(--green)', margin: '10px 0' }}>✓ {message}</div>}
    {preview && <><div className="card"><h3>2. Mapping và tổng quan</h3><p className="muted">Đã đọc đầy đủ toàn bộ các dòng của cả 3 sheet. DATA tạo đơn/dòng hàng; NCC bổ sung thông tin NCC còn trống, DM_SP bổ sung danh mục và aliases. Dữ liệu đã có trong hệ thống không bị ghi đè.</p><div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))' }}>{Object.entries(preview.summary || {}).map(([k, v]) => <div className="field" key={k}><label>{k.replaceAll('_', ' ')}</label><strong>{v}</strong></div>)}</div></div>
      <div className="card"><h3>3. Kiểm tra tất cả sheet</h3>{blockingIssues.length > 0 && <div className="error">Có {blockingIssues.length} lỗi chặn nhập trong toàn bộ file. Hãy sửa các dòng được nêu trước khi xác nhận.</div>}{warnings.length > 0 && <div className="muted" style={{ color: '#92400e', marginBottom: 8 }}>Có {warnings.length} cảnh báo; không chặn nhập. Hệ thống vẫn giữ từng dòng và tự tính lại tổng tiền khi cần.</div>}<div className="row" style={{ marginBottom: 10, flexWrap: 'wrap' }}>{(preview.sheets || []).map((sheet) => <button type="button" key={sheet} className={activeSheet === sheet ? 'btn-primary' : 'btn-sm'} onClick={() => setActiveSheet(sheet)}>{sheet} ({preview.sheet_previews?.[sheet]?.rows?.length || 0} dòng)</button>)}</div><p className="muted">Đang hiển thị đầy đủ {current.rows?.length || 0} dòng của sheet {activeSheet}; không có giới hạn 250 dòng.</p><div className="table-wrap"><table><thead><tr>{displayColumns.map((column) => <th key={column}>{dataLabels[column] || column}</th>)}{activeSheet === 'DATA' && <th>Kiểm tra</th>}</tr></thead><tbody>{current.rows?.map((row, index) => <tr key={`${activeSheet}-${row.source_row || index}`} style={{ background: row.issues?.some((x) => x.severity === 'error') ? '#fff1f2' : undefined }}>{displayColumns.map((column) => <td key={column}>{value(row, column)}</td>)}{activeSheet === 'DATA' && <td>{row.issues?.map((item, i) => <div key={i} className={item.severity === 'error' ? 'error' : 'muted'}>{item.field}: {item.message}</div>)}</td>}</tr>)}</tbody></table></div><button className="btn-primary" disabled={busy || preview.summary?.error_rows > 0} onClick={commit}>{busy ? 'Đang ghi an toàn…' : '4. Xác nhận ghi vào hệ thống'}</button>{preview.summary?.error_rows > 0 && <span className="error"> Cần xử lý các dòng lỗi trước khi nhập.</span>}</div></>}
    <div className="card"><h3>Lịch sử import</h3><div className="table-wrap"><table><thead><tr><th>Batch</th><th>File</th><th>Trạng thái</th><th>Người tạo</th><th>Thời điểm</th><th /></tr></thead><tbody>{batches.map((batch) => <tr key={batch.id}><td>#{batch.id}</td><td>{batch.filename}</td><td><span className="badge">{batch.status}</span></td><td>{batch.created_by}</td><td>{String(batch.created_at || '').slice(0, 19)}</td><td>{batch.status === 'committed' && <button className="btn-danger btn-sm" disabled={busy} onClick={() => rollback(batch.id)}>Rollback</button>}</td></tr>)}{!batches.length && <tr><td colSpan="6" className="muted">Chưa có lịch sử import.</td></tr>}</tbody></table></div></div>
  </div></>;
}
