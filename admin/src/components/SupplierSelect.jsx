import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';

// Bỏ dấu tiếng Việt bằng char-code (KHÔNG dùng literal combining-mark class —
// nó bị hỏng qua git/CRLF/encoding, xem skill buildwebporcure).
function noAccent(s) {
  return String(s || '')
    .normalize('NFD')
    .split('')
    .filter((c) => { const x = c.charCodeAt(0); return x < 768 || x > 879; })
    .map((c) => { const x = c.charCodeAt(0); return (x === 272 || x === 273) ? 'd' : c; })
    .join('')
    .toLowerCase();
}

// Cache danh sách NCC ở cấp module: mọi instance (kể cả nhiều dòng trong 1 form)
// dùng chung 1 lần fetch. Gọi refreshSuppliers() nếu vừa thêm/sửa NCC.
let _cache = null;
let _inflight = null;
function loadSuppliers() {
  if (_cache) return Promise.resolve(_cache);
  if (!_inflight) {
    _inflight = api.get('/suppliers?limit=2000')
      .then((r) => { _cache = r.data || []; return _cache; })
      .catch((e) => { _inflight = null; throw e; });
  }
  return _inflight;
}
export function refreshSuppliers() { _cache = null; _inflight = null; }

/**
 * Combobox "gõ để tìm + chọn" dùng chung cho Nhà cung cấp (NCC).
 * - Lọc theo tên & mã NCC (vendor_no), hỗ trợ tiếng Việt không dấu.
 * - Không cho nhập tự do ngoài danh sách: giá trị chỉ đổi khi chọn 1 NCC hợp lệ.
 *
 * Props:
 *   value      giá trị hiện tại (id NCC, hoặc tên NCC nếu valueKey='name')
 *   onChange   (value, supplier|null) => void
 *   valueKey   'id' (mặc định) | 'name' — kiểu giá trị trả về
 *   options    (tuỳ chọn) mảng NCC dựng sẵn; bỏ trống thì tự load & cache
 *   placeholder, disabled, allowEmpty (mặc định true), style, minWidth
 */
export default function SupplierSelect({
  value, onChange, valueKey = 'id', options,
  placeholder = 'Gõ tên/mã NCC…', disabled = false, allowEmpty = true,
  style, minWidth = 160,
}) {
  const [suppliers, setSuppliers] = useState(options || _cache || []);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [hi, setHi] = useState(0); // dòng đang highlight
  const [rect, setRect] = useState(null);
  const boxRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (options) { setSuppliers(options); return; }
    let alive = true;
    loadSuppliers().then((list) => { if (alive) setSuppliers(list); }).catch(() => {});
    return () => { alive = false; };
  }, [options]);

  // NCC đang được chọn (khớp theo valueKey)
  const selected = useMemo(() => {
    if (value === '' || value == null) return null;
    return suppliers.find((s) => String(s[valueKey]) === String(value)) || null;
  }, [suppliers, value, valueKey]);

  const label = (s) => (s ? (s.vendor_no ? `${s.name} (${s.vendor_no})` : s.name) : '');

  const filtered = useMemo(() => {
    const q = noAccent(query.trim());
    if (!q) return suppliers.slice(0, 50);
    return suppliers
      .filter((s) => noAccent(s.name).includes(q) || noAccent(s.vendor_no).includes(q))
      .slice(0, 50);
  }, [suppliers, query]);

  const place = () => { if (inputRef.current) setRect(inputRef.current.getBoundingClientRect()); };
  useLayoutEffect(() => { if (open) place(); }, [open]);
  useEffect(() => {
    if (!open) return undefined;
    const onScroll = () => place();
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) close(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    document.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  const openList = () => { if (disabled) return; setQuery(''); setHi(0); setOpen(true); };
  const close = () => { setOpen(false); setQuery(''); };

  const choose = (s) => {
    if (!s) { if (allowEmpty) onChange('', null); close(); return; }
    onChange(s[valueKey], s);
    close();
  };

  const onKey = (e) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) { openList(); return; }
    if (!open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[hi]) choose(filtered[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
  };

  // Khi mở: input hiển thị query để gõ; khi đóng: hiển thị nhãn NCC đã chọn.
  const inputVal = open ? query : label(selected);

  return (
    <div ref={boxRef} style={{ position: 'relative', minWidth, ...style }}>
      <input
        ref={inputRef}
        value={inputVal}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => { if (!open) setOpen(true); setQuery(e.target.value); setHi(0); }}
        onFocus={openList}
        onKeyDown={onKey}
        autoComplete="off"
        style={{ paddingRight: (selected && allowEmpty) ? 26 : undefined }}
      />
      {selected && allowEmpty && !disabled && (
        <span
          onMouseDown={(e) => { e.preventDefault(); choose(null); }}
          title="Bỏ chọn"
          style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: 'var(--muted)', fontWeight: 700 }}
        >×</span>
      )}
      {open && rect && (
        <div style={{
          position: 'fixed', top: rect.bottom + 2, left: rect.left,
          width: Math.max(rect.width, 240), maxHeight: 260, overflowY: 'auto', zIndex: 60,
          background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8,
          boxShadow: '0 8px 24px rgba(15,23,42,.18)',
        }}>
          {filtered.length === 0 && (
            <div style={{ padding: '10px 12px', color: 'var(--muted)' }}>Không tìm thấy NCC</div>
          )}
          {filtered.map((s, i) => (
            <div
              key={s.id}
              onMouseDown={(e) => { e.preventDefault(); choose(s); }}
              onMouseEnter={() => setHi(i)}
              style={{
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                background: i === hi ? 'var(--bg)' : 'transparent',
                borderLeft: selected && String(s[valueKey]) === String(value) ? '3px solid var(--primary)' : '3px solid transparent',
              }}
            >
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              {s.vendor_no && <div style={{ color: 'var(--muted)', fontSize: 11 }}>Mã: {s.vendor_no}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
