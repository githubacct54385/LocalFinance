// Generates FAKE Wells Fargo-style CSVs into samples/. Deterministic (seeded), no real data.
// Usage: node scripts/make-samples.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'samples');
mkdirSync(out, { recursive: true });

let seed = 20261110;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const between = (a, b) => a + rand() * (b - a);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const iso = (d) => d.toISOString().slice(0, 10);
const mdy = (d) => `${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}/${d.getUTCFullYear()}`;
const mdy2 = (d) => mdy(d).replace(/\/20(\d\d)$/, '/$1');
const day = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
const addDays = (d, n) => new Date(d.getTime() + n * 86400000);
const num = (x) => Number(x.toFixed(2)).toString();

const START = day(2025, 9, 1);
const END = day(2026, 11, 9);
const PENDING_FROM = day(2026, 11, 6);

const checking = [];
const checking2 = [];
const card = [];

for (let d = START; d <= END; d = addDays(d, 1)) {
  const dom = d.getUTCDate();
  const dow = d.getUTCDay();
  // paychecks on the 5th and 20th (Fri-shifted not needed for a sample)
  if (dom === 5 || dom === 20) checking.push({ d, desc: 'ACME CORP PAYROLL', amt: 3037.68 });
  // rent by check, #1001 upward, on the 1st
  if (dom === 1) checking.push({ d, desc: 'CHECK', amt: -1450, check: String(1001 + checking.filter((x) => x.check).length) });
  // monthly brokerage contribution + a couple of Zelle payments (deterministic, no randomness)
  if (dom === 12) checking.push({ d, desc: `ONLINE TRANSFER REF #IB0${(dom * 7919 + d.getUTCMonth() * 104729) % 1e8} TO SCHWAB BROKERAGE MONEYLINK ON ${mdy2(d)}`, amt: -300 });
  if (dom === 9) checking.push({ d, desc: `ZELLE FROM A FRIEND ON ${mdy2(d)} REF #${dom}XK${d.getUTCMonth()}`, amt: 45 });
  if (dom === 18) checking.push({ d, desc: `ZELLE TO A NEIGHBOR ON ${mdy2(d)} REF #${dom}QZ${d.getUTCMonth()}`, amt: -75 });
  // internet + electric
  if (dom === 8) checking.push({ d, desc: 'SPECTRUM INTERNET AUTOPAY', amt: -79.99 });
  if (dom === 12) checking.push({ d, desc: 'CITY POWER & LIGHT ELECTRIC', amt: -Number(between(70, 140).toFixed(2)) });
  // occasional extra check
  if (dom === 15 && rand() < 0.4) checking.push({ d, desc: 'CHECK', amt: -Number(between(40, 200).toFixed(2)), check: String(2000 + Math.floor(rand() * 900)) });
  // ATM cash
  if (dow === 6 && rand() < 0.25) checking.push({ d, desc: 'ATM WITHDRAWAL MAIN ST', amt: -60 });
  // move money to second checking on the 6th
  if (dom === 6) {
    checking.push({ d, desc: `ONLINE TRANSFER REF #IB0${Math.floor(rand() * 1e8)} TO SECOND CHECKING XXXXXX7002 ON ${mdy2(d)}`, amt: -500 });
    checking2.push({ d: addDays(d, 1), desc: `ONLINE TRANSFER REF #IB0${Math.floor(rand() * 1e8)} FROM FIRST CHECKING XXXXXX7001 ON ${mdy2(d)}`, amt: 500 });
  }
  // second checking: gym + streaming bills
  if (dom === 10) checking2.push({ d, desc: 'PLANET FITNESS MONTHLY', amt: -24.99 });
  if (dom === 14) checking2.push({ d, desc: `PURCHASE AUTHORIZED ON ${mdy(d).slice(0, 5)} CITY WATER UTILITY`, amt: -Number(between(30, 55).toFixed(2)) });
  if (dom === 22 && rand() < 0.5) checking2.push({ d, desc: 'CHECK', amt: -Number(between(20, 90).toFixed(2)), check: String(300 + Math.floor(rand() * 90)) });

  // local shops with names no keyword list knows (deterministic): these show off the Review screen
  const mo = d.getUTCMonth();
  if (dom === 4 && mo % 2 === 1) card.push({ d, desc: `ELM STREET HARDWARE #${12 + (mo % 3)}`, amt: -Number((18 + mo * 2.35).toFixed(2)) });
  if (dom === 21 && [1, 4, 5, 9].includes(mo)) card.push({ d, desc: 'GREEN LEAF LAUNDRY 0042', amt: -Number((15 + mo * 1.15).toFixed(2)) });
  if (dom === 27 && mo % 2 === 0) card.push({ d, desc: 'MAPLE LANE BOOKSHOP', amt: -Number((22 + mo * 1.8).toFixed(2)) });
  // credit card purchases
  if (dom === 3) card.push({ d, desc: 'NETFLIX.COM', amt: -15.49 });
  if (dom === 17) card.push({ d, desc: 'SPOTIFY USA', amt: -11.99 });
  if (dow === 0) card.push({ d, desc: `TRADER JOES #${100 + Math.floor(rand() * 5)} ANYTOWN`, amt: -Number(between(45, 110).toFixed(2)) });
  if (dow === 3 && rand() < 0.5) card.push({ d, desc: `SAFEWAY #${1000 + Math.floor(rand() * 9)}`, amt: -Number(between(20, 70).toFixed(2)) });
  if (rand() < 0.28) card.push({ d, desc: `${pick(['STARBUCKS STORE', 'CHIPOTLE ONLINE', 'JOES PIZZA', 'CORNER CAFE', 'DOORDASH*ORDER'])} ${Math.floor(rand() * 9999)}`, amt: -Number(between(5, 38).toFixed(2)) });
  if (rand() < 0.12) card.push({ d, desc: `SHELL OIL ${Math.floor(rand() * 99999)}`, amt: -Number(between(30, 60).toFixed(2)) });
  if (rand() < 0.14) card.push({ d, desc: `AMZN MKTP US*${Math.floor(rand() * 1e5).toString(36).toUpperCase()}`, amt: -Number(between(8, 120).toFixed(2)) });
  if (rand() < 0.03) card.push({ d, desc: 'HOME DEPOT 0421', amt: -Number(between(25, 180).toFixed(2)) });
  if (dom === 25 && rand() < 0.3) card.push({ d, desc: 'AMAZON RETURN CREDIT', amt: Number(between(10, 40).toFixed(2)) });
}

