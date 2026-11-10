// Merge freshly parsed rows into an account's existing transactions.
//
// Wells Fargo exports have no transaction id, so posted rows are de-duplicated on
// account + date + amount + description + check #, with an occurrence counter so two
// genuinely identical charges on one day are both kept.
//
// Pending rows are always replaced: when re-importing, existing pending rows dated on or
// after the earliest date in the file are removed and re-added from the file. That is how a
// pending charge turns into a posted one without duplicating.

const norm = (s) => s.trim().replace(/\s+/g, ' ').toUpperCase();

export function baseKey(accountId, row) {
  return [accountId, row.date, row.amount, norm(row.description), row.checkNo || ''].join('|');
}

/**
 * @param {Array} existing  all stored transactions (any account)
 * @param {string} accountId
 * @param {Array} rows      parsed rows from parseStatement
 * @returns {{toAdd: Array, deleteIds: string[], added: number, duplicates: number, pendingReplaced: number}}
 */
export function mergeImport(existing, accountId, rows) {
  const mine = existing.filter((t) => t.accountId === accountId);
  const minDate = rows.reduce((m, r) => (r.date < m ? r.date : m), '9999-99-99');

  const deleteIds = mine
    .filter((t) => t.status === 'pending' && t.date >= minDate)
    .map((t) => t.id);
  const deleted = new Set(deleteIds);

  const seen = new Set(mine.filter((t) => !deleted.has(t.id)).map((t) => t.key));
  const counters = new Map();
  const toAdd = [];
  let duplicates = 0;

  for (const r of rows) {
    const base = baseKey(accountId, r);
    const n = (counters.get(base) ?? 0) + 1;
    counters.set(base, n);
    const key = `${base}|${n}`;
    if (r.status === 'posted' && seen.has(key)) { duplicates++; continue; }
    toAdd.push({ ...r, key });
  }
  return { toAdd, deleteIds, added: toAdd.length, duplicates, pendingReplaced: deleteIds.length };
}
