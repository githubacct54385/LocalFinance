import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv } from '../js/csv.js';
import { parseStatement, parseAmount, parseDate, guessAccountType } from '../js/wf.js';
import { mergeImport } from '../js/import.js';
import { detectTransfers } from '../js/transfers.js';
import { normalizeMerchant, categorize, merchantGroup } from '../js/categories.js';
import { enrich, monthlySummary, categoryTotals, lastMonths } from '../js/analysis.js';
import { detectRecurring } from '../js/recurring.js';
import { slug } from '../js/util.js';

const sample = (f) => readFileSync(new URL(`../samples/${f}`, import.meta.url), 'utf8');

// Shapes copied from real (redacted) Wells Fargo exports.
const CHECKING = `7001 Checking,,,,
DATE,DESCRIPTION,AMOUNT,CHECK #,STATUS
11/05/2026,Deposit One,5366.30,,Posted
11/03/2026,Withdrawal 1,-2692,,Posted
11/02/2026,CHECK,-450,1234,Posted
`;
const CARD = `CreditCard,,,,
DATE,DESCRIPTION,AMOUNT,CHECK #,STATUS
11/07/2026,Withdrawal 1,-39.34,,Pending
11/05/2026,Withdrawal 6,-300,,Posted
`;

test('csv: quotes, CRLF, BOM', () => {
  const rows = parseCsv('﻿a,"b,1","say ""hi"""\r\n1,2,3\r\n\r\n');
  assert.deepEqual(rows, [['a', 'b,1', 'say "hi"'], ['1', '2', '3']]);
});

test('amount and date parsing', () => {
  assert.equal(parseAmount('-1,234.50'), -123450);
  assert.equal(parseAmount('($12.00)'), -1200);
  assert.equal(parseAmount('5366.30'), 536630);
  assert.equal(parseAmount('abc'), null);
  assert.equal(parseDate('11/05/2026'), '2026-11-05');
  assert.equal(parseDate('2/30/2026'), null);
});

test('titled checking export: name, rows, check numbers', () => {
  const p = parseStatement(CHECKING, 'fallback');
  assert.equal(p.accountName, '7001 Checking');
  assert.equal(p.transactions.length, 3);
  assert.equal(p.transactions[2].checkNo, '1234');
  assert.equal(p.transactions[2].amount, -45000);
  assert.equal(guessAccountType(p.accountName), 'checking');
});

test('titled card export: pending detected, card type guessed', () => {
  const p = parseStatement(CARD, 'x');
  assert.equal(p.accountName, 'CreditCard');
  assert.equal(p.transactions[0].status, 'pending');
  assert.equal(p.transactions[1].status, 'posted');
  assert.equal(guessAccountType(p.accountName), 'credit');
});

test('headerless classic export falls back to file name', () => {
  const p = parseStatement('11/05/2026,-12.50,*,,PURCHASE COFFEE\n11/04/2026,100,*,,DEPOSIT\n', 'Savings');
  assert.equal(p.accountName, 'Savings');
  assert.equal(p.transactions[0].description, 'PURCHASE COFFEE');
});

test('import: dedupes posted, keeps identical same-day charges, replaces pending', () => {
  const id = 'acct';
  const stored = (rows) => rows.map((r, i) => ({ ...r, id: `${id}-${i}-${Math.random()}`, accountId: id }));
  const rows1 = parseStatement(`T,,,,
DATE,DESCRIPTION,AMOUNT,CHECK #,STATUS
11/02/2026,COFFEE,-5,,Posted
11/02/2026,COFFEE,-5,,Posted
11/03/2026,PENDING THING,-9,,Pending
`).transactions;
  const m1 = mergeImport([], id, rows1);
  assert.equal(m1.added, 3);
  const db = stored(m1.toAdd);

  // re-import same data + the pending item has now posted under a new description
  const rows2 = parseStatement(`T,,,,
DATE,DESCRIPTION,AMOUNT,CHECK #,STATUS
11/03/2026,PENDING THING SETTLED,-9,,Posted
11/02/2026,COFFEE,-5,,Posted
11/02/2026,COFFEE,-5,,Posted
`).transactions;
  const m2 = mergeImport(db, id, rows2);
  assert.equal(m2.duplicates, 2);
  assert.equal(m2.pendingReplaced, 1);
  assert.equal(m2.added, 1);
  assert.equal(m2.toAdd[0].status, 'posted');

  // a third identical coffee appearing later is new, not a duplicate
  const rows3 = [...rows2, { ...rows2[1] }];
  const m3 = mergeImport(stored([...m1.toAdd.filter((r) => r.status === 'posted'), ...m2.toAdd]), id, rows3);
  assert.equal(m3.added, 1);
});

