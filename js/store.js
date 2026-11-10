// Local persistence. Everything lives in IndexedDB inside this browser; nothing is sent anywhere.
// If IndexedDB is unavailable (some private modes) we fall back to memory for the session
// and the UI warns that data will not persist.

const DB_NAME = 'localfinance';
const STORES = ['accounts', 'transactions', 'meta'];

let db = null;
export let persistent = false;
const mem = { accounts: new Map(), transactions: new Map(), meta: new Map() };
const keyOf = (store, item) => (store === 'meta' ? item.key : item.id);

export async function init() {
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const d = req.result;
        d.createObjectStore('accounts', { keyPath: 'id' });
        d.createObjectStore('transactions', { keyPath: 'id' }).createIndex('accountId', 'accountId');
        d.createObjectStore('meta', { keyPath: 'key' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
    persistent = true;
  } catch {
    db = null;
    persistent = false;
  }
  return persistent;
}

function run(store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const os = tx.objectStore(store);
    let result;
    try { result = fn(os); } catch (e) { reject(e); return; }
    tx.oncomplete = () => resolve(result?.result ?? undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAll(store) {
  if (!db) return [...mem[store].values()];
  return run(store, 'readonly', (os) => os.getAll());
}

export async function putAll(store, items) {
  if (!items.length) return;
  if (!db) { items.forEach((i) => mem[store].set(keyOf(store, i), i)); return; }
  await run(store, 'readwrite', (os) => { items.forEach((i) => os.put(i)); });
}

export async function deleteKeys(store, keys) {
  if (!keys.length) return;
  if (!db) { keys.forEach((k) => mem[store].delete(k)); return; }
  await run(store, 'readwrite', (os) => { keys.forEach((k) => os.delete(k)); });
}

export async function clearAll() {
  if (!db) { STORES.forEach((s) => mem[s].clear()); return; }
  for (const s of STORES) await run(s, 'readwrite', (os) => os.clear());
}

export async function getMeta(key, fallback) {
  const rows = await getAll('meta');
  return rows.find((r) => r.key === key)?.value ?? fallback;
}

export const setMeta = (key, value) => putAll('meta', [{ key, value }]);

/** Full backup as a plain object (written to a file you choose; never uploaded). */
export async function exportBackup() {
  return {
    app: 'localfinance',
    version: 1,
    exportedAt: new Date().toISOString(),
    accounts: await getAll('accounts'),
    transactions: await getAll('transactions'),
    rules: await getMeta('rules', []),
  };
}

export async function importBackup(data) {
  if (data?.app !== 'localfinance' || !Array.isArray(data.accounts) || !Array.isArray(data.transactions)) {
    throw new Error('Not a LocalFinance backup file.');
  }
  await clearAll();
  await putAll('accounts', data.accounts);
  await putAll('transactions', data.transactions);
  await setMeta('rules', Array.isArray(data.rules) ? data.rules : []);
}
