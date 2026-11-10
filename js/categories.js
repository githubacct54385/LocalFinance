// Merchant normalization and rule-based categorization.
// Default keywords are generic public brand names. Your own rules live in browser storage,
// never in this repository.

export const CATEGORIES = [
  'Groceries', 'Dining', 'Gas & Auto', 'Transport', 'Shopping', 'Entertainment', 'Subscriptions',
  'Utilities', 'Housing', 'Health', 'Insurance', 'Travel', 'Fees', 'Cash', 'Checks',
  'Income', 'Transfer', 'Uncategorized',
];

const DEFAULT_RULES = [
  ['Subscriptions', ['NETFLIX', 'SPOTIFY', 'HULU', 'DISNEY', 'ICLOUD', 'APPLE.COM/BILL', 'YOUTUBE', 'HBO', 'PRIME VIDEO', 'ADOBE', 'DROPBOX', 'PATREON']],
  ['Dining', ['STARBUCKS', 'DUNKIN', 'MCDONALD', 'CHIPOTLE', 'SUBWAY', 'PIZZA', 'RESTAURANT', 'CAFE', 'COFFEE', 'DOORDASH', 'GRUBHUB', 'UBER EATS', 'TACO', 'BURGER', 'DINER', 'GRILL']],
  ['Groceries', ['SAFEWAY', 'KROGER', 'TRADER JOE', 'WHOLE FOODS', 'ALDI', 'PUBLIX', 'WEGMANS', 'SPROUTS', 'GROCERY', 'FOOD LION', 'H-E-B']],
  ['Gas & Auto', ['SHELL', 'CHEVRON', 'EXXON', 'SUNOCO', 'VALERO', 'FUEL', 'AUTOZONE', 'JIFFY LUBE', 'PARKING']],
  ['Transport', ['UBER', 'LYFT', 'TRANSIT', 'AMTRAK']],
  ['Shopping', ['AMAZON', 'AMZN', 'TARGET', 'WALMART', 'COSTCO', 'BEST BUY', 'HOME DEPOT', 'LOWES', 'IKEA', 'EBAY', 'ETSY']],
  ['Utilities', ['ELECTRIC', 'WATER', 'POWER', 'UTILITY', 'COMCAST', 'XFINITY', 'SPECTRUM', 'VERIZON', 'AT&T', 'T-MOBILE', 'INTERNET', 'ENERGY']],
  ['Housing', ['RENT', 'MORTGAGE', 'HOA ', 'PROPERTY MGMT']],
  ['Health', ['PHARMACY', 'CVS', 'WALGREENS', 'DENTAL', 'DOCTOR', 'MEDICAL', 'HOSPITAL', 'CLINIC', 'GYM', 'FITNESS']],
  ['Insurance', ['INSURANCE', 'GEICO', 'STATE FARM', 'PROGRESSIVE', 'ALLSTATE']],
  ['Travel', ['AIRLINES', 'DELTA AIR', 'UNITED AIR', 'SOUTHWEST', 'AIRBNB', 'HOTEL', 'MARRIOTT', 'HILTON', 'EXPEDIA']],
  ['Entertainment', ['CINEMA', 'AMC ', 'THEATER', 'THEATRE', 'TICKETMASTER', 'STEAM', 'PLAYSTATION', 'NINTENDO']],
  ['Fees', ['OVERDRAFT', 'INTEREST CHARGE', 'ANNUAL FEE', 'SERVICE FEE', 'MONTHLY FEE']],
  ['Cash', ['ATM ', 'CASH WITHDRAWAL']],
];

/** Collapse a raw bank description to a stable merchant key. */
export function normalizeMerchant(desc) {
  let s = String(desc).toUpperCase();
  s = s.replace(/^(PURCHASE|RECURRING PAYMENT|RECURRING)\s+(AUTHORIZED\s+)?ON\s+\d{1,2}\/\d{1,2}\s*/, '');
  s = s.replace(/\b(POS|DEBIT|CHECKCARD|PURCHASE)\b/g, ' ');
  s = s.replace(/\bREF\s*#?\s*\w+/g, ' ');
  s = s.replace(/\bCARD\s+\d{4}\b/g, ' ');
  s = s.replace(/\d{1,2}\/\d{1,2}(\/\d{2,4})?/g, ' ');
  s = s.replace(/[#*]\s*\w*\d\w*/g, ' ');
  s = s.replace(/\b[A-Z]*\d[A-Z\d]{3,}\b/g, ' ');
  s = s.replace(/\b\d+\b/g, ' ');
  s = s.replace(/[^A-Z&' ]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.split(' ').slice(0, 3).join(' ').replace(/\s*&$/, '') || 'UNKNOWN';
}

/**
 * @param {string} desc
 * @param {Array<{match: string, category: string}>} userRules  checked first
 * @param {string} [checkNo]
 */
export function categorize(desc, userRules = [], checkNo = '') {
  const d = String(desc).toUpperCase();
  const merchant = normalizeMerchant(desc);
  for (const r of userRules) {
    const m = r.match.toUpperCase();
    if (d.includes(m) || merchant.includes(m)) return r.category;
  }
  if (checkNo) return 'Checks';
  for (const [cat, words] of DEFAULT_RULES) {
    if (words.some((w) => d.includes(w))) return cat;
  }
  return 'Uncategorized';
}