test('merchant normalization strips noise', () => {
  assert.equal(normalizeMerchant('PURCHASE AUTHORIZED ON 11/03 NETFLIX.COM 866-579-7172 CA S5833'), 'NETFLIX COM CA');
  assert.equal(normalizeMerchant('TRADER JOES #104 ANYTOWN'), 'TRADER JOES ANYTOWN');
  assert.equal(normalizeMerchant('AMZN MKTP US*2K4TY'), 'AMZN MKTP US');
  assert.equal(categorize('NETFLIX.COM'), 'Subscriptions');
  assert.equal(categorize('CHECK', [], '1234'), 'Checks');
  assert.equal(categorize('JOES BAR', [{ match: 'joes bar', category: 'Dining' }]), 'Dining');
});

function loadSamples() {
  const files = [
    ['7001-checking.csv', 'checking'],
    ['7002-checking.csv', 'checking'],
    ['credit-card.csv', 'credit'],
  ];
  const accounts = [];
  const txns = [];
  for (const [f, type] of files) {
    const p = parseStatement(sample(f), f);
    const id = slug(p.accountName);
    accounts.push({ id, name: p.accountName, type });
    for (const m of mergeImport([], id, p.transactions).toAdd) {
      txns.push({ ...m, id: `${id}:${txns.length}`, accountId: id, category: null, note: '' });
    }
  }
  return { accounts, txns };
}

test('credit card payments pair with the card and are excluded from spending', () => {
  const { accounts, txns } = loadSamples();
  const links = detectTransfers(txns, accounts);
  const payments = txns.filter((t) => /WELLS FARGO CASH BACK VISA/.test(t.description));
  assert.ok(payments.length >= 12);
  for (const p of payments) {
    assert.equal(links.get(p.id)?.kind, 'card-payment');
    assert.ok(links.get(p.id).pairedId, `unpaired payment ${p.date}`);
  }
  const rows = enrich(txns, accounts);
  assert.equal(rows.filter((r) => r.type === 'transfer' && r.amount > 0 && r.accountId === 'creditcard').length, payments.length);
  // none of the payments or transfers leak into spending/income
  assert.ok(rows.filter((r) => r.type === 'transfer').every((r) => r.spend === 0 && r.income === 0));
});

test('transfers between checking accounts pair up', () => {
  const { accounts, txns } = loadSamples();
  const links = detectTransfers(txns, accounts);
  const out = txns.filter((t) => /TO SECOND CHECKING/.test(t.description));
  assert.ok(out.length > 10);
  assert.ok(out.every((t) => links.get(t.id)?.kind === 'transfer' && links.get(t.id).pairedId));
});

test('card payment with no card rows imported is still a transfer', () => {
  const accounts = [{ id: 'chk', name: 'Checking', type: 'checking' }];
  const txns = [{ id: '1', accountId: 'chk', date: '2026-10-28', amount: -50000, checkNo: '', status: 'posted',
    description: 'ONLINE TRANSFER REF #IB1 TO WELLS FARGO CASH BACK VISA SIGNATURE CAR XXXXXXXXXXXX4242 ON 10/28/26' }];
  assert.equal(detectTransfers(txns, accounts).get('1').pairedId, null);
  assert.equal(enrich(txns, accounts)[0].type, 'transfer');
});

test('checks display as checks and count as spending', () => {
  const { accounts, txns } = loadSamples();
  const rows = enrich(txns, accounts);
  const checks = rows.filter((r) => r.checkNo);
  assert.ok(checks.length > 10);
  assert.ok(checks.every((r) => r.category === 'Checks' && r.type === 'spending'));
});

