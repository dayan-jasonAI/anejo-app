import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../public/assets/js/order-confirmation.js', import.meta.url), 'utf8');
async function screen({ token = 'a'.repeat(64), consent = true, responses = [{ paid: false }] } = {}) {
  const events = [], listeners = {}, elements = {}, timers = [];
  const local = new Map(); let requests = 0;
  const window = consent ? { gtag: (...args) => events.push(args) } : {};
  const document = {
    getElementById: id => elements[id] ||= { style: {}, hidden: true, addEventListener: (name, fn) => { listeners[id + name] = fn; } },
    addEventListener: (name, fn) => { listeners[name] = fn; },
  };
  vm.runInNewContext(source, { window, document,
    sessionStorage: { getItem: () => token },
    localStorage: { getItem: k => local.get(k), setItem: (k, v) => local.set(k, v) },
    fetch: async () => { requests++; return { ok: true, json: async () => responses.shift() || { paid: false } }; },
    setTimeout: fn => timers.push(fn),
  });
  const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
  await flush();
  return { events, listeners, elements, timers, window, flush, requests: () => requests };
}
test('direct visit without a capability neither confirms payment nor emits a purchase', async () => {
  const s = await screen({ token: null });
  assert.equal(s.requests(), 0);
  assert.equal(s.events.length, 0);
  assert.equal(s.elements.paymentHeading.textContent, 'Check your order');
});
test('pending webhook is polled; only verified receipt triggers purchase with server value', async () => {
  const s = await screen({ responses: [{ paid: false }, { paid: true, transaction_id: 'ord_verified', currency: 'USD', value: 40 }] });
  assert.equal(s.events.length, 0);
  s.timers.shift()(); await s.flush();
  assert.equal(s.elements.paymentHeading.textContent, 'Payment confirmed');
  assert.equal(s.events.length, 1);
  assert.equal(s.events[0][2].transaction_id, 'ord_verified');
  assert.equal(s.events[0][2].value, 40);
  s.listeners['anejo:analytics-ready']();
  assert.equal(s.events.length, 1);
});
test('late consent measures once; consent refusal emits nothing', async () => {
  const s = await screen({ consent: false, responses: [{ paid: true, transaction_id: 'ord_verified', currency: 'USD', value: 40 }] });
  assert.equal(s.events.length, 0);
  s.window.gtag = (...args) => s.events.push(args);
  s.listeners['anejo:analytics-ready']();
  s.listeners['anejo:analytics-ready']();
  assert.equal(s.events.length, 1);
});
test('persistent unpaid state stops polling and offers a retry without claiming failure or success', async () => {
  const s = await screen();
  for (let i = 0; i < 7; i++) { s.timers.shift()(); await s.flush(); }
  assert.equal(s.requests(), 8);
  assert.equal(s.events.length, 0);
  assert.equal(s.timers.length, 0);
  assert.equal(s.elements.paymentRetry.hidden, false);
  assert.equal(s.elements.paymentHeading.textContent, 'Payment not yet confirmed');
});
