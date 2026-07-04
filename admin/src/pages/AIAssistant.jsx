import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const SUGGESTIONS = ['Thống kê tổng quan', 'Tồn kho hiện tại', 'Báo cáo chi tiêu theo team', 'Danh sách nhà cung cấp'];

export default function AIAssistant() {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Xin chào! Tôi là trợ lý ProcureOS. Bạn có thể hỏi về thống kê, đơn hàng, tồn kho, nhà cung cấp, báo cáo chi tiêu…' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => { api.get('/ai/status').then(setStatus).catch(() => {}); }, []);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [messages, busy]);

  const send = async (text) => {
    const msg = (text ?? input).trim();
    if (!msg || busy) return;
    setInput('');
    const history = messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: msg }]);
    setBusy(true);
    try {
      const r = await api.post('/ai/chat', { message: msg, history });
      setMessages((m) => [...m, { role: 'assistant', content: r.reply }]);
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', content: '⚠️ Lỗi: ' + e.message }]);
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="topbar">
        <h1>Trợ lý AI</h1>
        {status && <span className="muted" style={{ fontSize: 12 }}>Chế độ: {status.model}</span>}
      </div>
      <div className="content">
        <div className="card" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
          <div ref={boxRef} style={{ flex: 1, overflowY: 'auto', padding: 4 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', margin: '8px 0' }}>
                <div style={{
                  maxWidth: '76%', padding: '10px 14px', borderRadius: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5,
                  background: m.role === 'user' ? 'var(--primary)' : '#f1f4f9', color: m.role === 'user' ? '#fff' : 'var(--text)',
                }}>{m.content}</div>
              </div>
            ))}
            {busy && <div className="muted" style={{ margin: '8px 4px' }}>Đang trả lời…</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            {SUGGESTIONS.map((s) => <button key={s} className="btn-sm" onClick={() => send(s)}>{s}</button>)}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: 'flex', gap: 8 }}>
            <input placeholder="Nhập câu hỏi…" value={input} onChange={(e) => setInput(e.target.value)} />
            <button type="submit" className="btn-primary" disabled={busy}>Gửi</button>
          </form>
        </div>
      </div>
    </>
  );
}
