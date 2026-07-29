const TOKEN_KEY = 'procureos_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    setToken(null);
    if (!path.startsWith('/auth')) window.location.href = '/login';
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

async function fileRequest(path, { download = false } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const joiner = path.includes('?') ? '&' : '?';
  const base = path.startsWith('/api/') ? path : `/api${path}`;
  const res = await fetch(`${base}${download ? `${joiner}download=1` : ''}`, { headers });
  if (res.status === 401) {
    setToken(null);
    window.location.href = '/login';
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Lỗi ${res.status}`);
  }
  return { blob: await res.blob(), filename: res.headers.get('content-disposition') || '', mime: res.headers.get('content-type') || '' };
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  patch: (p, b) => request('PATCH', p, b),
  del: (p, b) => request('DELETE', p, b),
  file: (p, options) => fileRequest(p, options),
};

// Định dạng tiền VND
export const fmtVND = (n) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(Number(n || 0));
// Định dạng số lượng/đếm kiểu VN (dấu chấm phân cách hàng nghìn), dùng chung cho mọi nơi hiển thị số.
export const fmtNum = (n) =>
  new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(Number(n || 0));
export const fmtDate = (d) => (d ? String(d).slice(0, 10) : '');