test('monthly summary: spending excludes card payments, income is paychecks only', () => {
  const { accounts, txns } = loadSamples();
  const rows = enrich(txns, accounts);
  const [m] = monthlySummary(rows, ['2026-08']);
  assert.equal(m.income, 2 * 303768);
  // card-payment dollars (~$900 a month) would roughly double this figure if double-counted
  const cardOnly = rows.filter((r) => r.accountId === 'creditcard' && r.date.startsWith('2026-08') && r.type !== 'transfer');
  const checkingOnly = rows.filter((r) => r.accountId !== 'creditcard' && r.date.startsWith('2026-08') && r.type === 'spending');
  const expected = [...cardOnly, ...checkingOnly].reduce((s, r) => s + r.spend, 0);
  assert.equal(m.spending, expected);
  assert.equal(lastMonths('2026-11', 3).join(), '2026-09,2026-10,2026-11');
  assert.ok(categoryTotals(rows)[0].total > 0);
});

test('recurring detection finds subscriptions, paychecks, bills; ignores groceries', () => {
  const { accounts, txns } = loadSamples();
  const rows = enrich(txns, accounts);
  const rec = detectRecurring(rows, '2026-11-09');
  const by = (re) => rec.find((r) => re.test(r.merchant));
  assert.equal(by(/NETFLIX/)?.frequency, 'Monthly');
  assert.equal(by(/NETFLIX/).typicalAmount, 1549);
  assert.ok(by(/SPOTIFY/));
  assert.ok(by(/SPECTRUM/));
  assert.equal(by(/ACME/)?.kind, 'income');
  assert.equal(by(/ACME/).frequency, 'Twice a month'); // 5th and 20th, not every 14 days
  assert.equal(by(/CITY POWER/)?.merchant, 'CITY POWER');
  assert.ok(by(/ELECTRIC|POWER/)?.variable, 'electric bill should be flagged variable');
  assert.ok(!by(/TRADER JOES/), 'weekly variable groceries are not subscriptions');
  assert.ok(!rec.some((r) => r.merchant === 'CHECK'));
});

// ---- regressions found during manual testing ----
const mk = (n, accountId, date, amount, description, extra = {}) =>
  ({ id: `r${n}`, accountId, date, amount, description, checkNo: '', status: 'posted', key: `k${n}`, category: null, note: '', ...extra });

test('inbound transfer with no imported counterpart is not income', () => {
  const accounts = [{ id: 'chk', name: 'Checking', type: 'checking' }];
  const [r] = enrich([mk(1, 'chk', '2026-10-05', 100000, 'ONLINE TRANSFER REF #1 FROM SAVINGS XXXXXX9999 ON 10/05/26')], accounts);
  assert.equal(r.type, 'transfer');
  assert.equal(r.income, 0);
});

test('card account mistakenly typed as checking still pairs its payments', () => {
  const accounts = [{ id: 'chk', name: 'Checking', type: 'checking' }, { id: 'cc', name: 'Card', type: 'checking' }];
  const rows = enrich([
    mk(1, 'chk', '2026-10-28', -50000, 'ONLINE TRANSFER REF #1 TO WELLS FARGO CASH BACK VISA SIGNATURE CAR XXXXXXXXXXXX4242 ON 10/28/26'),
    mk(2, 'cc', '2026-10-29', 50000, 'ONLINE PAYMENT THANK YOU'),
  ], accounts);
  assert.ok(rows.every((r) => r.type === 'transfer'));
  assert.equal(rows.reduce((s, r) => s + r.income, 0), 0);
});

test('check with blank number column is still a check; "CHECK 1234" gets its number', () => {
  const accounts = [{ id: 'chk', name: 'Checking', type: 'checking' }];
  const [a, b] = enrich([
    mk(1, 'chk', '2026-10-05', -45000, 'CHECK'),
    mk(2, 'chk', '2026-10-06', -1000, 'CHECK # 1234'),
  ], accounts);
  assert.ok(a.isCheck && a.category === 'Checks' && a.checkNo === '');
  assert.ok(b.isCheck && b.checkNo === '1234');
  const [card] = enrich([mk(3, 'chk', '2026-10-07', -500, 'CHECKCARD 1234 COFFEE SHOP')], accounts);
  assert.equal(card.isCheck, false);
});

// ---- Investments, Zelle, rules ----
const CHECKING_ONLY = [{ id: 'chk', name: 'Checking', type: 'checking' }];

