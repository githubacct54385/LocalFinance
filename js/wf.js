// Parser for Wells Fargo CSV exports (checking and credit card).
//
// Supported layouts:
//   1. Titled export:   row 1 = account name, row 2 = "DATE,DESCRIPTION,AMOUNT,CHECK #,STATUS"
//   2. Header-only:     "DATE,DESCRIPTION,AMOUNT,..." with no title row (name falls back to file name)
//   3. Classic headerless Wells Fargo: date, amount, "*", check #, description
// Amounts: negative = money out, positive = money in (for both account types).

import { parseCsv } from './csv.js';

export function parseDate(s) {
  s = String(s ?? '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    let y = +m[3];
    if (y < 100) y += 2000;
    return valid(y, +m[1], +m[2]);
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? valid(+m[1], +m[2], +m[3]) : null;
}

function valid(y, mo, d) {
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "-1,234.50", "($12.00)", "5" -> integer cents, or null if unparseable. */
export function parseAmount(s) {
  s = String(s ?? '').trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  s = s.replace(/[$,\s]/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  const cents = Math.round(parseFloat(s) * 100);
  return neg ? -Math.abs(cents) : cents;
}

export function guessAccountType(name) {
  return /credit|card|visa|mastercard|master card|amex|discover/i.test(name) ? 'credit' : 'checking';
}

/**
 * @returns {{accountName: string, transactions: Array, skipped: number}}
 *   transactions: {date, description, amount (cents), checkNo, status: 'posted'|'pending'}
 */
export function parseStatement(text, fallbackName = 'Account') {
  const rows = parseCsv(text);
  const lc = (r) => r.map((c) => c.trim().toLowerCase());
  const headerIdx = rows.findIndex((r) => {
    const c = lc(r);
    return c.some((x) => x.startsWith('date')) && c.some((x) => x.startsWith('amount'));
  });

  let accountName = fallbackName;
  let cols;
  let dataRows;

  if (headerIdx >= 0) {
    if (headerIdx > 0) {
      const title = rows[0][0].trim();
      if (title) accountName = title;
    }
    const h = lc(rows[headerIdx]);
    const find = (pred) => h.findIndex(pred);
    cols = {
      date: find((x) => x.startsWith('date')),
      desc: find((x) => x.startsWith('desc')),
      amount: find((x) => x.startsWith('amount')),
      check: find((x) => x.includes('check')),
      status: find((x) => x.startsWith('status')),
    };
    dataRows = rows.slice(headerIdx + 1);
  } else if (rows.length && parseDate(rows[0][0])) {
    cols = rows[0].length >= 5
      ? { date: 0, amount: 1, check: 3, desc: 4, status: -1 }
      : { date: 0, amount: 1, check: -1, desc: 2, status: -1 };
    dataRows = rows;
  } else {
    return { accountName, transactions: [], skipped: rows.length };
  }

  const transactions = [];
  let skipped = 0;
  for (const r of dataRows) {
    const date = parseDate(r[cols.date]);
    const amount = parseAmount(r[cols.amount]);
    if (!date || amount === null) { skipped++; continue; }
    const status = cols.status >= 0 && /pend/i.test(r[cols.status] ?? '') ? 'pending' : 'posted';
    const checkNo = cols.check >= 0 ? (r[cols.check] ?? '').trim() : '';
    transactions.push({
      date,
      description: (r[cols.desc] ?? '').trim().replace(/\s+/g, ' '),
      amount,
      checkNo,
      status,
    });
  }
  return { accountName, transactions, skipped };
}
