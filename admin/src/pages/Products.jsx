import { useEffect, useState } from 'react';
import { api, fmtVND } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';

export default function Products() {
  const { user } = useAuth();
  const canWrite = ['admin', 'purchasing'].includes(user.role);
  const [rows, setRows] = useState([]);
  const [cats, setCats] = useState([]);
  const [sups, setSups] = useState([]);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = () => api.get(`/products?q=${encodeURIComponent(q)}&category_id=${cat}&limit=100`).then((r) => setRows(r.data)).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [q, cat]);
  useEffect(() => {
    api.get('/categories?limit=200').then((r) => setCats(r.data));
    api.get('/suppliers?limit=200').then((r) => setSups(r.data));
  }, []);

  const openNew = () => { setForm({ vat_rate: 0.08 }); setEditing({}); };
  const openEdit = (row) => { setForm({ ...row }); setEditing(row); };
  const save = async () => {
    setBusy(true); setErr('');
    try {
      const payload = { ...form, category_id: form.category_id || null, supplier_id: form.supplier_id || null };
      if (editing.id) await api.put(`/products/${editing.id}`, payload);
      else await api.post('/products', payload);
      setEditing(null); load();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async (row) => { if (confirm(`Xoá "${row.name}"?`)) { await api.del(`/products/${row.id}`); load(); } };

  return (
    <>
      <div className="topbar"><h1>Danh mục sản phẩm</h1></div>
      <div className="content">
        <div className="toolbar">
          <input className="search" placeholder="Tìm SKU / tên…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select style={{ width: 180 }} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">Tất cả loại</option>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="spacer" />
          {canWrite && <button className="btn-primary" onClick={openNew}>+ Thêm sản phẩm</button>}
        </div>
        {err && <div className="error">{err}</div>}
        <div className="table-wrap">
          <table>
            <thead><tr><th>SKU</th><th>Tên</th><th>Loại</th><th>ĐVT</th><th>Đơn giá</th><th>VAT</th><th>NCC</th>{canWrite && <th></th>}</tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.sku}</strong></td>
                  <td>{p.name}</td>
                  <td>{p.category_name || '-'}</td>
                  <td>{p.unit || '-'}</td>
                  <td>{fmtVND(p.default_price)}</td>
                  <td>{(Number(p.vat_rate) * 100).toFixed(0)}%</td>
                  <td>{p.supplier_name || '-'}</td>
                  {canWrite && <td>
                    <button className="btn-sm" onClick={() => openEdit(p)}>Sửa</button>{' '}
                    <button className="btn-sm btn-danger" onClick={() => remove(p)}>Xoá</button>
                  </td>}
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={canWrite ? 8 : 7} className="center-msg">Không có sản phẩm</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <Modal title={editing.id ? 'Sửa sản phẩm' : 'Thêm sản phẩm'} onClose={() => setEditing(null)} onSubmit={save} busy={busy}>
          <div className="row">
            <div className="field"><label>SKU *</label><input required value={form.sku ?? ''} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></div>
            <div className="field"><label>ĐVT</label><input value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></div>
          </div>
          <div className="field"><label>Tên sản phẩm *</label><input required value={form.name ?? ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="field"><label>Mô tả</label><textarea rows={2} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="row">
            <div className="field"><label>Loại hàng</label>
              <select value={form.category_id ?? ''} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">--</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Nhà cung cấp</label>
              <select value={form.supplier_id ?? ''} onChange={(e) => setForm({ ...form, supplier_id: e.target.value })}>
                <option value="">--</option>{sups.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field"><label>Đơn giá</label><input type="number" value={form.default_price ?? ''} onChange={(e) => setForm({ ...form, default_price: e.target.value })} /></div>
            <div className="field"><label>VAT (0.08 = 8%)</label><input type="number" step="0.01" value={form.vat_rate ?? ''} onChange={(e) => setForm({ ...form, vat_rate: e.target.value })} /></div>
          </div>
          {err && <div className="error">{err}</div>}
        </Modal>
      )}
    </>
  );
}