test('Schwab money link is an investment, not spending or a plain transfer', () => {
  const [out, back, other] = enrich([
    mk(1, 'chk', '2026-10-12', -30000, 'ONLINE TRANSFER REF #IB01037589 TO SCHWAB BROKERAGE MONEYLINK ON 10/12/26'),
    mk(2, 'chk', '2026-10-20', 10000, 'SCHWAB BROKERAGE MONEYLINK 4821'),
    mk(3, 'chk', '2026-10-21', -5000, 'FIDELITY INVESTMENTS'),
  ], CHECKING_ONLY);
  assert.equal(out.type, 'investment');
  assert.equal(out.category, 'Investments');
  assert.equal(out.invested, 30000);
  assert.equal(out.spend, 0);
  assert.equal(back.type, 'investment');
  assert.equal(back.invested, -10000); // a withdrawal from the brokerage reduces "invested"
  assert.equal(back.income, 0);
  assert.equal(other.type, 'investment');
});

test('investments are excluded from spending and counted in the monthly summary', () => {
  const rows = enrich([
    mk(1, 'chk', '2026-10-12', -30000, 'ONLINE TRANSFER TO SCHWAB BROKERAGE MONEYLINK'),
    mk(2, 'chk', '2026-10-13', -1000, 'CORNER CAFE'),
    mk(3, 'chk', '2026-10-01', 500000, 'ACME PAYROLL'),
  ], CHECKING_ONLY);
  const [m] = monthlySummary(rows, ['2026-10']);
  assert.deepEqual([m.income, m.spending, m.invested], [500000, 1000, 30000]);
});

test('Zelle is always a transfer; direction comes from the sign', () => {
  const [from, to] = enrich([
    mk(1, 'chk', '2026-10-09', 4500, 'ZELLE FROM A FRIEND ON 10/09/26 REF #9XK9'),
    mk(2, 'chk', '2026-10-18', -7500, 'ZELLE TO A NEIGHBOR ON 10/18/26 REF #18QZ9'),
  ], CHECKING_ONLY);
  assert.equal(from.type, 'transfer');
  assert.equal(from.link.kind, 'zelle');
  assert.equal(from.income, 0);
  assert.equal(to.type, 'transfer');
  assert.equal(to.spend, 0);
});

test('a category set by hand overrides automatic transfer detection', () => {
  const [z, t] = enrich([
    mk(1, 'chk', '2026-10-18', -120000, 'ZELLE TO LANDLORD ON 10/18/26', { category: 'Housing' }),
    mk(2, 'chk', '2026-10-19', -2000, 'GIFT SHOP', { category: 'Transfer' }),
  ], CHECKING_ONLY);
  assert.equal(z.type, 'spending');
  assert.equal(z.spend, 120000);
  assert.equal(t.type, 'transfer');
  assert.equal(t.spend, 0);
});

test('prefix rules match the merchant group, not other merchants', () => {
  const rules = [{ match: 'JOES PIZZA', category: 'Dining', mode: 'prefix' }];
  assert.equal(categorize('JOES PIZZA 5658', rules), 'Dining');
  assert.equal(categorize('JOES PIZZA DOWNTOWN #22', rules), 'Dining');
  assert.equal(categorize('JOESEPH SUPPLY CO', [{ match: 'JOES', category: 'Dining', mode: 'prefix' }]), 'Uncategorized'); // whole-word prefix only
  assert.equal(merchantGroup('TRADER JOES ANYTOWN'), 'TRADER JOES');
  assert.equal(merchantGroup('WALGREENS'), 'WALGREENS');
});

test('bank boilerplate is stripped so transfers group by destination', () => {
  assert.equal(normalizeMerchant('ONLINE TRANSFER REF #IB01037589 TO SCHWAB BROKERAGE MONEYLINK ON 10/12/26'), 'SCHWAB BROKERAGE MONEYLINK');
  assert.equal(normalizeMerchant('ONLINE PAYMENT THANK YOU'), 'THANK YOU');
});

test('recurring brokerage contributions are detected as investing, Zelle is not', () => {
  const { accounts, txns } = loadSamples();
  const rows = enrich(txns, accounts);
  const rec = detectRecurring(rows, '2026-11-09');
  const inv = rec.find((r) => r.kind === 'investment');
  assert.ok(inv, 'monthly Schwab contribution found');
  assert.equal(inv.frequency, 'Monthly');
  assert.equal(inv.typicalAmount, 30000);
  assert.ok(!rec.some((r) => /ZELLE/.test(r.merchant)));
  assert.equal(rows.filter((r) => /ZELLE/.test(r.description)).every((r) => r.type === 'transfer'), true);
  assert.equal(rows.filter((r) => /SCHWAB/.test(r.description)).every((r) => r.type === 'investment'), true);
});
