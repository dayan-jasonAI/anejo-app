// Hub.toast — regression tests.
//
// Making the toast a screen-reader live region originally deferred the FIRST toast by a tick
// (setTimeout) so the region would be in the DOM before its text changed. That quietly broke two
// things an audit caught: two toasts in the same tick showed the WRONG one (the deferred first
// overwrote the later synchronous second), and `Hub.toast(msg); location.href = …` lost the
// message entirely. The region is now created up front so toast() can stay synchronous.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../../public/hub/assets/hub.js', import.meta.url), 'utf8');

// Minimal DOM good enough for the toast path; hub.js is browser ES5, no imports.
function loadHub() {
  let toastNode = null;
  const mkNode = () => ({
    id: '', className: '', textContent: '', innerHTML: '', href: '', title: '', type: '',
    attrs: {}, style: {}, dataset: {}, children: [],
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    setAttribute(k, v) { this.attrs[k] = v; },
    addEventListener() {},
  });
  const sink = { appendChild() {} };            // hub.js injects an i18n <script> at load
  const document = {
    readyState: 'complete',
    // hub.js also auto-mounts an account button, so capture only the toast node.
    body: { appendChild(n) { if (n && n.id === 'hub-toast') toastNode = n; } },
    head: sink,
    documentElement: sink,
    hidden: false,
    getElementById: (id) => (id === 'hub-toast' ? toastNode : null),
    createElement: () => mkNode(),
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
  const win = { location: { pathname: '/hub/owner/' }, addEventListener() {} };
  const sandbox = {
    document, window: win, navigator: { serviceWorker: null },
    setTimeout: () => 0, clearTimeout: () => {}, fetch: () => Promise.resolve({}),
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
  };
  // hub.js assigns window.Hub; run it with our stubs in scope.
  const fn = new Function(
    'document', 'window', 'navigator', 'setTimeout', 'setInterval', 'clearTimeout',
    'fetch', 'localStorage', 'location',
    SRC + '\nreturn window.Hub;'
  );
  const Hub = fn(sandbox.document, sandbox.window, sandbox.navigator, sandbox.setTimeout,
    () => 0, sandbox.clearTimeout, sandbox.fetch, sandbox.localStorage, sandbox.window.location);
  return { Hub, node: () => toastNode };
}

test('toast is a polite live region so screen readers announce it', () => {
  const { Hub, node } = loadHub();
  Hub.toast('Saved');
  assert.equal(node().attrs.role, 'status');
  assert.equal(node().attrs['aria-live'], 'polite');
  assert.equal(node().attrs['aria-atomic'], 'true');
});

test('two toasts in the same tick: the LAST one wins (no deferred-first inversion)', () => {
  const { Hub, node } = loadHub();
  Hub.toast('first');
  Hub.toast('second');
  assert.equal(node().textContent, 'second');
});

test('the very first toast renders synchronously (survives immediate navigation)', () => {
  const { Hub, node } = loadHub();
  Hub.toast('Invoice created');
  // No tick has elapsed — if this were deferred, a same-tick location.href would drop it.
  assert.equal(node().textContent, 'Invoice created');
  assert.ok(node().classList.contains('show'));
});
