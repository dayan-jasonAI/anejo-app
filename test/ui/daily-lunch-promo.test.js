import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync('public/assets/js/daily-lunch-promo.js', 'utf8');
function harness(data, options = {}) {
  const nodes = []; const stored = new Map(options.seen ? [['anejo:lunch-promo:seen', '1']] : []); let timer, requests = 0;
  class Element {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.listeners = {}; this.isConnected = true; nodes.push(this); }
    append(...items) { this.children.push(...items); }
    replaceChildren(...items) { this.children = items; }
    setAttribute(k, v) { this[k] = v; }
    addEventListener(k, fn) { this.listeners[k] = fn; }
    querySelector(selector) { return nodes.find(n => n.className === selector.slice(1)); }
    showModal() { this.open = true; }
    close() { this.open = false; this.listeners.close?.(); }
    focus() { this.focused = true; }
  }
  const active = new Element(options.typing ? 'input' : 'button');
  const document = { createElement: tag => new Element(tag), activeElement: active, documentElement: { lang: options.es ? 'es' : 'en' }, body: new Element('body'), querySelector: () => options.otherDialog ? {} : null, addEventListener() {} };
  const window = { setTimeout: fn => { timer = fn; } };
  vm.runInNewContext(source, { document, window, sessionStorage: { getItem: k => stored.get(k), setItem: (k, v) => stored.set(k, v) }, fetch: async () => { requests++; return { ok: !options.error, json: async () => data }; }, Intl, Date });
  return { run: () => timer(), nodes, stored, active, requests: () => requests };
}
const today = { date: '2026-10-01', product_id: 'papa', name: 'Papa Añejo', image_url: '/assets/img/papa.webp', orderable: true, free_delivery: false };
const menu = days => ({ ok: true, price_cents: 1000, today: '2026-10-01', days });
test('announces only today with exact order-category destination and daily price', async () => {
  const h = harness(menu([today])); await h.run();
  assert.equal(h.nodes.find(n => n.tagName === 'DIALOG').open, true);
  assert.equal(h.nodes.find(n => n.className === 'lunch-promo-price').textContent, '$10');
  assert.equal(h.nodes.find(n => n.className === 'lunch-promo-cta').href, '/order?category=daily&date=2026-10-01');
  h.nodes.find(n => n.className === 'lunch-promo-close').listeners.click();
  assert.equal(h.active.focused, true);
  assert.equal(h.stored.get('anejo:lunch-promo:seen'), '1');
});
test('closed dates invite exploration without a false order-now claim', async () => {
  const h = harness(menu([{ ...today, orderable: false, reason: 'same_day_cutoff' }])); await h.run();
  assert.equal(h.nodes.find(n => n.className === 'lunch-promo-cta').textContent, 'Explore the $10 menu →');
  assert.match(h.nodes.find(n => n.className === 'lunch-promo-status').textContent, /closed/);
});
test('next available date replaces closed today and matches Spanish preference', async () => {
  const h = harness(menu([{ ...today, orderable: false }, { ...today, date: '2026-10-05', name: 'Añejo Fried Rice', free_delivery: true }]), { es: true }); await h.run();
  assert.match(h.nodes.find(n => n.className === 'lunch-promo-cta').textContent, /Preordena/);
  assert.match(h.nodes.find(n => n.className === 'lunch-promo-status').textContent, /ENVÍO GRATIS/);
  assert.match(h.nodes.find(n => n.className === 'lunch-promo-cta').href, /2026-10-05/);
});
test('does not repeat, interrupt typing or dialogs, or advertise failed availability', async () => {
  for (const options of [{ seen: true }, { typing: true }, { otherDialog: true }, { error: true }]) {
    const h = harness(menu([today]), options); await h.run();
    assert.equal(h.nodes.some(n => n.tagName === 'DIALOG'), false);
    if (options.seen) assert.equal(h.requests(), 0);
  }
});
test('no stale past menu or inaccessible image is advertised', async () => {
  for (const day of [{ ...today, date: '2026-09-30', orderable: false }, { ...today, image_url: null }]) {
    const h = harness(menu([day])); await h.run(); assert.equal(h.nodes.some(n => n.tagName === 'DIALOG'), false);
  }
});

test('waits for an existing dialog to close before showing the offer', async () => {
  const options = { otherDialog: true };
  const h = harness(menu([today]), options); await h.run();
  assert.equal(h.nodes.some(n => n.tagName === 'DIALOG'), false);
  options.otherDialog = false; await h.run();
  assert.equal(h.nodes.find(n => n.tagName === 'DIALOG').open, true);
});
