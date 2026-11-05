/** Indian number grouping without relying on Intl: 184500 → "1,84,500". */
export function groupIN(n: number): string {
  const neg = n < 0;
  const s = String(Math.round(Math.abs(n)));
  if (s.length <= 3) return (neg ? '-' : '') + s;
  const last3 = s.slice(-3);
  let rest = s.slice(0, -3);
  const parts: string[] = [];
  while (rest.length > 2) {
    parts.unshift(rest.slice(-2));
    rest = rest.slice(0, -2);
  }
  if (rest) parts.unshift(rest);
  return (neg ? '-' : '') + parts.join(',') + ',' + last3;
}

export function inr(n: number, hidden = false): string {
  if (hidden) return '₹ ••••';
  return '₹' + groupIN(n);
}

/** 184500 → "1.84L", 9500 → "9.5K" */
export function inrCompact(n: number): string {
  if (n >= 100000) return (n / 100000).toFixed(2).replace(/\.?0+$/, '') + 'L';
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(Math.round(n));
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function parseAmount(s: string): number {
  const n = Number(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}

/** Normalises an Indian mobile number to digits with country code: "98765 43210" → "919876543210". */
export function normalizePhone(raw: string): string {
  let d = (raw || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = d.replace(/^0+/, '');
  if (d.length === 10) d = '91' + d;
  return d;
}

export function displayPhone(digits: string): string {
  const d = normalizePhone(digits);
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return d ? '+' + d : '';
}
