// Merchant normalization and rule-based categorization.
// Default keywords are generic public brand names. Your own rules live in browser storage,
// never in this repository.

export const CATEGORIES = [
  'Groceries', 'Dining', 'Gas & Auto', 'Transport', 'Shopping', 'Entertainment', 'Subscriptions',
  'Utilities', 'Housing', 'Health', 'Insurance', 'Travel', 'Kids & Activities', 'Personal Care', 'Education',
  'Gifts & Donations', 'Pets', 'Fees', 'Cash', 'Checks',
  'Investments', 'Income', 'Transfer', 'Uncategorized',
];

// Order matters: first match wins. Investments goes first so "TRANSFER TO SCHWAB" is not
// mistaken for a plain transfer.
const DEFAULT_RULES = [
  ['Investments', ['SCHWAB', 'FIDELITY', 'VANGUARD', 'ROBINHOOD', 'ACORNS', 'COINBASE', 'WEALTHFRONT', 'BETTERMENT',
    'ETRADE', 'E*TRADE', 'TD AMERITRADE', 'MERRILL', 'WEBULL', 'M1 FINANCE', 'STASH INVEST', 'MONEYLINK', 'BROKERAGE',
    '401K', 'IRA CONTRIB', 'TIAA', 'T. ROWE', 'T ROWE PRICE', 'INTERACTIVE BROKERS']],
  ['Subscriptions', ['NETFLIX', 'SPOTIFY', 'HULU', 'DISNEY', 'ICLOUD', 'APPLE.COM/BILL', 'YOUTUBE', 'HBO', 'PRIME VIDEO',
    'ADOBE', 'DROPBOX', 'PATREON', 'AUDIBLE', 'PEACOCK', 'PARAMOUNT', 'CRUNCHYROLL', 'NYTIMES', 'WSJ', 'GOOGLE ONE',
    'MICROSOFT 365', 'OPENAI', 'CHATGPT', 'ANTHROPIC', 'GITHUB', 'NOTION', '1PASSWORD', 'NORDVPN', 'EXPRESSVPN',
    'PELOTON', 'SIRIUS', 'PANDORA', 'TIDAL', 'SUBSTACK', 'GAME PASS']],
  ['Dining', ['STARBUCKS', 'DUNKIN', 'MCDONALD', 'CHIPOTLE', 'SUBWAY', 'PIZZA', 'RESTAURANT', 'CAFE', 'COFFEE', 'DOORDASH',
    'GRUBHUB', 'UBER EATS', 'TACO', 'BURGER', 'DINER', 'GRILL', 'CHICK-FIL-A', 'WENDY', 'PANERA', 'DOMINO', 'PAPA JOHN',
    'KFC', 'SHAKE SHACK', 'FIVE GUYS', 'IN-N-OUT', 'PANDA EXPRESS', 'BAKERY', 'BREWING', 'BREWERY', 'TAVERN', 'SUSHI',
    'THAI ', 'KITCHEN', 'EATERY', 'BISTRO', 'DELI ', 'BBQ', 'STEAKHOUSE', 'POSTMATES', 'SQ *']],
  ['Groceries', ['SAFEWAY', 'KROGER', 'TRADER JOE', 'WHOLE FOODS', 'ALDI', 'PUBLIX', 'WEGMANS', 'SPROUTS', 'GROCERY',
    'FOOD LION', 'H-E-B', 'SUPERMARKET', 'GIANT', 'STOP & SHOP', 'HARRIS TEETER', 'MEIJER', 'WINCO', 'LIDL',
    'FOOD 4 LESS', 'INSTACART', 'SAVE-A-LOT', 'FRESH MARKET']],
  ['Gas & Auto', ['SHELL', 'CHEVRON', 'EXXON', 'SUNOCO', 'VALERO', 'FUEL', 'AUTOZONE', 'JIFFY LUBE', 'PARKING', 'CITGO',
    'MARATHON PETRO', 'SPEEDWAY', 'WAWA', 'SHEETZ', 'CIRCLE K', '7-ELEVEN', 'CASEYS', 'QUIKTRIP', 'RACETRAC',
    'E-ZPASS', 'EZPASS', 'TOLL', 'DMV', 'CAR WASH', 'TIRE', "O'REILLY", 'ADVANCE AUTO', 'PEP BOYS']],
  ['Transport', ['UBER', 'LYFT', 'TRANSIT', 'AMTRAK', 'MTA ', 'BART ', 'CLIPPER', 'CITIBIKE']],
  ['Pets', ['CHEWY', 'PETCO', 'PETSMART', 'VETERIN', 'ANIMAL HOSP']],
  ['Shopping', ['AMAZON', 'AMZN', 'TARGET', 'WALMART', 'WAL-MART', 'COSTCO', 'BEST BUY', 'HOME DEPOT', 'LOWES', 'IKEA',
    'EBAY', 'ETSY', 'KOHLS', 'MACY', 'NORDSTROM', 'TJ MAXX', 'MARSHALLS', 'OLD NAVY', 'NIKE', 'ADIDAS', 'APPLE STORE',
    'WAYFAIR', 'DOLLAR TREE', 'DOLLAR GENERAL', 'BED BATH', 'MICHAELS', 'HOBBY LOBBY', 'STAPLES', 'OFFICE DEPOT',
    'TEMU', 'SHEIN']],
  ['Utilities', ['ELECTRIC', 'WATER', 'POWER', 'UTILITY', 'COMCAST', 'XFINITY', 'SPECTRUM', 'VERIZON', 'AT&T', 'T-MOBILE',
    'INTERNET', 'ENERGY', 'WASTE', 'SEWER', 'NATIONAL GRID', 'CON ED', 'PG&E', 'FRONTIER COMM', 'CENTURYLINK',
    'OPTIMUM', 'COX COMM', 'DISH NETWORK', 'DIRECTV', 'MINT MOBILE', 'VISIBLE', 'GOOGLE FI', 'CRICKET WIRELESS']],
  ['Housing', ['RENT', 'MORTGAGE', 'HOA ', 'PROPERTY MGMT', 'PROPERTY MANAGEMENT', 'LEASE', 'APARTMENT', 'REALTY', 'LANDLORD']],
  // Before Health/Education so "GYMNASTICS" and "AFTER SCHOOL" are not mistaken for a gym or school.
  ['Kids & Activities', ['SOCCER', 'SUMMER CAMP', 'DAY CAMP', 'AFTER SCHOOL', 'AFTERSCHOOL', 'AFTER-SCHOOL', 'LITTLE LEAGUE',
    'GYMNASTICS', 'GYMBOREE', 'KARATE', 'TAEKWONDO', 'DANCE STUDIO', 'SWIM LESSON', 'SWIM SCHOOL', 'MUSIC LESSON',
    'KUMON', 'MATHNASIUM', 'CHILDCARE', 'CHILD CARE', 'DAYCARE', 'KINDERCARE', 'BRIGHT HORIZONS', 'GIRL SCOUT',
    'BOY SCOUT', 'YOUTH SPORTS', 'SPORTS CAMP', 'RECREATION CENTER REG']],
  ['Health', ['PHARMACY', 'CVS', 'WALGREENS', 'DENTAL', 'DOCTOR', 'MEDICAL', 'HOSPITAL', 'CLINIC', 'GYM', 'FITNESS',
    'URGENT CARE', 'OPTOM', 'LABCORP', 'QUEST DIAG', 'THERAPY', 'DERMATOLOG', 'YMCA', 'ORANGETHEORY', 'ANYTIME FITNESS']],
  ['Insurance', ['INSURANCE', 'GEICO', 'STATE FARM', 'PROGRESSIVE', 'ALLSTATE', 'LIBERTY MUTUAL', 'USAA', 'NATIONWIDE', 'TRAVELERS']],
  ['Travel', ['AIRLINES', 'DELTA AIR', 'UNITED AIR', 'SOUTHWEST', 'AIRBNB', 'HOTEL', 'MARRIOTT', 'HILTON', 'EXPEDIA',
    'JETBLUE', 'AMERICAN AIR', 'ALASKA AIR', 'SPIRIT AIR', 'BOOKING.COM', 'VRBO', 'KAYAK', 'HERTZ', 'AVIS', 'ENTERPRISE RENT']],
  ['Personal Care', [' SALON', 'BARBER', ' SPA ', 'NAIL', 'SEPHORA', 'ULTA', 'HAIRCUT', 'MASSAGE']],
  ['Education', ['TUITION', 'UNIVERSITY', 'COLLEGE', 'UDEMY', 'COURSERA', 'SCHOOL']],
  ['Gifts & Donations', ['DONATION', 'CHARITY', 'RED CROSS', 'GOFUNDME', 'UNICEF', 'SALVATION ARMY', 'FLORIST', '1-800-FLOWERS']],
  ['Entertainment', ['CINEMA', 'AMC ', 'THEATER', 'THEATRE', 'TICKETMASTER', 'STEAM', 'PLAYSTATION', 'NINTENDO', 'REGAL',
    'CINEMARK', 'BOWLING', 'GOLF', 'MUSEUM', 'STUBHUB', 'LIVE NATION', 'EVENTBRITE', 'TWITCH', 'XBOX', 'EPIC GAMES']],
  ['Fees', ['OVERDRAFT', 'INTEREST CHARGE', 'ANNUAL FEE', 'SERVICE FEE', 'MONTHLY FEE', 'LATE FEE', 'FOREIGN TRANSACTION',
    'WIRE FEE', 'ATM FEE', 'MAINTENANCE FEE']],
  ['Cash', ['ATM ', 'CASH WITHDRAWAL', 'CASH ADVANCE']],
];

