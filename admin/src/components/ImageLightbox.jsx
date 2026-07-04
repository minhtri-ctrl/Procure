import { useState } from 'react';

// Modal phóng to ảnh + nút copy ảnh / copy link ảnh. Dùng chung cho mọi nơi hiển thị ảnh (sản phẩm, dòng hàng, kho…).
export default function ImageLightbox({ src, alt = '', onClose }) {
  const [msg, setMsg] = useState('');

  const flash = (t) => { setMsg(t); setTimeout(() => setMsg(''), 1800); };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(absoluteUrl(src)); flash('Đã copy link ảnh'); }
    catch { flash('Không copy được link'); }
  };

  const copyImage = async () => {
    try {
      const resp = await fetch(src);
      const blob = await resp.blob();
      if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') { flash('Trình duyệt không hỗ trợ copy ảnh'); return; }
      const pngBlob = blob.type === 'image/png' ? blob : await toPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ [pngBlob.type]: pngBlob })]);
      flash('Đã copy ảnh');
    } catch { flash('Không copy được ảnh'); }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="lightbox" onClick={(e) => e.stopPropagation()}>
        <img src={src} alt={alt} className="lightbox-img" />
        <div className="lightbox-actions">
          <button type="button" className="btn-sm" onClick={copyImage}>📋 Copy ảnh</button>
          <button type="button" className="btn-sm" onClick={copyLink}>🔗 Copy link ảnh</button>
          <button type="button" className="btn-sm" onClick={onClose}>Đóng</button>
        </div>
        {msg && <div className="lightbox-msg">{msg}</div>}
      </div>
    </div>
  );
}

function absoluteUrl(src) {
  try { return new URL(src, window.location.origin).href; } catch { return src; }
}

// Clipboard API chỉ nhận PNG/JPEG bitmap ổn định trên mọi trình duyệt -> vẽ lại qua canvas thành PNG.
function toPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      canvas.toBlob((b) => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('canvas empty')); }, 'image/png');
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img load failed')); };
    img.src = url;
  });
}
