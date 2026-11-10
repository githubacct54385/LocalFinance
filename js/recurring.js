// Recurring payment / income detection.
//
// Group by normalized merchant, then look for a steady interval (weekly ... yearly) with
// reasonably steady amounts. Needs at least 3 occurrences, so more history = better results.
// "Active" is judged against the newest date in the data, not today's date, so old exports
// still behave sensibly.

import { isoToDays, daysToIso, addMonthsIso, median } from './util.js';

const FREQS = [
  // tol: allowed distance of the median gap from `days`; gapTol: allowed distance for individual gaps.
  { label: 'Weekly', days: 7, tol: 2, gapTol: 3, perMonth: 52 / 12, fixedOnly: true },
  { label: 'Every 2 weeks', days: 14, tol: 0.5, gapTol: 2, perMonth: 26 / 12, fixedOnly: true },
  { label: 'Twice a month', days: 15.2, tol: 1.5, gapTol: 3, perMonth: 2, fixedOnly: true },
  { label: 'Monthly', days: 30.4, tol: 5, gapTol: 8, perMonth: 1, fixedOnly: false },
  { label: 'Quarterly', days: 91, tol: 10, gapTol: 16, perMonth: 1 / 3, fixedOnly: false },
  { label: 'Yearly', days: 365, tol: 20, gapTol: 32, perMonth: 1 / 12, fixedOnly: false },
];

/**
 * @param {Array} rows enriched rows ({type, merchant, date, amount, checkNo, ...})
 * @param {string} asOf YYYY-MM-DD (usually newest date in the data)
 */
export function detectRecurring(rows, asOf) {
  const groups = new Map();
  for (const r of rows) {
    if (r.checkNo || r.merchant === 'UNKNOWN') continue;
    const kind = r.type === 'spending' ? 'expense' : r.type === 'income' ? 'income' : null;
    if (!kind) continue;
    const k = `${kind}|${r.merchant}`;
    if (!groups.has(k)) groups.set(k, { kind, merchant: r.merchant, items: [] });
    groups.get(k).items.push(r);
  }

  const out = [];
  const asOfDays = isoToDays(asOf);
  for (const g of groups.values()) {
    if (g.items.length < 3) continue;
    const items = [...g.items].sort((a, b) => a.date.localeCompare(b.date));
    const days = items.map((i) => isoToDays(i.date));
    const gaps = days.slice(1).map((d, i) => d - days[i]).filter((x) => x > 0);
    if (gaps.length < 2) continue;
    const mg = median(gaps);

    const freq = FREQS.find((f) => Math.abs(mg - f.days) <= f.tol);
    if (!freq) continue;
    const okGaps = gaps.filter((x) => Math.abs(x - freq.days) <= freq.gapTol).length;
    if (okGaps / gaps.length < 0.7) continue;

    const amts = items.map((i) => Math.abs(i.amount));
    const med = median(amts);
    const within = (pct) => amts.filter((a) => Math.abs(a - med) <= Math.max(100, med * pct)).length / amts.length;
    const fixed = within(0.1) >= 0.7;
    if (freq.fixedOnly && !fixed) continue;
    if (!fixed && within(0.5) < 0.7) continue;

    const last = items[items.length - 1];
    const next = freq.label === 'Monthly' ? addMonthsIso(last.date, 1)
      : freq.label === 'Quarterly' ? addMonthsIso(last.date, 3)
      : freq.label === 'Yearly' ? addMonthsIso(last.date, 12)
      : daysToIso(isoToDays(last.date) + Math.round(freq.days));
    const typical = Math.round(med);
    out.push({
      merchant: g.merchant,
      kind: g.kind,
      frequency: freq.label,
      periodDays: freq.days,
      typicalAmount: typical,
      lastAmount: Math.abs(last.amount),
      variable: !fixed,
      count: items.length,
      firstDate: items[0].date,
      lastDate: last.date,
      nextDate: next,
      monthlyCost: Math.round(typical * freq.perMonth),
      active: asOfDays - isoToDays(last.date) <= freq.days * 1.6,
    });
  }
  return out.sort((a, b) => b.monthlyCost - a.monthlyCost);
}
