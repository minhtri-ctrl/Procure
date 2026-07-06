import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import { refreshSuppliers } from '../components/SupplierSelect.jsx';

// Endpoint dùng chung với SupplierSelect: sau khi CRUD/import NCC ở đây,
// phải xoá cache module của SupplierSelect để mọi ô chọn NCC khác load lại dữ liệu mới.
function invalidateSupplierCache(endpoint) {
  if (endpoint === '/suppliers') refreshSuppliers();
}

// Trang CRUD dùng chung cho các danh mục đơn giản.
export default function CrudPage({ title, endpoint, columns, fields, canWrite = true, importEndpoint }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // object | null
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importErr, setImportErr] = useState('');

  const load = useCallback(() => {
    api.get(`${endpoint}?q=${encodeURIComponent(q)}&limit=200`).then((r) => setRows(r.data || r)).catch((e) => setErr(e.message));
  }, [endpoint, q]);
  useEffect(() => { load(); }, [load]);

  const openNew = () => { setForm({}); setEditing({}); };
  const openEdit = (row) => { setForm({ ...row }); setEditing(row); };

  const save = async () => {
    setBusy(true); setErr('');
    try {
      if (editing.id) await api.put(`${endpoint}/${editing.id}`, form);
      else await api.post(endpoint, form);
      invalidateSupplierCache(endpoint);
      setEditing(null); load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (row) => {
    if (!confirm(`Xoá "${row[columns[0].key]}"?`)) return;
    await api.del(`${endpoint}/${row.id}`);
    invalidateSupplierCache(endpoint);
    load();
  };

  const onImportFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportErr(''); setImportResult(null);
    const rd = new FileReader();
    rd.onload = async () => {
      const b64 = String(rd.result).split(',')[1];
      setImportBusy(true);
      try { setImportResult(await api.post(importEndpoint, { fileBase64: b64 })); invalidateSupplierCache(endpoint); load(); }
      catch (e2) { setImportErr(e2.message); } finally { setImportBusy(false); }
    };
    rd.readAsDataURL(f);
    e.target.value = '';
  };

  return (
    <>
      <div className="topbar"><h1>{title}</h1></div>
      <div className="content">
        <div className="toolbar">
          <input className="search" placeholder="Tìm kiếm…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="spacer" />
          {canWrite && importEndpoint && (
            <label className="btn-sm" style={{ cursor: 'pointer' }}>
              {importBusy ? 'Đang nhập…' : '📥 Nhập Excel'}
              <input type="file" accept=".xlsx,.xls" onChange={onImportFile} disabled={importBusy} style={{ display: 'none' }} />
            </label>
          )}
          {canWrite && <button className="btn-primary" onClick={openNew}>+ Thêm mới</button>}
        </div>
        {importErr && <div className="error">{importErr}</div>}
        {importResult && (
          <div style={{ color: 'var(--green)', marginBottom: 10 }}>
            ✅ Đã nhập: {importResult.created} mới, {importResult.updated} cập nhật (tổng {importResult.total}).
            {importResult.errors?.length > 0 && <> Lỗi: {importResult.errors.join('; ')}</>}
          </div>
        )}
        {err && <div className="error">{err}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}{canWrite && <th></th>}</tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c) => <td key={c.key}>{row[c.key] ?? ''}</td>)}
                  {canWrite && (
                    <td>
                      <button className="btn-sm" onClick={() => openEdit(row)}>Sửa</button>{' '}
                      <button className="btn-sm btn-danger" onClick={() => remove(row)}>Xoá</button>
                    </td>
                  )}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={columns.length + 1} className="center-msg">Không có dữ liệu</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? `Sửa ${title}` : `Thêm ${title}`} onClose={() => setEditing(null)} onSubmit={save} busy={busy}>
          {fields.map((f) => (
            <div className="field" key={f.key}>
              <label>{f.label}{f.required && ' *'}</label>
              <input
                type={f.type || 'text'}
                value={form[f.key] ?? ''}
                required={f.required}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
            </div>
          ))}
          {err && <div className="error">{err}</div>}
        </Modal>
      )}
    </>
  );
}
