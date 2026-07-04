import { useState } from 'react';
import { api } from '../api.js';

// Nút "Xóa toàn bộ" với xác nhận 2 lần (ghi rõ số lượng sẽ bị xóa).
// Chỉ hiển thị cho admin/PM (do trang cha kiểm soát). Backend cũng chặn theo vai trò.
// props: entity ('đơn hàng' | 'yêu cầu mua'), countPath, deletePath, onDone
export default function BulkDeleteButton({ entity, countPath, deletePath, onDone }) {
  const [step, setStep] = useState(0); // 0=đóng, 1=cảnh báo, 2=gõ xác nhận
  const [count, setCount] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const KEYWORD = 'XOA TOAN BO';

  const open = async () => {
    setErr(''); setTyped('');
    try {
      const r = await api.get(countPath);
      setCount(r.total);
      setStep(1);
    } catch (e) { setErr(e.message); alert('Không lấy được số lượng: ' + e.message); }
  };
  const close = () => { setStep(0); setTyped(''); setErr(''); };

  const doDelete = async () => {
    setBusy(true); setErr('');
    try {
      const r = await api.del(deletePath, { confirm: true });
      close();
      onDone?.(r.deleted);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };

  return (
    <>
      <button className="btn-danger" onClick={open} title={`Xóa toàn bộ ${entity} (môi trường test)`}>
        🗑 Xóa toàn bộ
      </button>

      {step > 0 && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
            {step === 1 && (
              <>
                <h2 style={{ color: 'var(--red, #b91c1c)' }}>⚠️ Xóa toàn bộ {entity}?</h2>
                <p>
                  Bạn sắp xóa <strong>{count}</strong> {entity}. Đây là <strong>xóa mềm</strong> (đánh dấu đã xóa) —
                  dữ liệu vẫn còn trong DB và có thể khôi phục nếu lỡ tay.
                </p>
                {count === 0 && <p className="muted">Hiện không có {entity} nào để xóa.</p>}
                <div className="modal-actions">
                  <button type="button" onClick={close}>Huỷ</button>
                  <button type="button" className="btn-danger" disabled={!count} onClick={() => setStep(2)}>
                    Tiếp tục (xác nhận lần 2)
                  </button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <h2 style={{ color: 'var(--red, #b91c1c)' }}>Xác nhận lần cuối</h2>
                <p>
                  Sẽ đánh dấu xóa <strong>{count}</strong> {entity}. Gõ <code>{KEYWORD}</code> để xác nhận:
                </p>
                <input
                  autoFocus value={typed} onChange={(e) => setTyped(e.target.value)}
                  placeholder={KEYWORD} style={{ width: '100%' }}
                />
                {err && <div className="error">{err}</div>}
                <div className="modal-actions">
                  <button type="button" onClick={() => setStep(1)}>← Quay lại</button>
                  <button
                    type="button" className="btn-danger"
                    disabled={busy || typed.trim().toUpperCase() !== KEYWORD}
                    onClick={doDelete}
                  >
                    {busy ? 'Đang xóa…' : `Xóa toàn bộ ${count} ${entity}`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
