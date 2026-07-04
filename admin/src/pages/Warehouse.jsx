import { useEffect, useState } from 'react';
import { api, fmtVND, fmtDate, getToken } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';

export default function Warehouse() {
  const { user } = useAuth();
  const canWrite = ['admin', 'purchasing', 'warehouse'].includes(user.role);
  const [tab, setTab] = useState('stock');
  const [stock, setStock] = useState([]);
  const [moves, setMoves] = useState([]);
  const [vouchers, setVouchers] = useState([]);
  const [q, setQ] = useState('');
  const [voucher, setVoucher] = useState(null); // 'PNK' | 'PXK' | null
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [wiping, setWiping] = useState(false);

  const load = () => {
    setErr('');
    if (tab === 'stock') api.get(`/warehouse/stock?q=${encodeURIComponent(q)}`).then((r) => setStock(r.data)).catch((e) => setErr(e.message));
    else if (tab === 'vouchers') api.get('/warehouse/vouchers').then((r) => setVouchers(r.data)).catch((e) => setErr(e.message));
    else api.get(`/warehouse/moves?q=${encodeURIComponent(q)}`).then((r) => setMoves(r.data)).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, [tab, q]);

  const rebuild = async () => { await api.post('/warehouse/rebuild'); setMsg('Đã dựng lại tồn kho'); load(); setTimeout(() => setMsg(''), 3000); };
  const download = async (format) => {
    const res = await fetch(`/api/warehouse/export?format=${format}`, { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob(); const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `procureos-kho.${format === 'csv' ? 'csv' : 'xlsx'}`; a.click(); URL.revokeObjectURL(url);
  };
  const onImport = (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = async () => {
      setErr(''); setMsg('Đang nhập tồn kho…');
      try { const r = await api.post('/warehouse/import', { fileBase64: String(rd.result).split(',')[1] }); setMsg(`Đã nhập ${r.imported} dòng tồn kho`); load(); }
      catch (e2) { setErr(e2.message); setMsg(''); }
    };
    rd.readAsDataURL(f);
    e.target.value = '';
  };
  const printVoucher = (v) => {
    const w = window.open('', '_blank');
    fetch(`/api/warehouse/vouchers/${encodeURIComponent(v.voucher_no)}/print`, { headers: { Authorization: `Bearer ${getToken()}` } })
      .then((r) => r.text()).then((html) => { w.document.write(html); w.document.close(); });
  };
  const deleteVoucher = async (v) => {
    if (!confirm(`Xoá phiếu ${v.voucher_no} (${v.line_count} dòng)? Sẽ dựng lại tồn kho sau khi xoá.`)) return;
    try { await api.del(`/warehouse/vouchers/${encodeURIComponent(v.voucher_no)}`); load(); }
    catch (e) { setErr(e.message); }
  };
  const wipeAll = async () => {
    if (!confirm('XOÁ TOÀN BỘ dữ liệu Sổ Xuất-Nhập-Tồn và Tồn kho (dữ liệu test)? Không thể khôi phục.')) return;
    if (prompt('Gõ "XOA TOAN BO" để xác nhận:') !== 'XOA TOAN BO') return;
    setWiping(true); setErr('');
    try { await api.del('/warehouse/all', { confirm: true }); setMsg('Đã xoá toàn bộ dữ liệu kho'); load(); }
    catch (e) { setErr(e.message); } finally { setWiping(false); }
  };

  return (
    <>
      <div className="topbar">
        <h1>Kho hàng</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => download('xlsx')}>⬇ Excel</button>
          <button onClick={() => download('csv')}>⬇ CSV</button>
          {canWrite && <>
            <label className="btn btn-sm" style={{ cursor: 'pointer' }}>⬆️ Import tồn cũ
              <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={onImport} />
            </label>
            <button className="btn-primary" onClick={() => setVoucher('PNK')}>+ Nhập kho (PNK)</button>
            <button onClick={() => setVoucher('PXK')}>− Xuất kho (PXK)</button>
            <button onClick={rebuild}>↻ Dựng lại tồn</button>
          </>}
          {user.role === 'admin' && <button className="btn-danger" onClick={wipeAll} disabled={wiping}>{wiping ? 'Đang xoá…' : '🗑 Xoá toàn bộ (test)'}</button>}
        </div>
      </div>
      <div className="content">
        <div className="toolbar">
          <button className={tab === 'stock' ? 'btn-primary' : ''} onClick={() => setTab('stock')}>Tồn kho</button>
          <button className={tab === 'vouchers' ? 'btn-primary' : ''} onClick={() => setTab('vouchers')}>Phiếu kho (PNK/PXK)</button>
          <button className={tab === 'moves' ? 'btn-primary' : ''} onClick={() => setTab('moves')}>Sổ Xuất–Nhập–Tồn</button>
          <div className="spacer" />
          {tab !== 'vouchers' && <input className="search" placeholder="Tìm SKU / tên hàng…" value={q} onChange={(e) => setQ(e.target.value)} />}
        </div>
        {msg && <div style={{ color: 'var(--green)', marginBottom: 10 }}>{msg}</div>}
        {err && <div className="error">{err}</div>}

        {tab === 'stock' ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>SKU</th><th>Tên hàng</th><th>Kho</th><th>ĐVT</th><th>Nhập</th><th>Xuất</th><th>Tồn</th><th>Đơn giá</th><th>Giá trị tồn</th></tr></thead>
              <tbody>
                {stock.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.sku}</strong></td><td>{s.item_name}</td><td>{s.warehouse || '-'}</td><td>{s.unit || '-'}</td>
                    <td className="r">{s.qty_in}</td><td className="r">{s.qty_out}</td><td className="r"><strong>{s.qty_on_hand}</strong></td>
                    <td className="r">{fmtVND(s.unit_price)}</td><td className="r">{fmtVND(s.total_value)}</td>
                  </tr>
                ))}
                {!stock.length && <tr><td colSpan={9} className="center-msg">Chưa có tồn kho</td></tr>}
              </tbody>
            </table>
          </div>
        ) : tab === 'vouchers' ? (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Số CT</th><th>Loại</th><th>Ngày</th><th>Kho</th><th>Người phụ trách</th><th>Số dòng</th><th>Tổng SL</th><th></th></tr></thead>
              <tbody>
                {vouchers.map((v) => (
                  <tr key={v.voucher_no}>
                    <td><strong>{v.voucher_no}</strong></td>
                    <td><span className={`badge ${v.move_type === 'PNK' ? 'b-received' : 'b-ordered'}`}>{v.move_type}</span></td>
                    <td>{fmtDate(v.move_date)}</td><td>{v.warehouse || '-'}</td><td>{v.handler_name || '-'}</td>
                    <td className="r">{v.line_count}</td><td className="r">{v.total_qty}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn-sm" onClick={() => printVoucher(v)}>🖨 In phiếu</button>{' '}
                      {canWrite && <button className="btn-sm btn-danger" onClick={() => deleteVoucher(v)}>Xoá</button>}
                    </td>
                  </tr>
                ))}
                {!vouchers.length && <tr><td colSpan={8} className="center-msg">Chưa có phiếu</td></tr>}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ngày</th><th>Số CT</th><th>Loại</th><th>SKU</th><th>Tên hàng</th><th>Nhập</th><th>Xuất</th><th>Tồn</th><th>Đơn giá</th></tr></thead>
              <tbody>
                {moves.map((m) => (
                  <tr key={m.id}>
                    <td>{fmtDate(m.move_date)}</td><td><strong>{m.voucher_no}</strong></td>
                    <td><span className={`badge ${m.move_type === 'PNK' ? 'b-received' : 'b-ordered'}`}>{m.move_type}</span></td>
                    <td>{m.sku}</td><td>{m.item_name}</td>
                    <td className="r">{m.qty_in || ''}</td><td className="r">{m.qty_out || ''}</td>
                    <td className="r"><strong>{m.running_balance}</strong></td><td className="r">{fmtVND(m.unit_price)}</td>
                  </tr>
                ))}
                {!moves.length && <tr><td colSpan={9} className="center-msg">Chưa có giao dịch</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {voucher && <VoucherForm type={voucher} onClose={() => setVoucher(null)} onSaved={() => { setVoucher(null); load(); }} />}
    </>
  );
}

