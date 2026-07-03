export default function Modal({ title, onClose, children, onSubmit, submitLabel = 'Lưu', busy }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <form onSubmit={(e) => { e.preventDefault(); onSubmit?.(); }}>
          {children}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>Huỷ</button>
            {onSubmit && <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Đang lưu…' : submitLabel}</button>}
          </div>
        </form>
      </div>
    </div>
  );
}