/** Collapse a raw bank description to a stable merchant key (up to 3 words). */
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
  // "ONLINE TRANSFER TO SCHWAB ..." -> "SCHWAB ...": drop the generic bank boilerplate
  s = s.replace(/^(ONLINE|MOBILE|RECURRING|AUTOMATIC|SCHEDULED)\s+(TRANSFER|PAYMENT)\s+(TO\s+|FROM\s+)?/, '');
  s = s.replace(/\s+ON$/, '');
  return s.split(' ').slice(0, 3).join(' ').replace(/\s*&$/, '').trim() || 'UNKNOWN';
}

/** Coarser key (first two words) used to batch similar merchants in the Review screen. */
export function merchantGroup(merchant) {
  return merchant.split(' ').slice(0, 2).join(' ');
}

/**
 * @param {string} desc
 * @param {Array<{match: string, category: string, mode?: 'prefix'}>} userRules  checked first.
 *   mode 'prefix': the normalized merchant equals the match or starts with "match ".
 *   no mode (older rules): match is a substring of the description or merchant.
 * @param {string} [checkNo] any truthy value marks the row as a check
 */
export function categorize(desc, userRules = [], checkNo = '') {
  const d = String(desc).toUpperCase();
  const merchant = normalizeMerchant(desc);
  for (const r of userRules) {
    const m = r.match.toUpperCase();
    if (r.mode === 'prefix') {
      if (merchant === m || merchant.startsWith(m + ' ')) return r.category;
    } else if (d.includes(m) || merchant.includes(m)) return r.category;
  }
  if (checkNo) return 'Checks';
  for (const [cat, words] of DEFAULT_RULES) {
    if (words.some((w) => d.includes(w))) return cat;
  }
  return 'Uncategorized';
}
