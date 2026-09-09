// The deposit rate the customer is SHOWN must be the rate the server CHARGES.
//
// WHAT HAPPENED (2026-09-09). The deposit moved from 25% to 50% in catering_terms.js. The public
// catering selector had `const deposit = Math.round(estimate.total_cents * 0.25)` written into it
// and a button reading "Hold the date — 25% deposit". For the time between those two deploys the
// page offered half the real figure: click it on an $815.87 order and the button said $203.97
// while /api/catering-deposit minted a Square link for $407.94.
//
// The file already carried a comment warning about exactly this — a button that names a price
// the server will not charge — about a DIFFERENT path. The rate is now served with the catalogue
// so there is no second copy of it to drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestGet } from '../../functions/api/catering-catalog.js';
import { DEPOSIT_PCT } from '../../functions/_lib/catering_terms.js';

const items = JSON.parse(readFileSync(new URL('../../docs/menu-launch/catalog.json', import.meta.url)));
const env = { DB: { prepare: (sql) => ({ all: async () => ({ results: sql.includes('menu_items') ? items : [] }) }) } };
const get = async () => (await onRequestGet({ env, request: new Request('https://anejocateringco.com/api/catering-catalog') })).json();

const SRC = readFileSync(new URL('../../src/catering-products.js', import.meta.url), 'utf8');
const BUNDLE = readFileSync(new URL('../../public/assets/js/catering-products.js', import.meta.url), 'utf8');

test('the catalogue publishes the deposit rate the server actually uses', async () => {
  const data = await get();
  assert.equal(data.deposit_pct, DEPOSIT_PCT, 'the page must be told the real rate');
  assert.ok(data.deposit_pct > 0 && data.deposit_pct < 1);
});

test('the selector never hardcodes a deposit rate of its own', () => {
  for (const [name, code] of [['source', SRC], ['built bundle', BUNDLE]]) {
    assert.ok(!/total_cents\s*\*\s*0?\.\d+/.test(code),
      `${name}: a literal multiplier is a second copy of the rate that will drift`);
    assert.ok(!/\d+% deposit/.test(code), `${name}: a hardcoded percentage in the button label`);
    assert.ok(!/\d+% de dep/.test(code), `${name}: a hardcoded percentage in the Spanish label`);
  }
});

test('the selector reads the rate from the catalogue, and stays silent without it', () => {
  assert.match(SRC, /catalog\?\.deposit_pct/, 'the rate must come from the served catalogue');
  // No rate → no deposit button. Showing one with a guessed number is the failure being fixed.
  assert.match(SRC, /if \(!Number\.isFinite\(pct\) \|\| pct <= 0 \|\| pct >= 1\) return;/);
  assert.ok(BUNDLE.includes('deposit_pct'), 'and the shipped bundle must carry that read');
});

test('the balance line promises the day before the event, matching the terms', () => {
  assert.match(SRC, /due the day before the event/);
  assert.match(SRC, /vence el día antes del evento/);
  assert.ok(!/is due before the event`/.test(SRC), 'the older vaguer promise must be gone');
});
