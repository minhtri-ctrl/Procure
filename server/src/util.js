// Bọc async handler để tự bắt lỗi -> tránh lặp try/catch.
export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Lấy chỉ các field cho phép từ body.
export function pick(body, fields) {
  const out = {};
  for (const f of fields) if (body[f] !== undefined) out[f] = body[f];
  return out;
}

// Sinh câu SET cho UPDATE/INSERT từ object.
export function toSet(obj) {
  const keys = Object.keys(obj);
  const clause = keys.map((k) => `\`${k}\` = ?`).join(', ');
  const values = keys.map((k) => obj[k]);
  return { clause, values, keys };
}
