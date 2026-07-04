import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtVND } from '../api.js';
import { useMeta } from '../meta.jsx';
import { useAuth } from '../auth.jsx';
import { LOAI_HH, DIEM_NHAN, HANG_MUC } from '../constants.js';

const emptyLine = () => ({
  loai_hh: 'Vật phẩm', item_name: '', description: '', quantity: 1, unit_price: 0, vatPct: 8,
  unit: 'cái', design_link: '', note: '', so_pr: '', supplier_id: '', master_contract: '',
});

export default function CreateOrder() {
  const nav = useNavigate();
  const { user } = useAuth();
  const { states } = useMeta();
  const [teams, setTeams] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [diemCustom, setDiemCustom] = useState(false);
  const [header, setHeader] = useState({
    status: 'new', receiving_point: '', request_date: '', expected_date: '',
    requester_email: user.email, requester_name: user.name, team_id: '', project_name: '',
    hang_muc: 'Mua sắm / sản xuất', pm: '',
  });
  const [lines, setLines] = useState([emptyLine()]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.get('/teams?limit=200').then((r) => setTeams(r.data));
    api.get('/suppliers?limit=500').then((r) => setSuppliers(r.data));
  }, []);

  const setH = (k, v) => setHeader({ ...header, [k]: v });
  const setLine = (i, patch) => setLines(lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const pickNcc = (i, sid) => {
    const s = suppliers.find((x) => String(x.id) === String(sid));
    setLine(i, { supplier_id: sid, master_contract: s?.master_contract || '' });
  };
  const addLine = () => setLines([...lines, emptyLine()]);
  const rmLine = (i) => setLines(lines.filter((_, idx) => idx !== i));

  const calc = (l) => {
    const tt = Math.round(Number(l.quantity || 0) * Number(l.unit_price || 0));
    const thue = Math.round(tt * Number(l.vatPct || 0) / 100);
    return { thanhTien: tt, tienThue: thue, tong: tt + thue };
  };
  const grandTotal = lines.reduce((s, l) => s + calc(l).tong, 0);

  const save = async () => {
    setErr('');
    if (!header.team_id) { setErr('Vui lòng chọn Team'); return; }
    const items = lines.filter((l) => l.item_name).map((l) => ({
      loai_hh: l.loai_hh, item_name: l.item_name, description: l.description, unit: l.unit,
      quantity: Number(l.quantity || 0), unit_price: Number(l.unit_price || 0), vat_rate: Number(l.vatPct || 0) / 100,
      design_link: l.design_link, note: l.note, so_pr: l.so_pr,
      supplier_id: l.supplier_id || null, master_contract: l.master_contract,
    }));
    if (!items.length) { setErr('Cần ít nhất 1 dòng hàng có tên'); return; }
    setBusy(true);
    try {
      const r = await api.post('/orders', { ...header, team_id: header.team_id || null, items });
      nav(`/orders/${r.id}`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <div className="topbar"><h1>Tạo đơn mới</h1><button onClick={() => nav('/orders')}>← Danh sách</button></div>
      <div className="content">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>📋 Thông tin đơn hàng</h3>
          <div className="row">
            <div className="field"><label>MA_DH</label><input value="Tự sinh khi lưu (RQ-TEAM-YY-NNNN)" disabled /></div>
            <div className="field"><label>Tiến trình</label>
              <select value={header.status} onChange={(e) => setH('status', e.target.value)}>
                {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Điểm nhận</label>
              <select value={diemCustom ? '__custom' : header.receiving_point} onChange={(e) => {
                if (e.target.value === '__custom') { setDiemCustom(true); setH('receiving_point', ''); }
                else { setDiemCustom(false); setH('receiving_point', e.target.value); }
              }}>
                <option value="">-- Chọn điểm nhận --</option>
                {DIEM_NHAN.map((d) => <option key={d} value={d}>{d}</option>)}
                <option value="__custom">Khác (nhập thủ công)</option>
              </select>
              {diemCustom && <input style={{ marginTop: 6 }} placeholder="Nhập địa chỉ" value={header.receiving_point} onChange={(e) => setH('receiving_point', e.target.value)} />}
            </div>
          </div>
          <div className="row">
            <div className="field"><label>Ngày YC</label><input type="date" value={header.request_date} onChange={(e) => setH('request_date', e.target.value)} /></div>
            <div className="field"><label>Ngày nhận</label><input type="date" value={header.expected_date} onChange={(e) => setH('expected_date', e.target.value)} /></div>
            <div className="field"><label>Email</label><input type="email" value={header.requester_email} onChange={(e) => setH('requester_email', e.target.value)} /></div>
          </div>
          <div className="row">
            <div className="field"><label>Tên người YC</label><input value={header.requester_name} onChange={(e) => setH('requester_name', e.target.value)} /></div>
            <div className="field"><label>Team *</label>
              <select value={header.team_id} onChange={(e) => setH('team_id', e.target.value)}>
                <option value="">-- Chọn team --</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="field"><label>Tên dự án</label><input value={header.project_name} onChange={(e) => setH('project_name', e.target.value)} /></div>
          </div>
          <div className="row">
            <div className="field"><label>Hạng mục</label>
              <select value={header.hang_muc} onChange={(e) => setH('hang_muc', e.target.value)}>
                {HANG_MUC.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </div>
            <div className="field"><label>PM</label><input value={header.pm} onChange={(e) => setH('pm', e.target.value)} /></div>
            <div className="field" />
          </div>
        </div>

        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0 }}>📦 Chi tiết hàng hóa / dịch vụ</h3>
            <button className="btn-primary btn-sm" onClick={addLine}>+ Thêm dòng</button>
          </div>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead><tr>
                <th>Loại HH</th><th>Tên hàng</th><th>Mô tả</th><th>SL</th><th>Đơn giá</th><th>VAT%</th>
                <th>Tiền thuế</th><th>Thành tiền</th><th>Tổng</th><th>ĐVT</th><th>Thiết kế</th><th>Ghi chú</th>
                <th>Số PR</th><th>NCC</th><th>Master</th><th></th>
              </tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const c = calc(l);
                  return (
                    <tr key={i}>
                      <td><select style={{ minWidth: 120 }} value={l.loai_hh} onChange={(e) => setLine(i, { loai_hh: e.target.value })}>{LOAI_HH.map((x) => <option key={x} value={x}>{x}</option>)}</select></td>
                      <td><input style={{ minWidth: 140 }} value={l.item_name} onChange={(e) => setLine(i, { item_name: e.target.value })} /></td>
                      <td><input style={{ minWidth: 120 }} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td>
                      <td><input type="number" style={{ width: 60 }} value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td>
                      <td><input type="number" style={{ width: 100 }} value={l.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} /></td>
                      <td><input type="number" style={{ width: 55 }} value={l.vatPct} onChange={(e) => setLine(i, { vatPct: e.target.value })} /></td>
                      <td className="r muted">{fmtVND(c.tienThue)}</td>
                      <td className="r muted">{fmtVND(c.thanhTien)}</td>
                      <td className="r"><strong>{fmtVND(c.tong)}</strong></td>
                      <td><input style={{ width: 60 }} value={l.unit} onChange={(e) => setLine(i, { unit: e.target.value })} /></td>
                      <td><input style={{ width: 100 }} placeholder="Link" value={l.design_link} onChange={(e) => setLine(i, { design_link: e.target.value })} /></td>
                      <td><input style={{ width: 100 }} value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} /></td>
                      <td><input style={{ width: 80 }} value={l.so_pr} onChange={(e) => setLine(i, { so_pr: e.target.value })} /></td>
                      <td><select style={{ minWidth: 120 }} value={l.supplier_id} onChange={(e) => pickNcc(i, e.target.value)}>
                        <option value="">-- NCC --</option>
                        {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select></td>
                      <td><input style={{ width: 90 }} value={l.master_contract} onChange={(e) => setLine(i, { master_contract: e.target.value })} /></td>
                      <td><button className="btn-sm btn-danger" onClick={() => rmLine(i)}>×</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
            <div>Tổng cộng: <strong style={{ fontSize: 18 }}>{fmtVND(grandTotal)}</strong></div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setLines([emptyLine()]); }}>Reset dòng</button>
              <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Đang lưu…' : '💾 Lưu đơn hàng'}</button>
            </div>
          </div>
          {err && <div className="error">{err}</div>}
        </div>
      </div>
    </>
  );
}
