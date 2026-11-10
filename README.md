# LocalFinance

A private, local-first personal finance analyzer. Import bank and credit card CSV
exports and explore spending, income, checks, and recurring payments. Everything is
parsed and stored in your browser (IndexedDB). There is no server, no account, no
analytics, and no third-party code.

## Privacy model

- The page's Content Security Policy sets `connect-src 'none'`, so the browser itself
  refuses any network request made by the app. `script-src`/`style-src` are `'self'` only.
- No inline scripts or styles, no CDN scripts, fonts, or libraries. Zero dependencies.
- Your data lives only in this browser's storage on this device. Each device has its own copy.
- Never commit real financial data. `.gitignore` blocks CSV/OFX/XLSX/PDF files and backup
  JSON. Only fake files in `samples/` are allowed.

## Features

- Multiple checking accounts plus credit cards, combined into one overview
- Wells Fargo CSV layout (account name on row 1, `DATE,DESCRIPTION,AMOUNT,CHECK #,STATUS`),
  and the classic headerless layout
- Credit card payments and transfers between your accounts are detected and excluded from
  spending and income, so nothing is double-counted
- Checks shown as "Check #1234" with an optional payee/memo you add on-device
- Pending transactions are included and refreshed when re-imported; duplicates are skipped
- Recurring bills, subscriptions, and income detection
- Investments: brokerage transfers (Schwab, Fidelity, Vanguard, ...) are counted as "Invested", not spending
- Zelle is always treated as a transfer (positive = received, negative = sent); re-categorize any single payment by hand
- Review screen: categorize uncategorized transactions one merchant at a time (one tap covers every matching transaction and future imports)
- Category rules you can edit (stored in the browser, not in this repo)
- Backup and restore to a JSON file you control

## Run locally

```bash
python3 -m http.server 8080   # then open http://localhost:8080
node --test "test/*.test.mjs" # unit tests (npm test)
node scripts/make-samples.mjs # regenerate the fake sample CSVs
```

Try it with the files in `samples/` (fake data).

## Deploy to GitHub Pages

Push this repo, then Settings > Pages > Deploy from branch `main`, folder `/ (root)`.
All paths are relative so it works at `https://<user>.github.io/<repo>/`.
On iPhone: open the page in Safari > Share > Add to Home Screen.
When you change any cached file, bump `VERSION` in `sw.js`.

## Layout

```
index.html        app shell + CSP
js/wf.js          Wells Fargo CSV parsing
js/import.js      merge/dedupe on re-import
js/transfers.js   card payment + transfer detection
js/recurring.js   recurring payment detection
js/categories.js  merchant normalization + category rules
js/analysis.js    classification and summaries
js/store.js       IndexedDB persistence + backup
js/charts.js      SVG charts
js/app.js         UI
```
