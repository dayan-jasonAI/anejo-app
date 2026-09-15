import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import assert from 'node:assert/strict';

// Runs only the existing inline conversion block in an isolated browser stub.
// No network, customer data, analytics requests, or production writes.
const baseline = '75640c0';
const html = execFileSync('git', ['show', `${baseline}:public/order/confirmed.html`], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), encoding: 'utf8',
});
const blocks = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const source = blocks.find(block => block.includes('anejo:gaPurchase:'));
assert.ok(source, 'Locate the current purchase measurement implementation');

function probe({ search = '', consent = true, pending = null } = {}) {
  const events = [];
  const local = new Map();
  const session = new Map(pending ? [['anejo:pendingOrder', JSON.stringify(pending)]] : []);
  const storage = map => ({ getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value) });
  const window = consent ? { gtag: (...args) => events.push(args) } : {};
  const sandbox = { window, location: { search }, URLSearchParams, localStorage: storage(local), sessionStorage: storage(session) };
  vm.runInNewContext(source, sandbox);
  return { events, window, local };
}

const directVisit = probe();
const unverifiedReturn = probe({ search: '?orderId=unverified-test-reference', pending: { value: 45, currency: 'USD' } });
const lateConsent = probe({ consent: false, search: '?orderId=example-reference', pending: { value: 45, currency: 'USD' } });
lateConsent.window.gtag = (...args) => lateConsent.events.push(args);

assert.equal(directVisit.events.length, 1, 'Reproduces purchase event without order reference');
assert.equal(unverifiedReturn.events.length, 1, 'Reproduces purchase event without server payment verification');
assert.equal(lateConsent.events.length, 0, 'Reproduces missed event after consent is accepted later');

console.log(JSON.stringify({
  source: `${baseline}:public/order/confirmed.html (historical baseline)`,
  mode: 'isolated local reproduction; no external requests',
  findings: {
    directVisitEmitsPurchase: directVisit.events.length === 1,
    unverifiedReferenceEmitsPurchase: unverifiedReturn.events.length === 1,
    lateConsentHasNoRetry: lateConsent.events.length === 0,
  },
  conclusion: 'Baseline browser purchase events do not prove paid orders. See receipt and confirmation tests for the replacement implementation.',
}, null, 2));
