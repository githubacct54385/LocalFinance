// LocalFinance UI. Everything runs in this browser; there is no network code in this app.

import * as store from './store.js';
import { parseStatement, guessAccountType } from './wf.js';
import { mergeImport } from './import.js';
import { enrich, monthsPresent, lastMonths, monthlySummary, categoryTotals, topMerchants } from './analysis.js';
import { detectRecurring } from './recurring.js';
import { CATEGORIES, merchantGroup } from './categories.js';
import { trendChart, barList } from './charts.js';
import { esc, fmtMoney, fmtDate, monthLong, titleCase, slug, monthOf, uuid } from './util.js';

const S = {
  accounts: [], txns: [], rules: [], rows: [], months: [], latest: '', recurring: [],
  view: 'overview', period: '', results: [], persistent: true, skipped: new Set(), reviewStack: [], focusKey: '',
  filter: { q: '', account: '', category: '', kind: 'all', limit: 100 },
};
const $ = (sel) => document.querySelector(sel);
const view = $('#view');
const narrow = matchMedia('(max-width: 599px)'); // phone: draw charts at a smaller width so text stays legible
narrow.addEventListener('change', () => { if (S.view === 'overview') render(); });

/* ---------- data flow ---------- */

function recompute() {
  S.rows = enrich(S.txns, S.accounts, S.rules)
    .sort((a, b) => b.date.localeCompare(a.date) || a.description.localeCompare(b.description));
  S.months = monthsPresent(S.rows);
  S.latest = S.rows[0]?.date ?? '';
  S.recurring = S.latest ? detectRecurring(S.rows, S.latest) : [];
  const valid = new Set(['all', 'last3', 'last12', ...S.months.map((m) => 'm:' + m)]);
  if (!valid.has(S.period)) S.period = S.months.length ? 'm:' + S.months[S.months.length - 1] : '';
}

async function importFiles(files) {
  const results = [];
  for (const f of files) {
    try {
      const parsed = parseStatement(await f.text(), f.name.replace(/\.csv$/i, ''));
      if (!parsed.transactions.length) {
        results.push({ file: f.name, error: 'No transactions found. Is this a bank CSV export?' });
        continue;
      }
      const id = slug(parsed.accountName);
      let acct = S.accounts.find((a) => a.id === id);
      if (!acct) {
        acct = { id, name: parsed.accountName, type: guessAccountType(parsed.accountName) };
        await store.putAll('accounts', [acct]);
        S.accounts.push(acct);
      }
      const m = mergeImport(S.txns, id, parsed.transactions);
      const added = m.toAdd.map((r) => ({ ...r, id: uuid(), accountId: id, category: null, note: '' }));
      await store.deleteKeys('transactions', m.deleteIds);
      await store.putAll('transactions', added);
      const gone = new Set(m.deleteIds);
      S.txns = S.txns.filter((t) => !gone.has(t.id)).concat(added);
      results.push({ file: f.name, account: acct.name, added: m.added, duplicates: m.duplicates, pending: m.pendingReplaced, skipped: parsed.skipped });
    } catch (e) {
      results.push({ file: f.name, error: e.message || 'Could not read file' });
    }
  }
  S.results = results;
  recompute();
  try { await navigator.storage?.persist?.(); } catch { /* best effort */ }
  const ok = results.filter((r) => !r.error);
  toast(ok.length ? `Imported ${ok.reduce((s, r) => s + r.added, 0)} new transactions` : 'Nothing imported');
  render();
}

async function saveTxn(id, patch) {
  const t = S.txns.find((x) => x.id === id);
  Object.assign(t, patch);
  await store.putAll('transactions', [t]);
}

/* ---------- helpers ---------- */

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, 3500);
}

function periodSet() {
  const p = S.period;
  if (p === 'all') return new Set(S.months);
  if (p === 'last3') return new Set(lastMonths(S.months[S.months.length - 1], 3));
  if (p === 'last12') return new Set(lastMonths(S.months[S.months.length - 1], 12));
  return new Set([p.slice(2)]);
}

