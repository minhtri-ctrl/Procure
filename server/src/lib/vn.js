// Tiện ích tiếng Việt: định dạng tiền + đọc số thành chữ (cho hợp đồng).

export function moneyVnd(n) {
  return new Intl.NumberFormat('vi-VN').format(Math.round(Number(n || 0)));
}

const DV = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readTriple(n, full) {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const donvi = n % 10;
  let s = '';
  if (full || tram > 0) s += DV[tram] + ' trăm';
  if (chuc === 0) {
    if (donvi > 0) s += (s ? ' lẻ ' : '') + DV[donvi];
  } else if (chuc === 1) {
    s += (s ? ' ' : '') + 'mười';
    if (donvi === 5) s += ' lăm';
    else if (donvi > 0) s += ' ' + DV[donvi];
  } else {
    s += (s ? ' ' : '') + DV[chuc] + ' mươi';
    if (donvi === 1) s += ' mốt';
    else if (donvi === 5) s += ' lăm';
    else if (donvi > 0) s += ' ' + DV[donvi];
  }
  return s.trim();
}

// Đọc số tiền thành chữ tiếng Việt, hậu tố "đồng".
export function numToVietnamese(num) {
  let n = Math.round(Number(num || 0));
  if (n === 0) return 'Không đồng';
  const units = ['', ' nghìn', ' triệu', ' tỷ'];
  const groups = [];
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  let parts = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    parts.push(readTriple(groups[i], i !== groups.length - 1) + units[i]);
  }
  let s = parts.join(' ').replace(/\s+/g, ' ').trim();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s + ' đồng';
}
