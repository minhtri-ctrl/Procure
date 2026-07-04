import { useEffect, useState } from 'react';
import { api, fmtVND, fmtDate } from '../api.js';
import { useAuth } from '../auth.jsx';
import Modal from '../components/Modal.jsx';

export default function Warehouse() {
  const { user } = useAuth();
  const canWrite = ['admin', 'purchasing', 'warehouse'].includes(user.role);
  const [tab, setTab] = useState('stock');
  const [stock, setStock] = useState([]);
  const [moves, setMoves] = useState([]);
  const [q, setQ] = useState('');
  const [voucher, setVoucher] = useState(null); // 'PNK' | 'PXK' | null
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');

  const load = () => {
    setErr('');
    if (tab === 'stock') api.get(`/warehouse/stock?q=${encodeURIComponent(q)}`).then((r) => setStock(r.data)).catch((e) => setErr(e.message));
    else api.get(`/warehouse/moves?q=${encodeURIComponent(q)}`).then((r) => setMoves(r.data)).catch((e) => setErr(e.message));
  };
  useEffect(() => { load(); }, [tab, q]);

  const rebuild = async () => { await api.post('/warehouse/rebuild'); setMsg('Đã dựng lại tồn kho'); load(); setTimeout(() => setMsg(''), 3000); };

  return (
    <>
      <div className="topbar">
        <h1>Kho hàng</h1>
        {canWrite && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" onClick={() => setVoucher('PNK')}>+ Nhập kho (PNK)</button>
            <button onClick={() => setVoucher('PXK')}>− Xuất kho (PXK)</button>
            <button onClick={rebuild}>↻ Dựng lại tồn</button>
          </div>
        )}
      </div>
      <div className="content">
        <div className="toolbar">
          <button className={tab === 'stock' ? 'btn-primary' : ''} onClick={() => setTab('stock')}>Tồn kho</button>
          <button className={tab === 'moves' ? 'btn-primary' : ''} onClick={() => setTab('moves')}>Sổ Xuất–Nhập–Tồn</button>
          <div className="spacer" />
          <input className="search" placeholder="Tìm SKU / tên hàng…" value={q} onChange={(e) => setQ(e.target.value)} />
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
  const [lines, setLines] = useState([{ sku: '', item_name: '', unit: '', qty: 1, price: 0, vat: 0.08 }]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => { api.get(`/warehouse/skus?type=${type}`).then((r) => setSkus(r.data)); }, [type]);

  const setLine = (i, patch) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const pickSku = (i, sku) => {
    const s = skus.find((x) => x.sku === sku);
    if (s) setLine(i, { sku: s.sku, item_name: s.name, unit: s.unit, price: s.price, vat: s.vat, qty: type === 'PXK' ? (s.qtyDefault || 1) : 1, supplier_id: s.supplier_id });
    else setLine(i, { sku });
  };
  const addLine = () => setLines([...lines, { sku: '', item_name: '', unit: '', qty: 1, price: 0, vat: 0.08 }]);
  const rmLine = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const save = async () => {
    setBusy(true); setErr('');
    try {
      await api.post('/warehouse/vouchers', { type, warehouse, lines: lines.filter((l) => l.sku) });
      onSaved();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title={type === 'PNK' ? 'Phiếu nhập kho (PNK)' : 'Phiếu xuất kho (PXK)'} onClose={onClose} onSubmit={save} busy={busy} submitLabel="Ghi phiếu">
      <div className="field"><label>Kho</label><input value={warehouse} onChange={(e) => setWarehouse(e.target.value)} /></div>
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
