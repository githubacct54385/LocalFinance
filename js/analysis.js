// Turns stored transactions into classified rows and summaries.
//
// Row types:
//   transfer   - card payments, Zelle, moves between your accounts (excluded from all totals)
//   investment - money to/from a brokerage (excluded from spending; shown as "Invested")
//   income     - positive amount on a checking account
//   refund     - positive amount on a credit card (reduces spending)
//   spending   - negative amount (checks included)
//
// A category you set by hand always wins over automatic detection, so a wrongly detected
// transfer can be turned back into a normal transaction (and vice versa).

import { detectTransfers } from './transfers.js';
import { categorize, normalizeMerchant } from './categories.js';
import { addMonths, monthOf } from './util.js';

export function enrich(txns, accounts, rules = []) {
  const acct = new Map(accounts.map((a) => [a.id, a]));
  const links = detectTransfers(txns, accounts);
  return txns.map((t) => {
    const a = acct.get(t.accountId);
    const credit = a?.type === 'credit';
    const link = links.get(t.id) ?? null;

    // A check is a row with a check number, or a bare "CHECK" / "CHECK 1234" description.
    const descCheck = /^CHECK(\s*#?\s*(\d+))?\s*$/i.exec(t.description);
    const checkNo = t.checkNo || descCheck?.[2] || '';
    const isCheck = !!(t.checkNo || descCheck);

    const guess = categorize(t.description, rules, isCheck ? 'check' : '');
    const manual = t.category || null;
    const dir = t.amount > 0 ? (credit ? 'refund' : 'income') : 'spending';

    let category;
    if (manual) category = manual;
    else if (link) category = guess === 'Investments' && link.kind !== 'card-payment' ? 'Investments' : 'Transfer';
    else if (dir === 'income') category = guess === 'Investments' ? 'Investments' : 'Income';
    else category = guess;

    let type = link ? 'transfer' : dir;
    if (category === 'Investments' && link?.kind !== 'card-payment') type = 'investment';
    else if (category === 'Transfer') type = 'transfer';
    else if (manual && link) type = dir; // user re-categorized a detected transfer

    return {
      ...t,
      checkNo,
      isCheck,
      accountName: a?.name ?? t.accountId,
      type,
      link,
      merchant: normalizeMerchant(t.description),
      category,
      spend: type === 'spending' || type === 'refund' ? -t.amount : 0,
      income: type === 'income' ? t.amount : 0,
      invested: type === 'investment' ? -t.amount : 0,
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
  const m = new Map(months.map((k) => [k, { month: k, income: 0, spending: 0, invested: 0 }]));
  for (const r of rows) {
    const e = m.get(monthOf(r.date));
    if (!e) continue;
    e.income += r.income;
    e.spending += r.spend;
    e.invested += r.invested;
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