function VoucherForm({ type, onClose, onSaved }) {
  const [skus, setSkus] = useState([]);
  const [warehouse, setWarehouse] = useState('KHO_1');
  const [handlerName, setHandlerName] = useState('');
  const [reason, setReason] = useState('');
  const [qdnb, setQdnb] = useState('');
  const [ticket, setTicket] = useState('');
  const [lines, setLines] = useState([{ sku: '', item_name: '', unit: '', qty: 1, price: 0, vat: 0.08, so_pr: '' }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.get(`/warehouse/skus?type=${type}`).then((r) => setSkus(r.data)); }, [type]);

  const setLine = (i, patch) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const pickSku = (i, sku) => {
    const s = skus.find((x) => x.sku === sku);
    if (s) setLine(i, { sku: s.sku, item_name: s.name, unit: s.unit, price: s.price, vat: s.vat, qty: type === 'PXK' ? (s.qtyDefault || 1) : 1, supplier_id: s.supplier_id });
    else setLine(i, { sku });
  };
  const addLine = () => setLines([...lines, { sku: '', item_name: '', unit: '', qty: 1, price: 0, vat: 0.08, so_pr: '' }]);
  const rmLine = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true); setErr('');
    try {
      const payload = {
        type, warehouse, handler_name: handlerName || undefined, note: reason || undefined,
        lines: lines.filter((l) => l.sku).map((l) => (type === 'PNK' ? { ...l, qdnb } : l)),
      };
      if (type === 'PXK') { payload.pxk_qdnb = qdnb; payload.pxk_ticket = ticket; }
      await api.post('/warehouse/vouchers', payload);
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={type === 'PNK' ? 'Phiếu nhập kho (PNK)' : 'Phiếu xuất kho (PXK)'} onClose={onClose} onSubmit={save} busy={busy} submitLabel="Ghi phiếu">
      <div className="row">
        <div className="field"><label>Kho</label><input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} /></div>
        <div className="field"><label>{type === 'PNK' ? 'Người yêu cầu' : 'Người nhận hàng'}</label><input value={handlerName} onChange={(e) => setHandlerName(e.target.value)} /></div>
      </div>
      <div className="field"><label>Lý do {type === 'PNK' ? 'nhập' : 'xuất'} kho</label><input value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="row">
        <div className="field"><label>Số QĐNB / TBKM</label><input value={qdnb} onChange={(e) => setQdnb(e.target.value)} /></div>
        {type === 'PXK' && <div className="field"><label>Số ticket xuất kho</label><input value={ticket} onChange={(e) => setTicket(e.target.value)} /></div>}
      </div>
      <label>Danh sách hàng</label>
      {lines.map((l, i) => (
        <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div className="row" style={{ marginBottom: 6 }}>
            <select value={l.sku} onChange={(e) => pickSku(i, e.target.value)}>
              <option value="">-- chọn SKU --</option>
              {skus.map((s) => <option key={s.sku} value={s.sku}>{s.sku} — {s.name}{type === 'PXK' ? ` (tồn ${s.qtyDefault})` : ''}</option>)}
            </select>
            <button type="button" className="btn-sm btn-danger" onClick={() => rmLine(i)}>×</button>
          </div>
          <div className="row">
            <input placeholder="ĐVT" value={l.unit || ''} onChange={(e) => setLine(i, { unit: e.target.value })} />
            <input placeholder="PR/PO" value={l.so_pr || ''} onChange={(e) => setLine(i, { so_pr: e.target.value })} />
            <input placeholder="SL" type="number" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} />
            <input placeholder="Đơn giá" type="number" value={l.price} onChange={(e) => setLine(i, { price: e.target.value })} />
          </div>
        </div>
      ))}
      <button type="button" className="btn-sm" onClick={addLine}>+ Thêm dòng</button>
      {err && <div className="error">{err}</div>}
    </Modal>
  );
}
