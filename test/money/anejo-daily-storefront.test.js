// Añejo Daily — the parts a customer and the owner TOUCH, rather than the rules underneath them.
//
// Three things are pinned here, each of which has already gone wrong once in this codebase or in
// the real business:
//   · a packaged drink must be filed under Drinks, not swept into Añejo Fit by a catch-all rule;
//   · the /order page must be able to price and keep an Añejo Daily line, which depends on the
//     public catalog carrying `kind` and `group`;
//   · a duplicate catering quote must be FLAGGED and voided deliberately — never matched on
//     amount, and never voided once money has touched it. That is Karina's incident (2026-09-10),
//     where the quote she paid sat beside an open twin with a live payment link.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestGet as cateringGet, onRequestPost as cateringPost } from '../../functions/api/hub/owner/catering-deposit.js';
import { onRequestGet as contractsGet, onRequestPost as contractsPost } from '../../functions/api/hub/owner/contracts.js';
import { setDay } from '../../functions/_lib/daily.js';

// ---------------------------------------------------------------- storefront grouping

// shop-families.js is a browser file with no module system; load it the way the page does.
function loadShopFamilies() {
  const src = fs.readFileSync(new URL('../../public/assets/js/shop-families.js', import.meta.url), 'utf8');
  const sandbox = { window: {}, module: undefined };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.window.AnejoShop;
}

test('a packaged drink lands in Drinks, grouped — it is no longer swept into Añejo Fit', () => {
  const Shop = loadShopFamilies();
  assert.ok(Shop.sections.some((s) => s[0] === 'drinks'), 'the storefront needs a Drinks section');

  const materva = Shop.describe({ id: 'drink_materva', name: 'Materva', kind: 'drink', group: 'cuban' });
  assert.equal(materva.category, 'drinks');
  assert.equal(materva.name, 'Cuban classics');
  assert.equal(materva.nameEs, 'Clásicos cubanos');

  const water = Shop.describe({ id: 'drink_water', name: 'Still Water', kind: 'drink', group: 'hydrate' });
  assert.equal(water.category, 'drinks');
  assert.equal(water.name, 'Hydrate');

  // No group yet (the owner has not filed it): still a drink, never an Añejo Fit bowl.
  const ungrouped = Shop.describe({ id: 'drink_new', name: 'Something new', kind: 'drink' });
  assert.equal(ungrouped.category, 'drinks');

  // Añejo Fit's own drinks are genuinely part of the Fit line and stay there.
  const fit = Shop.describe({ id: 'fit_gold', name: 'Gold Vitality', kind: 'drink' });
  assert.equal(fit.category, 'fit');

  // Nothing else moved.
  assert.equal(Shop.describe({ id: 'vida', name: 'VIDA', kind: 'bowl' }).category, 'fit');
  assert.equal(Shop.describe({ id: 'traditional_croq-pollo-12', name: 'Croquetas' }).category, 'appetizers');
  assert.equal(Shop.describe({ id: 'catering_emp-res-24', name: 'Empanadas' }).category, 'catering');
});

// ---------------------------------------------------------------- the /order page's own rules

