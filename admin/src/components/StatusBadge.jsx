import { useMeta } from '../meta.jsx';

// Badge trạng thái dùng màu cấu hình từ workflow_states.
export default function StatusBadge({ code }) {
  const { byCode } = useMeta();
  const s = byCode(code);
  const color = s.color || '#64748b';
  return (
    <span className="badge" style={{ background: color + '22', color, border: `1px solid ${color}55` }}>
      {s.name || code}
    </span>
  );
}
