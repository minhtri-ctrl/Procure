import { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

// Chuông thông báo in-app: badge số chưa đọc (poll 30s), dropdown danh sách,
// click 1 thông báo -> đánh dấu đã đọc + mở đơn liên quan.
export default function NotificationBell() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);

  const loadCount = useCallback(() => api.get('/notifications/unread-count').then((r) => setUnread(r.unread)).catch(() => {}), []);
  const loadList = useCallback(() => api.get('/notifications?limit=30').then((r) => { setItems(r.data); setUnread(r.unread); }).catch(() => {}), []);

  useEffect(() => { loadCount(); const t = setInterval(loadCount, 30000); return () => clearInterval(t); }, [loadCount]);

  // Đóng khi click ra ngoài.
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const toggle = () => { const n = !open; setOpen(n); if (n) loadList(); };

  const clickItem = async (n) => {
    setOpen(false);
    if (!n.is_read) { try { await api.post(`/notifications/${n.id}/read`); } catch { /* noop */ } loadCount(); }
    if (n.link) nav(n.link);
  };
  const markAll = async () => { await api.post('/notifications/read-all'); loadList(); loadCount(); };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className="btn-sm" onClick={toggle} title="Thông báo" style={{ position: 'relative' }}>
        🔔
        {unread > 0 && (
          <span style={{ position: 'absolute', top: -6, right: -6, background: '#ef4444', color: '#fff', borderRadius: 10, fontSize: 11, minWidth: 18, height: 18, lineHeight: '18px', textAlign: 'center', padding: '0 4px', fontWeight: 700 }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', bottom: '110%', left: 0, width: 340, maxHeight: 420, overflowY: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 30px rgba(0,0,0,.18)', zIndex: 1000 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#fff' }}>
            <strong>Thông báo</strong>
            {items.some((i) => !i.is_read) && <button className="btn-sm" onClick={markAll}>Đọc tất cả</button>}
          </div>
          {!items.length && <div className="muted" style={{ padding: 20, textAlign: 'center' }}>Không có thông báo</div>}
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => clickItem(n)}
              style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: n.is_read ? '#fff' : '#eff6ff' }}
            >
              <div style={{ display: 'flex', gap: 6, alignItems: 'start' }}>
                {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: 4, background: '#2563eb', marginTop: 6, flexShrink: 0 }} />}
                <div style={{ flex: 1, color: 'var(--text)' }}>
                  <div style={{ fontWeight: n.is_read ? 400 : 600, fontSize: 14 }}>{n.title}</div>
                  {n.body && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{n.body}</div>}
                  {n.requires_action === 1 && n.action_status === 'pending' && (
                    <div style={{ marginTop: 4, fontSize: 12, color: '#db2777', fontWeight: 600 }}>⏳ Cần bạn xác nhận</div>
                  )}
                  <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{String(n.created_at).slice(0, 16).replace('T', ' ')}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
