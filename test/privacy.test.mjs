// Guards for the project's core promise: your data never leaves the device and never lands in Git.
// These run in CI on every push, so a change that breaks the promise fails the build.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const jsFiles = readdirSync(new URL('js/', root)).filter((f) => f.endsWith('.js')).map((f) => `js/${f}`);

test('page CSP forbids all network requests and third-party code', () => {
  const html = read('index.html');
  const csp = /Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
  assert.ok(csp, 'index.html has a Content-Security-Policy meta tag');
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /style-src 'self'(;|$)/);
  assert.match(csp, /default-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:/);
});

test('app code makes no network calls and loads nothing from other origins', () => {
  for (const f of [...jsFiles, 'index.html', 'css/styles.css', 'manifest.webmanifest']) {
    const src = read(f);
    assert.doesNotMatch(src, /https?:\/\//, `${f} references an external URL`);
  }
  for (const f of jsFiles) {
    assert.doesNotMatch(read(f), /\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource|importScripts/, `${f} uses a network API`);
  }
});

test('page has no inline scripts or inline styles (CSP would block them)', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\sstyle="/i);
});

test('service worker only answers same-origin GET requests', () => {
  const sw = read('sw.js');
  assert.match(sw, /url\.origin !== self\.location\.origin/);
  assert.match(sw, /method !== 'GET'/);
});

test('no real data files are tracked by Git (only fake samples/)', () => {
  let files;
  try {
    files = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
  } catch {
    return; // not a git checkout (e.g. a source archive): nothing to check
  }
  const risky = files.filter((f) => /\.(csv|tsv|ofx|qfx|qif|xlsx?|pdf)$/i.test(f) || /backup.*\.json$/i.test(f) || /^data\//.test(f));
  const bad = risky.filter((f) => !f.startsWith('samples/'));
  assert.deepEqual(bad, [], `data-like files tracked outside samples/: ${bad.join(', ')}`);
});