// The page is one big inline script; these are the exact lines the Daily depends on, and each of
// them silently breaks the cart if it is edited away.
test('/order carries the Daily wiring: the item survives a catalog refresh, skips the minimum and sends its date', () => {
  const page = fs.readFileSync(new URL('../../public/order.html', import.meta.url), 'utf8');
  // PRICE is rebuilt from the catalog on every refresh; the Daily is not IN the catalog, so it has
  // to be put back or the cart line vanishes and pruneCart drops it.
  assert.match(page, /if\(DAILY_ITEM\) PRICE\[DAILY_ITEM\.id\]=DAILY_ITEM;/);
  // The $25 minimum must not apply to a cart holding the Daily — and must still apply without it.
  assert.match(page, /const belowMin = !dailyCart && total < ORDER_MIN;/);
  // The service date and the idempotency key travel with the order.
  assert.match(page, /payload\.daily = \{ date: DAILY\.today\.date \};/);
  assert.match(page, /payload\.checkout_key = dailyCheckoutKey\(/);
  // kind/group reach the storefront grouping.
  assert.match(page, /kind: it\.kind \|\| null,/);
  assert.match(page, /group: it\.group \|\| null,/);
});

test('the homepage module and the Daily card ship together, and the card never renders institutional data', () => {
  const home = fs.readFileSync(new URL('../../public/index.html', import.meta.url), 'utf8');
  assert.match(home, /<section class="daily-section" id="daily" hidden><\/section>/);
  assert.match(home, /daily-card\.js/);
  const card = fs.readFileSync(new URL('../../public/assets/js/daily-card.js', import.meta.url), 'utf8');
  // The renderer reads only /api/daily, which is scrubbed of anything institutional.
  assert.match(card, /fetch\('\/api\/daily'/);
  assert.doesNotMatch(card, /headcount|contract|institutional|patient/i);
  assert.match(card, /Almuerzo del Día/);
});

// ---------------------------------------------------------------- catering: duplicates + void

const req = (body) => new Request('https://anejo.test/api/hub/owner/catering-deposit', {
  method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const getQuotes = async (env) => {
  const res = await cateringGet({ env, request: new Request('https://anejo.test/api/hub/owner/catering-deposit', { headers: { Cookie: OWNER_COOKIE } }) });
  return (await res.json()).quotes;
};

function seedQuote(env, q) {
  const t = Date.now();
  env.DB.sqlite.prepare(
    `INSERT INTO catering_quotes (id, customer_name, customer_email, event_date, guests, total_cents, deposit_pct,
        deposit_cents, balance_cents, deposit_status, deposit_paid_cents, balance_status, access_token,
        terms_version, terms_json, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(q.id, q.name, q.email, q.event_date, 40, 200000, 0.25, 50000, 150000,
    q.deposit_status || 'unpaid', q.deposit_paid_cents || 0, q.balance_status || 'due', q.token || null,
    'v-test', '{"lines":["test terms"]}', t, t);
}

test('a duplicate is flagged on customer + event date — never on a matching amount', async () => {
  const env = ownerEnv();
  seedQuote(env, { id: 'cq_paid', name: 'Karina', email: 'karina@example.com', event_date: '2026-10-03', deposit_status: 'paid', deposit_paid_cents: 50000 });
  seedQuote(env, { id: 'cq_open', name: 'Karina', email: 'karina@example.com', event_date: '2026-10-03', token: 'tok-open' });
  // Same money, same day, DIFFERENT customer: not a duplicate, and must not be flagged.
  seedQuote(env, { id: 'cq_other', name: 'Someone Else', email: 'else@example.com', event_date: '2026-10-03' });
  // Same customer, different event: a second real booking, not a duplicate.
  seedQuote(env, { id: 'cq_second', name: 'Karina', email: 'karina@example.com', event_date: '2026-12-20' });

  const quotes = await getQuotes(env);
  const by = Object.fromEntries(quotes.map((q) => [q.id, q]));
  assert.equal(by.cq_open.possible_duplicate_of, 'cq_paid');
  assert.match(by.cq_open.duplicate_reason, /not what matched/);
  assert.equal(by.cq_other.possible_duplicate_of, undefined, 'a matching amount is not evidence');
  assert.equal(by.cq_second.possible_duplicate_of, undefined, 'a different event is a different booking');
  assert.equal(by.cq_paid.possible_duplicate_of, undefined, 'the paid quote is never the one flagged');
});

test('voiding refuses anything that has been paid, and revokes the link on the one it does void', async () => {
  const env = ownerEnv();
  seedQuote(env, { id: 'cq_paid', name: 'Karina', email: 'karina@example.com', event_date: '2026-10-03', deposit_status: 'paid', deposit_paid_cents: 50000, token: 'tok-paid' });
  seedQuote(env, { id: 'cq_open', name: 'Karina', email: 'karina@example.com', event_date: '2026-10-03', token: 'tok-open' });

  const paid = await cateringPost({ env, request: req({ op: 'void_quote', quote_id: 'cq_paid' }) });
  assert.equal(paid.status, 409);
  assert.match((await paid.json()).error, /PAID/);
  const stillPaid = await env.DB.prepare('SELECT deposit_status, access_token FROM catering_quotes WHERE id = ?').bind('cq_paid').first();
  assert.equal(stillPaid.deposit_status, 'paid');
  assert.equal(stillPaid.access_token, 'tok-paid', 'the paid customer keeps their link');

  const open = await cateringPost({ env, request: req({ op: 'void_quote', quote_id: 'cq_open' }) });
  assert.equal(open.status, 200);
  const voided = await env.DB.prepare('SELECT deposit_status, balance_status, access_token FROM catering_quotes WHERE id = ?').bind('cq_open').first();
  assert.equal(voided.deposit_status, 'void');
  assert.equal(voided.balance_status, 'waived', 'a void quote stops showing as money owed');
  assert.equal(voided.access_token, null, 'the dead quote can no longer be opened or paid');

  // Voiding twice is harmless, and the flag is gone from the desk.
  const again = await cateringPost({ env, request: req({ op: 'void_quote', quote_id: 'cq_open' }) });
  assert.equal(again.status, 200);
  const quotes = await getQuotes(env);
  assert.equal(quotes.find((q) => q.id === 'cq_open').possible_duplicate_of, undefined);
});

test('a paid balance also blocks the void — money in either direction is a refusal', async () => {
  const env = ownerEnv();
  seedQuote(env, { id: 'cq_bal', name: 'Karina', email: 'k@example.com', event_date: '2026-10-03', balance_status: 'paid' });
  const res = await cateringPost({ env, request: req({ op: 'void_quote', quote_id: 'cq_bal' }) });
  assert.equal(res.status, 409);
  assert.equal((await cateringPost({ env, request: req({ op: 'void_quote', quote_id: 'nope' }) })).status, 404);
});

// ---------------------------------------------------------------- the rotating menu, from the desk

test('the owner can point a weekday at the shared Añejo Daily meal from the contracts desk', async () => {
  const env = ownerEnv();
  const t = Date.now();
  env.DB.sqlite.prepare(
    `INSERT OR REPLACE INTO menu_items (id, kind, name, price_cents, sort, active, created_at, updated_at, availability)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run('daily_ropa', 'daily', 'Ropa Vieja Lunch', 1500, 1, 1, t, t, 'available');
  env.DB.sqlite.prepare(
    "INSERT INTO contract_accounts (id, name, status, created_at, updated_at) VALUES (?,?,?,?,?)"
  ).run('acct_1', 'Test Clinic', 'active', t, t);

  const res = await contractsPost({ env, request: new Request('https://anejo.test/api/hub/owner/contracts', {
    method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'set_menu_slot', account_id: 'acct_1', rotation_week: 1, dow: 3, menu_item_id: 'daily_ropa' }),
  }) });
  assert.equal(res.status, 200);
  const saved = (await res.json()).menu;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].menu_item_id, 'daily_ropa');
  assert.equal(saved[0].meal_kind, 'daily');

  // The desk reads back the account's menu and the meals it may choose from — Daily meals first.
  const get = await contractsGet({ env, request: new Request('https://anejo.test/api/hub/owner/contracts', { headers: { Cookie: OWNER_COOKIE } }) });
  const d = await get.json();
  // The migrations seed a real account, so find ours by id rather than assuming a position.
  const mine = d.accounts.find((a) => a.account.id === 'acct_1');
  assert.equal(mine.menu[0].menu_item_id, 'daily_ropa');
  assert.equal(d.meals[0].kind, 'daily');

  // Saving the same slot again replaces it rather than stacking a second Wednesday.
  await contractsPost({ env, request: new Request('https://anejo.test/api/hub/owner/contracts', {
    method: 'POST', headers: { Cookie: OWNER_COOKIE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: 'set_menu_slot', account_id: 'acct_1', rotation_week: 1, dow: 3, item_name: 'Pernil' }),
  }) });
  const after = await env.DB.prepare('SELECT COUNT(*) AS n FROM contract_menu WHERE account_id = ?').bind('acct_1').first();
  assert.equal(after.n, 1);

  // And Añejo Daily scheduling is unaffected by any of it.
  assert.equal((await setDay(env, { date: '2026-09-16', menu_item_id: 'daily_ropa', allocation: 10, by: 'test', nowDate: new Date('2026-09-14T12:00:00Z') })).ok, true);
});
