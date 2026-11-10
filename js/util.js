// Small shared helpers. No DOM access here so this runs in Node tests too.

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

/** Format integer cents as money. Negative values use a real minus sign. */
export function fmtMoney(cents, { sign = false } = {}) {
  const s = usd.format(Math.abs(cents) / 100);
  if (cents < 0) return '−' + s;
  return sign && cents > 0 ? '+' + s : s;
}

/** Compact money for chart axes: $1.2k */
export function fmtCompact(cents) {
  const v = Math.abs(cents) / 100;
  if (v >= 1000) return '$' + (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k';
  return '$' + Math.round(v);
}

/** Random id. crypto.randomUUID only exists in secure contexts; getRandomValues works everywhere. */
export function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'account';
}

export function isoToDays(iso) {
  return Math.round(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400000);
}

export function daysToIso(d) {
  return new Date(d * 86400000).toISOString().slice(0, 10);
}

export function monthOf(iso) {
  return iso.slice(0, 7);
}

/** Add n months to a YYYY-MM string. */
export function addMonths(ym, n) {
  const y = +ym.slice(0, 4);
  const m = +ym.slice(5, 7) - 1 + n;
  const yy = y + Math.floor(m / 12);
  const mm = ((m % 12) + 12) % 12;
  return `${yy}-${String(mm + 1).padStart(2, '0')}`;
}

/** Add n months to a YYYY-MM-DD date, clamping the day to the month length. */
export function addMonthsIso(iso, n) {
  const ym = addMonths(iso.slice(0, 7), n);
  const last = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate();
  return `${ym}-${String(Math.min(+iso.slice(8, 10), last)).padStart(2, '0')}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthShort = (ym) => MONTHS[+ym.slice(5, 7) - 1];
export const monthLong = (ym) => `${monthShort(ym)} ${ym.slice(0, 4)}`;
export function fmtDate(iso) {
  return `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}, ${iso.slice(0, 4)}`;
}

export function titleCase(s) {
  return String(s).toLowerCase().replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

export function median(nums) {
  if (!nums.length) return 0;
  const a = [...nums].sort((x, y) => x - y);
  const mid = a.length >> 1;
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}
