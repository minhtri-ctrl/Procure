import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtVND } from '../api.js';
import { useMeta } from '../meta.jsx';
import { useAuth } from '../auth.jsx';
import { LOAI_HH, DIEM_NHAN, HANG_MUC } from '../constants.js';
import SupplierSelect from '../components/SupplierSelect.jsx';
import QuotationReview from '../components/QuotationReview.jsx';
import Modal from '../components/Modal.jsx';

let lineSequence = 0;
const nextLineKey = () => `draft-${Date.now()}-${++lineSequence}`;
const emptyLine = () => ({ client_line_key: nextLineKey(), loai_hh: 'Vật phẩm', item_name: '', description: '', quantity: 1, unit_price: 0, vatPct: 8, unit: 'cái', design_link: '', note: '', so_pr: '', supplier_id: '', master_contract: '' });
const isEmptyDraft = (line) => !String(line.item_name || '').trim() && !String(line.description || '').trim()
  && !String(line.design_link || '').trim() && !String(line.note || '').trim() && !String(line.so_pr || '').trim()
  && !String(line.supplier_id || '').trim() && !String(line.master_contract || '').trim();

export default function CreateOrder() {
  const nav = useNavigate(); const { user } = useAuth(); const { states, L } = useMeta();
  const [teams, setTeams] = useState([]); const [diemCustom, setDiemCustom] = useState(false);
  const [header, setHeader] = useState({ status: 'new', receiving_point: '', request_date: '', expected_date: '', requester_email: user.email, requester_name: user.name, team_id: '', project_name: '', hang_muc: 'Mua sắm / sản xuất', pm: '' });
  const [lines, setLines] = useState([emptyLine()]); const [pendingQuotes, setPendingQuotes] = useState([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const [suggestLine, setSuggestLine] = useState(null); const [suggestOpen, setSuggestOpen] = useState(false);
  useEffect(() => { api.get('/teams?limit=200').then((r) => setTeams(r.data || [])); }, []);
  const setH = (key, value) => setHeader({ ...header, [key]: value });
  const setLine = (i, patch) => setLines((old) => old.map((line, index) => index === i ? { ...line, ...patch } : line));
  const calc = (line) => { const amount = Math.round(Number(line.quantity || 0) * Number(line.unit_price || 0)); const tax = Math.round(amount * Number(line.vatPct || 0) / 100); return { amount, tax, total: amount + tax }; };
  const applyQuotes = async (rows) => {
    if (!rows.length) return;
    const additions = rows.map((row) => {
      const line = { ...emptyLine(), item_name: row.item_name, quantity: row.quantity, unit_price: row.unit_price, vatPct: row.vat_percent, supplier_id: row.supplier_id, note: `Nguồn báo giá: ${row.file.filename}` };
      return { row, line };
    });
    // Only discard untouched placeholders. A manual draft is never removed by AI Apply.
    setLines((old) => [...old.filter((line) => !isEmptyDraft(line)), ...additions.map(({ line }) => line)]);
    setPendingQuotes((old) => [...old, ...additions.map(({ row, line }) => ({ client_line_key: line.client_line_key, supplier_id: row.supplier_id, filename: row.file.filename, mime: row.file.mime, data_base64: row.file.data_base64, extraction_batch: row.file.client_id, source_fingerprint: row.file.fingerprint, source_supplier_name: row.supplier_name }))]);
  };
  const save = async () => {
    setErr(''); if (!header.team_id) return setErr('Vui lòng chọn Team');
    const items = lines.filter((line) => line.item_name).map((line) => ({ loai_hh: line.loai_hh, item_name: line.item_name, description: line.description, unit: line.unit, quantity: Number(line.quantity || 0), unit_price: Number(line.unit_price || 0), vat_rate: Number(line.vatPct || 0) / 100, design_link: line.design_link, note: line.note, so_pr: line.so_pr, supplier_id: line.supplier_id || null, master_contract: line.master_contract }));
    if (!items.length) return setErr('Cần ít nhất một dòng hàng có tên');
    setBusy(true);
    try {
      const savedLines = lines.filter((line) => line.item_name);
      const result = await api.post('/orders', { ...header, team_id: header.team_id || null, items });
      const itemIdByLineKey = new Map(savedLines.map((line, index) => [line.client_line_key, result.item_ids?.[index]]));
      const grouped = new Map();
      pendingQuotes.forEach((quote) => {
        const itemId = itemIdByLineKey.get(quote.client_line_key);
        if (!itemId) return;
        const group = grouped.get(quote.source_fingerprint) || { ...quote, links: [] };
        group.links.push({ item_id: itemId, supplier_id: quote.supplier_id, source_supplier_name: quote.source_supplier_name });
        grouped.set(quote.source_fingerprint, group);
      });
      for (const quote of grouped.values()) if (quote.data_base64) await api.post(`/quotation-extractions/orders/${result.id}/attachments`, quote);
      nav(`/orders/${result.id}`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const total = lines.reduce((sum, line) => sum + calc(line).total, 0);
  return <><div className="topbar"><h1>Tạo đơn mới</h1><button onClick={() => nav('/orders')}>← Danh sách</button></div><div className="content">
    <div className="card"><h3 style={{ marginTop: 0 }}>📋 Thông tin đơn hàng</h3>
      <div className="row"><div className="field"><label>MA_DH</label><input value="Tự sinh khi lưu (RQ-TEAM-YY-NNNN)" disabled /></div><div className="field"><label>Tiến trình</label><select value={header.status} onChange={(e) => setH('status', e.target.value)}>{states.map((state) => <option key={state.code} value={state.code}>{state.name}</option>)}</select></div><div className="field"><label>Điểm nhận</label><select value={diemCustom ? '__custom' : header.receiving_point} onChange={(e) => { if (e.target.value === '__custom') { setDiemCustom(true); setH('receiving_point', ''); } else { setDiemCustom(false); setH('receiving_point', e.target.value); } }}><option value="">-- Chọn điểm nhận --</option>{DIEM_NHAN.map((entry) => <option key={entry}>{entry}</option>)}<option value="__custom">Khác</option></select>{diemCustom && <input value={header.receiving_point} onChange={(e) => setH('receiving_point', e.target.value)} />}</div></div>
      <div className="row"><div className="field"><label>Ngày YC</label><input type="date" value={header.request_date} onChange={(e) => setH('request_date', e.target.value)} /></div><div className="field"><label>Ngày nhận</label><input type="date" value={header.expected_date} onChange={(e) => setH('expected_date', e.target.value)} /></div><div className="field"><label>Email</label><input value={header.requester_email} onChange={(e) => setH('requester_email', e.target.value)} /></div></div>
      <div className="row"><div className="field"><label>Tên người YC</label><input value={header.requester_name} onChange={(e) => setH('requester_name', e.target.value)} /></div><div className="field"><label>Team *</label><select value={header.team_id} onChange={(e) => { const team = teams.find((x) => String(x.id) === e.target.value); setHeader({ ...header, team_id: e.target.value, pm: team?.lead_name || header.pm }); }}><option value="">-- Chọn team --</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></div><div className="field"><label>Tên dự án</label><input value={header.project_name} onChange={(e) => setH('project_name', e.target.value)} /></div></div>
      <div className="row"><div className="field"><label>Hạng mục</label><select value={header.hang_muc} onChange={(e) => setH('hang_muc', e.target.value)}>{HANG_MUC.map((entry) => <option key={entry}>{entry}</option>)}</select></div><div className="field"><label>PM</label><input value={header.pm} onChange={(e) => setH('pm', e.target.value)} /></div></div>
    </div>
    <QuotationReview onApply={applyQuotes} />
    <div className="card" style={{ marginTop: 12, padding: 10 }}><label>Đề xuất NCC cho dòng</label><div style={{ display: 'flex', gap: 8 }}><select value={suggestLine ?? ''} onChange={(e) => setSuggestLine(e.target.value === '' ? null : Number(e.target.value))}><option value="">Chọn dòng hàng</option>{lines.map((line, i) => <option key={i} value={i}>{line.item_name || `Dòng ${i + 1}`}</option>)}</select><button className="btn-sm" disabled={suggestLine === null || !lines[suggestLine]?.item_name?.trim()} onClick={() => setSuggestOpen(true)}>✨ Đề xuất NCC</button></div>{suggestLine !== null && !lines[suggestLine]?.item_name?.trim() && <div className="muted">Nhập tên hàng trước khi đề xuất NCC.</div>}</div>
    {suggestOpen && <Suggestions line={lines[suggestLine]} onApply={(s) => { setLine(suggestLine, { supplier_id: s.supplier_id, master_contract: s.evidence?.master_contract || lines[suggestLine].master_contract }); setSuggestOpen(false); }} onClose={() => setSuggestOpen(false)} />}
    <div className="card" style={{ marginTop: 16 }}><div style={{ display: 'flex', justifyContent: 'space-between' }}><h3 style={{ margin: 0 }}>📦 Chi tiết hàng hóa / dịch vụ</h3><button className="btn-primary btn-sm" onClick={() => setLines((old) => [...old, emptyLine()])}>+ Thêm dòng</button></div><div className="table-wrap" style={{ marginTop: 12 }}><table><thead><tr><th>Loại HH</th><th>Tên hàng</th><th>Mô tả</th><th>SL</th><th>Đơn giá</th><th>VAT%</th><th>Tiền thuế</th><th>Thành tiền</th><th>Tổng</th><th>ĐVT</th><th>Thiết kế</th><th>Ghi chú</th><th>Số PR</th><th>NCC</th><th>Master</th><th /></tr></thead><tbody>{lines.map((line, i) => { const value = calc(line); return <tr key={i}><td><select value={line.loai_hh} onChange={(e) => setLine(i, { loai_hh: e.target.value })}>{LOAI_HH.map((entry) => <option key={entry}>{entry}</option>)}</select></td><td><input value={line.item_name} onChange={(e) => setLine(i, { item_name: e.target.value })} /></td><td><input value={line.description} onChange={(e) => setLine(i, { description: e.target.value })} /></td><td><input type="number" value={line.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} /></td><td><input type="number" value={line.unit_price} onChange={(e) => setLine(i, { unit_price: e.target.value })} /></td><td><input type="number" value={line.vatPct} onChange={(e) => setLine(i, { vatPct: e.target.value })} /></td><td>{fmtVND(value.tax)}</td><td>{fmtVND(value.amount)}</td><td><strong>{fmtVND(value.total)}</strong></td><td><input value={line.unit} onChange={(e) => setLine(i, { unit: e.target.value })} /></td><td><input value={line.design_link} onChange={(e) => setLine(i, { design_link: e.target.value })} /></td><td><input value={line.note} onChange={(e) => setLine(i, { note: e.target.value })} /></td><td><input value={line.so_pr} onChange={(e) => setLine(i, { so_pr: e.target.value })} /></td><td><SupplierSelect value={line.supplier_id} onChange={(supplierId, supplier) => setLine(i, { supplier_id: supplierId, master_contract: supplier?.master_contract || line.master_contract })} /></td><td><input value={line.master_contract} onChange={(e) => setLine(i, { master_contract: e.target.value })} /></td><td><button className="btn-sm btn-danger" onClick={() => setLines((old) => old.filter((_, index) => index !== i))}>×</button></td></tr>; })}</tbody></table></div><div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}><div>Tổng cộng: <strong>{fmtVND(total)}</strong></div><div><button onClick={() => setLines([emptyLine()])}>Reset dòng</button>{' '}<button className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Đang lưu…' : '💾 Lưu đơn hàng'}</button></div></div>{err && <div className="error">{err}</div>}</div>
  </div></>;
}

function Suggestions({ line, onApply, onClose }) {
  const [data, setData] = useState(null); const [err, setErr] = useState('');
  useEffect(() => { api.post('/orders/items/supplier-suggestions', line).then(setData).catch((e) => setErr(e.message)); }, []);
  return <Modal title="Đề xuất NCC" onClose={onClose} hideSubmit>
    <div className="muted" style={{ marginBottom: 8 }}>{data?.mode === 'ai-system' ? 'AI xếp hạng từ dữ liệu NCC nội bộ. Bạn vẫn phải tự xác nhận trước khi áp dụng.' : 'Đề xuất dựa trên dữ liệu nội bộ; NCC chỉ thay đổi khi bạn bấm áp dụng.'}</div>
    {err && <div className="error">{err}</div>}{!data && !err ? <div>Đang tải…</div> : <>
      {data?.message && <div className="muted" style={{ marginBottom: 8 }}>{data.message}</div>}
      {(data?.suggestions || []).map((s) => <div key={s.supplier_id} className="card" style={{ padding: 8, marginBottom: 6 }}><strong>{s.supplier_name}</strong> · {s.score}/100 <span className="muted">· {s.confidence === 'high' ? 'Tin cậy cao' : s.confidence === 'medium' ? 'Tin cậy vừa' : 'Tin cậy thấp'}</span><div className="muted">{s.reason}</div><div className="muted">Đã mua: {s.evidence?.purchase_count || 0} lần{s.evidence?.average_price ? ` · Giá TB: ${fmtVND(s.evidence.average_price)}` : ''}</div><button className="btn-sm btn-primary" onClick={() => onApply(s)}>Áp dụng NCC này</button></div>)}
      {data?.external && <div className="card" style={{ padding: 8 }}><strong>NCC ngoài hệ thống – cần xác minh</strong><div className="muted">{data.external.message}</div></div>}
    </>}
  </Modal>;
}