function prettyDesc(r) {
  if (r.isCheck) return r.checkNo ? `Check #${r.checkNo}` : 'Check';
  if (r.type === 'transfer') {
    const kind = r.link?.kind;
    if (kind === 'card-payment') return 'Credit card payment';
    if (kind === 'zelle') return r.amount > 0 ? 'Zelle received' : 'Zelle sent';
    return 'Transfer between accounts';
  }
  if (r.type === 'investment') return titleCase(r.merchant);
  const d = r.description
    .replace(/^(PURCHASE|RECURRING PAYMENT)\s+(AUTHORIZED\s+)?ON\s+\d{1,2}\/\d{1,2}\s*/i, '')
    .replace(/\s+S\d{9,}.*$/i, '')
    .replace(/\s+REF\s*#?\s*\w+/gi, '')
    .replace(/\s+ON\s+\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/i, '');
  return titleCase(d).slice(0, 64) || 'Transaction';
}

const sumBy = (rows, k) => rows.reduce((s, r) => s + r[k], 0);

const needsCategory = (r) => r.category === 'Uncategorized' && (r.type === 'spending' || r.type === 'refund');

function reviewBanner() {
  const n = S.rows.filter(needsCategory).length;
  if (!n) return '';
  return `<div class="banner row between"><span>${n} transaction${n === 1 ? '' : 's'} need a category.</span>
    <button class="btn small" data-view="review">Review</button></div>`;
}

/* ---------- views ---------- */

function emptyState() {
  return `<section class="card empty">
    <h2>Welcome to LocalFinance</h2>
    <p>Import the CSV files you download from your bank. They are read and stored only on this device and are never uploaded.</p>
    <label class="btn file-btn">Choose CSV files<input id="file-input" type="file" accept=".csv,text/csv" multiple></label>
    <p class="hint">Tip: import each account separately: every checking account and your credit card.</p>
  </section>`;
}

function overview() {
  if (!S.rows.length) return emptyState();
  const set = periodSet();
  const rows = S.rows.filter((r) => set.has(monthOf(r.date)));
  const income = sumBy(rows, 'income');
  const spending = sumBy(rows, 'spend');
  const invested = sumBy(rows, 'invested');
  const net = income - spending - invested;
  const latest = S.months[S.months.length - 1];
  const span = Math.min(12, (+latest.slice(0, 4) - +S.months[0].slice(0, 4)) * 12 + (+latest.slice(5) - +S.months[0].slice(5)) + 1);
  const trend = monthlySummary(S.rows, lastMonths(latest, span));

  const opts = [
    ['last3', 'Last 3 months'], ['last12', 'Last 12 months'], ['all', 'All time'],
    ...[...S.months].reverse().map((m) => ['m:' + m, monthLong(m)]),
  ].map(([v, l]) => `<option value="${v}"${v === S.period ? ' selected' : ''}>${l}</option>`).join('');

  const cats = categoryTotals(rows);
  const top = cats.slice(0, 8);
  const rest = cats.slice(8).reduce((s, c) => s + c.total, 0);
  const catItems = top.map((c) => ({ label: c.category, value: c.total, sub: `${((c.total / (spending || 1)) * 100).toFixed(0)}% of spending` }));
  if (rest > 0) catItems.push({ label: 'Other', value: rest });
  const unc = cats.find((c) => c.category === 'Uncategorized')?.total ?? 0;
  const merchants = topMerchants(rows, 8).map((m) => ({ label: titleCase(m.merchant), value: m.total, sub: `${m.count} transactions` }));
  const active = S.recurring.filter((r) => r.kind === 'expense' && r.active);
  const recurTotal = active.reduce((s, r) => s + r.monthlyCost, 0);
  const pending = rows.filter((r) => r.status === 'pending').length;

  return `
    <div class="row between">
      <label class="row">Period <select id="period" aria-label="Period">${opts}</select></label>
      ${pending ? `<span class="tag pending">${pending} pending included</span>` : ''}
    </div>
    ${reviewBanner()}
    <section class="kpis four" aria-label="Summary">
      <div class="kpi"><div class="label">Income</div><div class="value">${fmtMoney(income, { whole: true })}</div></div>
      <div class="kpi"><div class="label">Spending</div><div class="value">${fmtMoney(spending, { whole: true })}</div></div>
      <div class="kpi"><div class="label">Invested</div><div class="value">${fmtMoney(invested, { whole: true })}</div></div>
      <div class="kpi"><div class="label">Left over</div><div class="value ${net >= 0 ? 'pos' : 'neg'}">${fmtMoney(net, { sign: true, whole: true })}</div></div>
    </section>
    <section class="card">
      <h2>Income vs. spending</h2>
      <div class="legend"><span><i class="l1"></i>Income</span><span><i class="l2"></i>Spending</span></div>
      ${trendChart(trend, narrow.matches ? 360 : 640)}
      <details><summary>View as table</summary>
        <div class="scroll-x"><table class="t"><thead><tr><th>Month</th><th class="num">Income</th><th class="num">Spending</th><th class="num">Invested</th></tr></thead><tbody>
        ${[...trend].reverse().map((m) => `<tr><td>${monthLong(m.month)}</td><td class="num">${fmtMoney(m.income)}</td><td class="num">${fmtMoney(m.spending)}</td><td class="num">${fmtMoney(m.invested)}</td></tr>`).join('')}
        </tbody></table></div>
      </details>
      <p class="hint">Credit card payments, Zelle, and transfers between your accounts are not counted, so nothing is counted twice. Money moved to investments is shown separately and is not spending.</p>
    </section>
    <section class="card">
      <h2>Spending by category</h2>
      ${catItems.length ? barList(catItems) : '<p class="hint">No spending in this period.</p>'}
      ${unc > spending * 0.15 && unc > 0 ? '<p class="hint">Much of this is Uncategorized. <button class="btn small" data-view="review">Review by merchant</button></p>' : ''}
    </section>
    <section class="card">
      <h2>Top merchants</h2>
      ${merchants.length ? barList(merchants) : '<p class="hint">Nothing yet.</p>'}
    </section>
    <section class="card">
      <h2>Recurring</h2>
      <p>${active.length} active bills and subscriptions, about <b>${fmtMoney(recurTotal)}</b> per month.</p>
      <p class="hint"><button class="btn secondary small" data-view="recurring">See all recurring</button></p>
    </section>`;
}

function filteredRows() {
  const f = S.filter;
  const q = f.q.trim().toUpperCase();
  return S.rows.filter((r) => {
    if (f.account && r.accountId !== f.account) return false;
    if (f.category && r.category !== f.category) return false;
    if (f.kind === 'spending' && r.type !== 'spending') return false;
    if (f.kind === 'income' && r.type !== 'income') return false;
    if (f.kind === 'investments' && r.type !== 'investment') return false;
    if (f.kind === 'checks' && !r.isCheck) return false;
    if (f.kind === 'transfers' && r.type !== 'transfer') return false;
    if (f.kind === 'pending' && r.status !== 'pending') return false;
    if (q && !(`${r.description} ${r.note} ${r.checkNo} ${r.category}`.toUpperCase().includes(q))) return false;
    return true;
  });
}

function txRow(r) {
  const amtCls = r.type === 'income' || r.type === 'refund' ? 'pos' : '';
  const title = prettyDesc(r) + (r.isCheck && r.note ? ` · ${r.note}` : '');
  return `<li class="tx${r.type === 'transfer' ? ' dim' : ''}" data-action="open-tx" data-id="${esc(r.id)}" tabindex="0" role="button">
    <span class="name">${esc(title)}</span>
    <span class="amt ${amtCls}">${fmtMoney(r.amount, { sign: true })}</span>
    <span class="meta">
      <span>${fmtDate(r.date)}</span>
      <span class="tag">${esc(r.accountName)}</span>
      ${r.isCheck ? '<span class="tag check">&#10003; Check</span>' : ''}
      ${r.type === 'transfer' ? `<span class="tag transfer">${r.link?.kind === 'zelle' ? (r.amount > 0 ? 'Zelle in' : 'Zelle out') + ' · ' : ''}not counted</span>` : `<span class="tag${r.type === 'investment' ? ' invest' : ''}">${esc(r.category)}</span>`}
      ${r.status === 'pending' ? '<span class="tag pending">Pending</span>' : ''}
      ${r.note && !r.isCheck ? `<span>${esc(r.note)}</span>` : ''}
    </span>
  </li>`;
}

function txList() {
  const rows = filteredRows();
  const shown = rows.slice(0, S.filter.limit);
  if (!rows.length) return '<p class="hint">No matching transactions.</p>';
  return `<p class="hint">${rows.length} transactions</p><ul class="list">${shown.map(txRow).join('')}</ul>
    ${rows.length > shown.length ? '<p><button class="btn secondary" data-action="more">Show more</button></p>' : ''}`;
}

function transactions() {
  if (!S.rows.length) return emptyState();
  const f = S.filter;
  const kinds = [['all', 'All'], ['spending', 'Spending'], ['income', 'Income'], ['investments', 'Investments'], ['checks', 'Checks'], ['transfers', 'Transfers'], ['pending', 'Pending']];
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;
  return `${reviewBanner()}<section class="card">
    <div class="row">
      <input id="q" type="search" placeholder="Search" value="${esc(f.q)}" aria-label="Search">
      <select id="f-kind" aria-label="Type">${kinds.map(([v, l]) => opt(v, l, f.kind)).join('')}</select>
      <select id="f-account" aria-label="Account">${opt('', 'All accounts', f.account)}${S.accounts.map((a) => opt(a.id, a.name, f.account)).join('')}</select>
      <select id="f-category" aria-label="Category">${opt('', 'All categories', f.category)}${CATEGORIES.map((c) => opt(c, c, f.category)).join('')}</select>
    </div>
    <div id="txlist">${txList()}</div>
  </section>`;
}

function recurring() {
  if (!S.rows.length) return emptyState();
  const section = (title, list, hint) => !list.length ? '' : `<section class="card"><h2>${title}</h2>
    <div class="scroll-x"><table class="t"><thead><tr><th>Name</th><th>How often</th><th class="num">Amount</th><th>Next</th></tr></thead><tbody>
    ${list.map((r) => `<tr>
      <td>${esc(titleCase(r.merchant))}<br><span class="hint">${r.count} payments since ${fmtDate(r.firstDate)}</span></td>
      <td>${r.frequency}</td>
      <td class="num">${r.variable ? '~' : ''}${fmtMoney(r.typicalAmount)}</td>
      <td>${r.active ? fmtDate(r.nextDate) : '<span class="tag">Stopped?</span>'}</td></tr>`).join('')}
    </tbody></table></div>${hint ? `<p class="hint">${hint}</p>` : ''}</section>`;
  const exp = S.recurring.filter((r) => r.kind === 'expense');
  const total = exp.filter((r) => r.active).reduce((s, r) => s + r.monthlyCost, 0);
  return `
    <section class="kpis"><div class="kpi"><div class="label">Per month</div><div class="value">${fmtMoney(total, { whole: true })}</div></div>
    <div class="kpi"><div class="label">Per year</div><div class="value">${fmtMoney(total * 12, { whole: true })}</div></div>
    <div class="kpi"><div class="label">Active</div><div class="value">${exp.filter((r) => r.active).length}</div></div></section>
    ${section('Bills & subscriptions', exp.filter((r) => r.active), '"~" means the amount varies (like a utility bill).')}
    ${section('Recurring income', S.recurring.filter((r) => r.kind === 'income' && r.active), '')}
    ${section('Recurring investing', S.recurring.filter((r) => r.kind === 'investment' && r.active), 'Not counted as spending.')}
    ${section('Seems to have stopped', S.recurring.filter((r) => !r.active), '')}
    ${S.recurring.length ? '' : '<section class="card empty"><p>No recurring payments found yet. Detection needs at least 3 occurrences, so import more history (up to 25 months) for better results.</p></section>'}
    <p class="hint">Checks are not included because they have no merchant name.</p>`;
}

function dataView() {
  const accts = S.accounts.map((a) => {
    const mine = S.txns.filter((t) => t.accountId === a.id);
    const dates = mine.map((t) => t.date).sort();
    return `<div class="acct">
      <b>${esc(a.name)}</b>
      <select data-action="acct-type" data-id="${esc(a.id)}" aria-label="Account type">
        <option value="checking"${a.type === 'checking' ? ' selected' : ''}>Checking</option>
        <option value="credit"${a.type === 'credit' ? ' selected' : ''}>Credit card</option>
      </select>
      <span class="sub">${mine.length} transactions${dates.length ? ` · ${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}` : ''}
        · <a href="#" data-action="del-acct" data-id="${esc(a.id)}">Remove</a></span>
    </div>`;
  }).join('');
  const results = S.results.length ? `<ul class="results">${S.results.map((r) => r.error
    ? `<li class="neg">${esc(r.file)}: ${esc(r.error)}</li>`
    : `<li><b>${esc(r.account)}</b>: ${r.added} new, ${r.duplicates} already imported${r.pending ? `, ${r.pending} pending refreshed` : ''}${r.skipped ? `, ${r.skipped} unreadable rows skipped` : ''}</li>`).join('')}</ul>` : '';
  const rules = S.rules.map((r, i) => `<li class="row between"><span>"${esc(r.match)}" → ${esc(r.category)}</span>
    <button class="btn secondary small" data-action="del-rule" data-i="${i}">Delete</button></li>`).join('');
  return `
    ${S.persistent ? '' : '<div class="banner warn">This browser is blocking local storage (private mode?). Data will be lost when you close the page.</div>'}
    <section class="card">
      <h2>Import bank CSV files</h2>
      <p>Choose one or more files. Account names come from the first line of each file. Re-importing overlapping dates is safe: duplicates are skipped and pending items are refreshed.</p>
      <p class="row"><label class="btn file-btn">Choose CSV files<input id="file-input" type="file" accept=".csv,text/csv" multiple></label></p>
      ${results}
    </section>
    <section class="card"><h2>Accounts</h2>${accts || '<p class="hint">No accounts yet.</p>'}
      <p class="hint">Set each account's type correctly: card payments are matched against Credit card accounts.</p></section>
    <section class="card"><h2>Category rules</h2>
      ${rules ? `<ul class="list">${rules}</ul>` : '<p class="hint">None yet. Tap a transaction in Activity and choose "always" to create one.</p>'}</section>
    <section class="card"><h2>Backup &amp; restore</h2>
      <p>Your data exists only in this browser. Browsers can clear storage, so save a backup file now and then (for example to iCloud Drive). The file is never uploaded; you choose where it goes.</p>
      <p class="row"><button class="btn" data-action="export">Save backup</button>
      <label class="btn secondary file-btn">Restore backup<input id="restore-input" type="file" accept=".json,application/json"></label></p>
      <p class="hint">Backups contain your transactions. Keep them out of any Git repository (the .gitignore already blocks them).</p>
    </section>
    <section class="card"><h2>Delete everything</h2>
      <p class="hint">Removes all accounts, transactions and rules from this device.</p>
      <p><button class="btn danger" data-action="wipe">Delete all data</button></p></section>`;
}

const VIEWS = { overview, transactions, recurring, review, data: dataView };

function render() {
  document.querySelectorAll('.tab').forEach((b) => {
    const current = S.view === 'review' ? 'transactions' : S.view; // Review lives under Activity
    if (b.dataset.view === current) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  view.innerHTML = VIEWS[S.view]();
  hideTip();
}

/* ---------- review by merchant ---------- */

function reviewGroups() {
  const m = new Map();
  for (const r of S.rows) {
    if (!needsCategory(r)) continue;
    const key = merchantGroup(r.merchant);
    if (key === 'UNKNOWN') continue;
    const g = m.get(key) ?? { key, rows: [], total: 0 };
    g.rows.push(r);
    g.total += r.spend;
    m.set(key, g);
  }
  return [...m.values()].sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

/** Most common category among already-categorized merchants that share the first word. */
function suggestFor(key) {
  const first = key.split(' ')[0];
  if (first.length < 3) return '';
  const counts = new Map();
  for (const r of S.rows) {
    if (r.category === 'Uncategorized' || r.type === 'income') continue;
    if (merchantGroup(r.merchant).split(' ')[0] === first) counts.set(r.category, (counts.get(r.category) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

function review() {
  if (!S.rows.length) return emptyState();
  const all = reviewGroups();
  const todo = all.filter((g) => !S.skipped.has(g.key));
  const fi = todo.findIndex((g) => g.key === S.focusKey); // after Undo, show that merchant again first
  if (fi > 0) todo.unshift(...todo.splice(fi, 1));
  const left = all.reduce((s, g) => s + g.rows.length, 0);
  const undo = S.reviewStack.length ? '<button class="btn secondary small" data-action="review-undo">Undo last</button>' : '';
  const head = `<div class="row between"><button class="btn secondary small" data-view="transactions">← Activity</button>${undo}</div>`;
  if (!all.length) return `${head}<section class="card empty"><h2>All caught up</h2><p>Every transaction has a category.</p></section>`;
  if (!todo.length) {
    return `${head}<section class="card empty"><h2>${all.length} skipped</h2><p>${left} transactions still need a category.</p>
      <button class="btn" data-action="review-unskip">Review the skipped ones</button></section>`;
  }
  const g = todo[0];
  const sug = suggestFor(g.key);
  const n = g.rows.length;
  const cats = CATEGORIES.filter((c) => c !== 'Uncategorized' && c !== 'Checks');
  return `${head}<section class="card review" data-key="${esc(g.key)}">
    <p class="hint">${todo.length} merchant${todo.length === 1 ? '' : 's'} left · ${left} transactions</p>
    <h2 class="rname">${esc(titleCase(g.key))}</h2>
    <p><b>${n}</b> transaction${n === 1 ? '' : 's'} · <b>${fmtMoney(g.total)}</b> · ${fmtDate(g.rows[n - 1].date)} to ${fmtDate(g.rows[0].date)}</p>
    <ul class="list compact">${g.rows.slice(0, 4).map((r) => `<li><span>${esc(prettyDesc(r))}</span><span>${fmtMoney(r.amount)}</span></li>`).join('')}</ul>
    <div class="cats">${cats.map((c) => `<button class="btn secondary cat${c === sug ? ' suggest' : ''}" data-action="review-pick" data-cat="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <p class="row between"><button class="btn secondary" data-action="review-skip">Skip</button>
      <span class="hint">${sug ? `Suggested: ${esc(sug)}` : 'Applies to all of them and to future imports'}</span></p>
  </section>`;
}

async function setRule(match, category) {
  const prev = S.rules.find((r) => r.match === match && r.mode === 'prefix') ?? null;
  S.rules = S.rules.filter((r) => r !== prev).concat({ match, category, mode: 'prefix' });
  await store.setMeta('rules', S.rules);
  return prev;
}

/* ---------- edit dialog ---------- */

function openTx(id) {
  const r = S.rows.find((x) => x.id === id);
  if (!r) return;
  const dlg = $('#dlg');
  const manual = S.txns.find((t) => t.id === id).category;
  const canRule = !r.isCheck && r.type !== 'transfer' && r.merchant !== 'UNKNOWN';
  const cats = CATEGORIES.filter((c) => c !== 'Uncategorized');
  let info = '';
  if (r.type === 'transfer') {
    const kind = r.link?.kind;
    info = kind === 'zelle'
      ? `<p>Zelle ${r.amount > 0 ? 'received (sent to you)' : 'sent (to someone else)'}. Zelle is treated as a transfer and is not counted as income or spending. Pick a category below if this one really is.</p>`
      : kind === 'card-payment'
        ? '<p>Credit card payment. Not counted, because the purchases it pays for are counted on the card.</p>'
        : `<p>Transfer between accounts${r.link?.pairedId ? ' (matched with its other side)' : ' (other side not imported)'}. Not counted as spending or income.</p>`;
  } else if (r.type === 'investment') info = '<p>Counted as invested money, not as spending.</p>';
  dlg.innerHTML = `<form id="txform" data-id="${esc(id)}">
    <h2>${esc(prettyDesc(r))}</h2>
    <p class="hint">${fmtDate(r.date)} · ${esc(r.accountName)} · ${fmtMoney(r.amount, { sign: true })}${r.status === 'pending' ? ' · Pending' : ''}<br>${esc(r.description)}</p>
    ${info}
    <label>Category<select name="category"><option value="">Automatic (${esc(r.category)})</option>${cats.map((c) => `<option${manual === c ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
    <label>${r.isCheck ? 'Payee / memo for this check' : 'Note'}<input type="text" name="note" value="${esc(r.note)}" maxlength="80" placeholder="${r.isCheck ? 'e.g. Landlord' : ''}"></label>
    ${canRule ? `<label class="inline"><input type="checkbox" name="rule"> Always use this category for "${esc(titleCase(merchantGroup(r.merchant)))}"</label>` : ''}
    <div class="row between"><button type="button" class="btn secondary" data-action="close-dlg">Cancel</button><button class="btn" type="submit">Save</button></div>
  </form>`;
  dlg.showModal();
}

async function submitTx(form) {
  const id = form.dataset.id;
  const fd = new FormData(form);
  const category = fd.get('category') || null;
  const note = String(fd.get('note') || '').trim();
  const row = S.rows.find((x) => x.id === id);
  if (fd.get('rule') && category) {
    await setRule(merchantGroup(row.merchant), category);
    await saveTxn(id, { category: null, note });
  } else {
    await saveTxn(id, { category, note });
  }
  $('#dlg').close();
  recompute();
  S.view === 'transactions' ? ($('#txlist').innerHTML = txList()) : render();
}

/* ---------- tooltips ---------- */

const tip = $('#tip');
function showTip(el, e) {
  const [head, ...lines] = el.dataset.tip.split('|');
  tip.replaceChildren();
  const b = document.createElement('b');
  b.textContent = head;
  tip.append(b, ...lines.map((l) => { const d = document.createElement('div'); d.textContent = l; return d; }));
  tip.hidden = false;
  const w = tip.offsetWidth;
  tip.style.left = Math.max(8, Math.min(e.clientX + 12, window.innerWidth - w - 8)) + 'px';
  tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 12) + 'px';
}
function hideTip() { tip.hidden = true; }

/* ---------- events ---------- */

document.addEventListener('pointerover', (e) => {
  const el = e.target.closest?.('[data-tip]');
  if (el) showTip(el, e); else hideTip();
});
document.addEventListener('scroll', hideTip, true);

/** In-page confirmation (native confirm() is silently blocked in some browsers / Home Screen apps). */
function askConfirm(message, okLabel = 'Delete') {
  return new Promise((resolve) => {
    const dlg = $('#dlg');
    dlg.innerHTML = `<form id="confirmform">
      <h2>Are you sure?</h2><p>${esc(message)}</p>
      <div class="row between"><button type="button" class="btn secondary" data-action="close-dlg">Cancel</button>
      <button class="btn danger" type="submit">${esc(okLabel)}</button></div></form>`;
    dlg.returnValue = '';
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    dlg.showModal();
  });
}

document.addEventListener('click', async (e) => {
  const v = e.target.closest('[data-view]');
  if (v) { S.view = v.dataset.view; render(); window.scrollTo(0, 0); return; }
  const a = e.target.closest('[data-action]');
  if (!a) { if (!e.target.closest('[data-tip]')) hideTip(); return; }
  const act = a.dataset.action;
  if (act === 'open-tx') openTx(a.dataset.id);
  else if (act === 'close-dlg') $('#dlg').close();
  else if (act === 'more') { S.filter.limit += 100; $('#txlist').innerHTML = txList(); }
  else if (act === 'export') exportBackup();
  else if (act === 'review-pick') {
    const key = a.closest('[data-key]').dataset.key;
    const prev = await setRule(key, a.dataset.cat);
    S.focusKey = '';
    S.reviewStack.push({ key, prev });
    recompute(); render(); window.scrollTo(0, 0);
  } else if (act === 'review-skip') {
    S.skipped.add(a.closest('[data-key]').dataset.key);
    render(); window.scrollTo(0, 0);
  } else if (act === 'review-unskip') { S.skipped.clear(); render(); }
  else if (act === 'review-undo') {
    const { key, prev } = S.reviewStack.pop();
    S.rules = S.rules.filter((r) => !(r.match === key && r.mode === 'prefix'));
    if (prev) S.rules.push(prev);
    await store.setMeta('rules', S.rules);
    S.focusKey = key; S.skipped.delete(key);
    recompute(); render(); window.scrollTo(0, 0);
  }
  else if (act === 'del-rule') {
    S.rules.splice(+a.dataset.i, 1);
    store.setMeta('rules', S.rules).then(() => { recompute(); render(); });
  } else if (act === 'del-acct') {
    e.preventDefault();
    const acct = S.accounts.find((x) => x.id === a.dataset.id);
    if (await askConfirm(`Remove "${acct.name}" and all of its transactions from this device?`, 'Remove')) await removeAccount(acct.id);
  } else if (act === 'wipe') {
    if (await askConfirm('Delete ALL accounts, transactions and rules from this device? This cannot be undone.', 'Delete everything')) await wipe();
  }
});

document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.tx')) { e.preventDefault(); openTx(e.target.dataset.id); }
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  if (e.target.id === 'txform') submitTx(e.target);
  else if (e.target.id === 'confirmform') $('#dlg').close('ok');
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.id === 'file-input') { const files = [...t.files]; t.value = ''; if (files.length) await importFiles(files); }
  else if (t.id === 'restore-input') { const f = t.files[0]; t.value = ''; if (f) await restore(f); }
  else if (t.id === 'period') { S.period = t.value; render(); }
  else if (t.id === 'f-kind') { S.filter.kind = t.value; S.filter.limit = 100; $('#txlist').innerHTML = txList(); }
  else if (t.id === 'f-account') { S.filter.account = t.value; S.filter.limit = 100; $('#txlist').innerHTML = txList(); }
  else if (t.id === 'f-category') { S.filter.category = t.value; S.filter.limit = 100; $('#txlist').innerHTML = txList(); }
  else if (t.dataset.action === 'acct-type') {
    const acct = S.accounts.find((x) => x.id === t.dataset.id);
    acct.type = t.value;
    await store.putAll('accounts', [acct]);
    recompute(); render();
  }
});

document.addEventListener('input', (e) => {
  if (e.target.id === 'q') { S.filter.q = e.target.value; S.filter.limit = 100; $('#txlist').innerHTML = txList(); }
});

/* ---------- backup / maintenance ---------- */

async function exportBackup() {
  const data = await store.exportBackup();
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `localfinance-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function restore(file) {
  try {
    const data = JSON.parse(await file.text());
    store.validateBackup(data); // reject wrong files before asking to replace anything
    if (S.txns.length && !(await askConfirm('Replace the data currently on this device with this backup?', 'Replace'))) return;
    await store.importBackup(data);
    await load();
    toast('Backup restored');
    S.view = 'overview';
    render();
  } catch (err) {
    toast(err.message || 'Could not restore that file');
  }
}

async function removeAccount(id) {
  await store.deleteKeys('transactions', S.txns.filter((t) => t.accountId === id).map((t) => t.id));
  await store.deleteKeys('accounts', [id]);
  S.accounts = S.accounts.filter((a) => a.id !== id);
  S.txns = S.txns.filter((t) => t.accountId !== id);
  recompute(); render();
}

async function wipe() {
  await store.clearAll();
  S.accounts = []; S.txns = []; S.rules = []; S.results = []; S.skipped.clear(); S.reviewStack = [];
  recompute(); render();
  toast('All data deleted');
}

async function load() {
  S.accounts = await store.getAll('accounts');
  S.txns = await store.getAll('transactions');
  S.rules = await store.getMeta('rules', []);
  recompute();
}

/* ---------- start ---------- */

(async function main() {
  S.persistent = await store.init();
  await load();
  if (!S.rows.length) S.view = 'data';
  render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* offline cache is optional */ });
  }
})();
