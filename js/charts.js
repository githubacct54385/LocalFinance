// Hand-rolled SVG charts. No libraries, no inline styles (the page CSP forbids them), so all
// styling is via classes and SVG attributes. Colors come from CSS variables in styles.css.

import { esc, fmtMoney, fmtCompact, monthShort, monthLong } from './util.js';

const niceMax = (v) => {
  if (v <= 0) return 100000;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : n <= 8 ? 8 : 10) * pow;
};

/** Grouped bars per month: income (series 1) vs spending (series 2). Amounts are cents. */
export function trendChart(data, W = 640) {
  const H = 230;
  const pad = { l: 44, r: 8, t: 10, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(...data.flatMap((d) => [d.income, d.spending]), 1));
  const y = (v) => pad.t + ih - (Math.max(v, 0) / max) * ih;
  const slot = iw / data.length;
  const bw = Math.min(14, slot * 0.34);
  const parts = [];

  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    parts.push(`<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>`);
    parts.push(`<text class="axis" x="${pad.l - 6}" y="${y(v) + 4}" text-anchor="end">${fmtCompact(v)}</text>`);
  }
  data.forEach((d, i) => {
    const cx = pad.l + slot * i + slot / 2;
    const tip = `${monthLong(d.month)}|Income ${fmtMoney(d.income)}|Spending ${fmtMoney(d.spending)}`;
    parts.push(`<g class="hit" data-tip="${esc(tip)}">`);
    parts.push(`<rect class="hitbox" x="${cx - slot / 2}" y="${pad.t}" width="${slot}" height="${ih + pad.b}"/>`);
    const bar = (cls, v, x) => {
      const h = Math.max(ih + pad.t - y(v), v > 0 ? 1 : 0);
      return `<path class="${cls}" d="M${x} ${pad.t + ih}V${y(v) + Math.min(3, h)}Q${x} ${y(v)} ${x + 2} ${y(v)}H${x + bw - 2}Q${x + bw} ${y(v)} ${x + bw} ${y(v) + Math.min(3, h)}V${pad.t + ih}Z"/>`;
    };
    parts.push(bar('s1', d.income, cx - bw - 1));
    parts.push(bar('s2', d.spending, cx + 1));
    parts.push('</g>');
    if (data.length <= 14 || i % 2 === 0) {
      parts.push(`<text class="axis" x="${cx}" y="${H - 8}" text-anchor="middle">${monthShort(d.month)}</text>`);
    }
  });
  parts.push(`<line class="baseline" x1="${pad.l}" x2="${W - pad.r}" y1="${pad.t + ih}" y2="${pad.t + ih}"/>`);

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly income and spending">${parts.join('')}</svg>`;
}

/** Horizontal bar list. items: [{label, value (cents), sub?}] */
export function barList(items, { sub = false } = {}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return `<ul class="bars">${items.map((i) => {
    const pct = ((i.value / max) * 100).toFixed(1);
    return `<li class="hit" data-tip="${esc(`${i.label}|${fmtMoney(i.value)}${i.sub ? '|' + i.sub : ''}`)}">
      <span class="bar-label">${esc(i.label)}</span>
      <svg class="bar-track" viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true">
        <rect class="bar-bg" x="0" y="0" width="100" height="10" rx="2"/>
        <rect class="s1" x="0" y="0" width="${pct}" height="10" rx="2"/>
      </svg>
      <span class="bar-value">${fmtMoney(i.value)}</span>
    </li>`;
  }).join('')}</ul>`;
}