// Pay the card on the 28th for everything spent in the prior calendar month.
for (let y = 2025, m = 10; y < 2026 || m <= 10; m++) {
  if (m > 12) { m = 1; y++; }
  if (y === 2026 && m > 10) break;
  const prevM = m === 1 ? 12 : m - 1;
  const prevY = m === 1 ? y - 1 : y;
  const spent = card
    .filter((x) => !x.pay && x.d.getUTCFullYear() === prevY && x.d.getUTCMonth() + 1 === prevM)
    .reduce((s, x) => s + x.amt, 0);
  if (spent >= 0) continue;
  const payDay = day(y, m, 28);
  const amt = Number(spent.toFixed(2));
  checking.push({ d: payDay, desc: `ONLINE TRANSFER REF #IB0${Math.floor(rand() * 1e8)} TO WELLS FARGO CASH BACK VISA SIGNATURE CAR XXXXXXXXXXXX4242 ON ${mdy2(payDay)}`, amt });
  card.push({ d: addDays(payDay, 1), desc: 'ONLINE PAYMENT THANK YOU', amt: -amt, pay: true });
}

function toCsv(title, items) {
  const rows = items
    .filter((x) => x.d <= END)
    .sort((a, b) => b.d - a.d)
    .map((x) => {
      const status = title === 'CreditCard' ? (x.d >= PENDING_FROM ? 'Pending' : 'Posted') : 'Posted';
      return `${mdy(x.d)},${x.desc.includes(',') ? `"${x.desc}"` : x.desc},${num(x.amt)},${x.check ?? ''},${status}`;
    });
  return [`${title},,,,`, 'DATE,DESCRIPTION,AMOUNT,CHECK #,STATUS', ...rows, ''].join('\n');
}

writeFileSync(join(out, '7001-checking.csv'), toCsv('7001 Checking', checking));
writeFileSync(join(out, '7002-checking.csv'), toCsv('7002 Checking', checking2));
writeFileSync(join(out, 'credit-card.csv'), toCsv('CreditCard', card));
console.log('wrote samples:', checking.length, checking2.length, card.length, 'rows');
