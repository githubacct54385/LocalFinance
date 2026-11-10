// Turns stored transactions into classified rows and summaries.
//
// Row types:
//   transfer  - card payments / moves between your accounts (excluded from totals)
//   income    - positive amount on a checking account
//   refund    - positive amount on a credit card (reduces spending)
//   spending  - negative amount (checks included)

import { detectTransfers } from './transfers.js';
import { categorize, normalizeMerchant } from './categories.js';
import { addMonths, monthOf } from './util.js';

export function enrich(txns, accounts, rules = []) {
  const acct = new Map(accounts.map((a) => [a.id, a]));
  const links = detectTransfers(txns, accounts);
  return txns.map((t) => {
    const a = acct.get(t.accountId);
    const link = links.get(t.id) ?? null;
    // A check is a row with a check number, or a bare "CHECK" / "CHECK 1234" description.
    const descCheck = /^CHECK(\s*#?\s*(\d+))?\s*$/i.exec(t.description);
    const checkNo = t.checkNo || descCheck?.[2] || '';
    const isCheck = !!(t.checkNo || descCheck);
    const type = link ? 'transfer'
      : t.amount > 0 ? (a?.type === 'credit' ? 'refund' : 'income')
      : 'spending';
    const auto = type === 'transfer' ? 'Transfer'
      : type === 'income' ? 'Income'
      : categorize(t.description, rules, isCheck ? 'check' : '');
    return {
      ...t,
      checkNo,
      isCheck,
      accountName: a?.name ?? t.accountId,
      type,
      link,
      merchant: normalizeMerchant(t.description),
      category: t.category || auto,
      spend: type === 'spending' || type === 'refund' ? -t.amount : 0,
      income: type === 'income' ? t.amount : 0,
    };
  });
}

export function monthsPresent(rows) {
  return [...new Set(rows.map((r) => monthOf(r.date)))].sort();
}

/** Last n calendar months ending at `latest` (YYYY-MM), oldest first. */
export function lastMonths(latest, n) {
  return Array.from({ length: n }, (_, i) => addMonths(latest, i - n + 1));
}

export function monthlySummary(rows, months) {
  const m = new Map(months.map((k) => [k, { month: k, income: 0, spending: 0 }]));
  for (const r of rows) {
    const e = m.get(monthOf(r.date));
    if (!e) continue;
    e.income += r.income;
    e.spending += r.spend;
  }
  return [...m.values()];
}

/** Net spend per category (refunds subtract); only categories with net spend > 0. */
export function categoryTotals(rows) {
  const m = new Map();
  for (const r of rows) {
    if (r.type !== 'spending' && r.type !== 'refund') continue;
    m.set(r.category, (m.get(r.category) ?? 0) + r.spend);
  }
  return [...m.entries()]
    .filter(([, v]) => v > 0)
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export function topMerchants(rows, n = 8) {
  const m = new Map();
  for (const r of rows) {
    if (r.type !== 'spending' || r.isCheck) continue;
    const e = m.get(r.merchant) ?? { merchant: r.merchant, total: 0, count: 0 };
    e.total += r.spend;
    e.count++;
    m.set(r.merchant, e);
  }
  return [...m.values()].sort((a, b) => b.total - a.total).slice(0, n);
}
