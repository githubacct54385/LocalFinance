// Detect money moving between your own accounts so it is not counted as spending or income.
//
// 1. Credit card payments. In checking they look like
//      "ONLINE TRANSFER REF #... TO WELLS FARGO ... VISA ... XXXXXXXXXXXX1234 ON 11/05/26"
//    and on the card they show up as a positive amount. We pair the two by equal amount and
//    a date window. A checking-side card payment with no matching card row (card file not
//    imported, or older than its history) is still a transfer: the purchases it pays for are
//    counted when they happen, on the card.
// 2. Transfers between checking accounts: opposite equal amounts, description mentions
//    TRANSFER, within a few days.
//
// Returns Map<txnId, {kind: 'card-payment'|'transfer', pairedId: string|null}>.

import { isoToDays } from './util.js';

export const CARD_PAYMENT_RE = /\b(TRANSFER|PAYMENT|PMT)\b.*\bWELLS FARGO\b.*\b(VISA|CARD|CREDIT|MASTERCARD)\b/i;
export const CARD_RECEIVED_RE = /\b(PAYMENT|PMT)\b.*\b(THANK YOU|RECEIVED)\b|^(ONLINE|MOBILE|AUTOMATIC)?\s*PAYMENT\b/i;
const CARD_WINDOW_DAYS = 7;
const TRANSFER_WINDOW_DAYS = 3;

export function detectTransfers(txns, accounts) {
  const type = new Map(accounts.map((a) => [a.id, a.type]));
  const isCredit = (t) => type.get(t.accountId) === 'credit';
  const links = new Map();
  const taken = new Set();

  // Positive rows anywhere can be the receiving side of a card payment, so a card account that
  // was mistakenly typed as "Checking" still pairs up. Same-account matches are rejected below.
  const credits = txns.filter((t) => isCredit(t) && t.amount > 0);
  const byAmount = new Map();
  for (const c of txns) {
    if (c.amount <= 0) continue;
    if (!byAmount.has(c.amount)) byAmount.set(c.amount, []);
    byAmount.get(c.amount).push(c);
  }

  const nearest = (list, t, windowDays, accept = () => true) => {
    let best = null;
    let bestGap = Infinity;
    const td = isoToDays(t.date);
    for (const c of list ?? []) {
      if (taken.has(c.id) || !accept(c)) continue;
      const gap = Math.abs(isoToDays(c.date) - td);
      if (gap <= windowDays && gap < bestGap) { best = c; bestGap = gap; }
    }
    return best;
  };

  const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));

  // 1. checking-side card payments
  for (const t of sorted) {
    if (isCredit(t) || t.amount >= 0 || !CARD_PAYMENT_RE.test(t.description)) continue;
    const mate = nearest(byAmount.get(-t.amount), t, CARD_WINDOW_DAYS, (c) => c.accountId !== t.accountId);
    taken.add(t.id);
    links.set(t.id, { kind: 'card-payment', pairedId: mate?.id ?? null });
    if (mate) {
      taken.add(mate.id);
      links.set(mate.id, { kind: 'card-payment', pairedId: t.id });
    }
  }

  // card-side payments whose checking row isn't imported
  for (const c of credits) {
    if (!taken.has(c.id) && CARD_RECEIVED_RE.test(c.description)) {
      taken.add(c.id);
      links.set(c.id, { kind: 'card-payment', pairedId: null });
    }
  }

  // 2. checking <-> checking transfers
  const inflows = new Map();
  for (const t of txns) {
    if (isCredit(t) || t.amount <= 0) continue;
    if (!inflows.has(t.amount)) inflows.set(t.amount, []);
    inflows.get(t.amount).push(t);
  }
  for (const t of sorted) {
    if (taken.has(t.id) || isCredit(t) || t.amount >= 0 || !/\bTRANSFER\b/i.test(t.description)) continue;
    const mate = nearest(inflows.get(-t.amount), t, TRANSFER_WINDOW_DAYS, (c) => c.accountId !== t.accountId);
    taken.add(t.id);
    links.set(t.id, { kind: 'transfer', pairedId: mate?.id ?? null });
    if (mate) {
      taken.add(mate.id);
      links.set(mate.id, { kind: 'transfer', pairedId: t.id });
    }
  }

  // Inbound transfers whose other side isn't imported (e.g. from savings) are not income.
  for (const t of txns) {
    if (!taken.has(t.id) && !isCredit(t) && t.amount > 0 && /\bTRANSFER\b/i.test(t.description)) {
      links.set(t.id, { kind: 'transfer', pairedId: null });
    }
  }
  return links;
}
