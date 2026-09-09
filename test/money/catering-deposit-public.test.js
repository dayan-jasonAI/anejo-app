// The customer books their own date: POST /api/catering-deposit.
//
// This is a PUBLIC endpoint that mints a Square payment link, so the whole test file is about one
// question — can anything a browser sends decide what somebody is charged? The answer has to be
// no. The body carries product ids and quantities; the price is re-derived from the live menu and
// the shared discount every time.
//
// Square is stubbed at `fetch`. Nothing here can reach live money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeD1 } from '../helpers/d1.js';
import { onRequestPost } from '../../functions/api/catering-deposit.js';

const items = JSON.parse(readFileSync(new URL('../../docs/menu-2026-09/catalog.json', import.meta.url)));

// A day comfortably past the 48-hour rule, in ET.
const FAR = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
const SOON = new Date(Date.now() + 3600 * 1000).toISOString().slice(0, 10);

function stubSquare(ok = true) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body || '{}') });
    return { ok, status: ok ? 200 : 400, json: async () => ({ payment_link: { id: 'pl_1', order_id: 'sqo_1', long_url: 'https://sq.link/deposit' } }) };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

// D1 that answers the menu queries with the live catalog and accepts the quote insert.
// makeD1 is deliberately strict — unrouted SQL throws — so the quote write is registered here
// rather than swallowed, which is what makes "the row was written" assertable at all.
function makeEnv() {
  const quotes = [];
  const db = makeD1([
    [/INSERT INTO catering_quotes/i, ({ args }) => { quotes.push(args); return { meta: { changes: 1 } }; }],
    [/UPDATE catering_quotes/i, () => ({ meta: { changes: 1 } })],
    [/SELECT .* FROM catering_quotes/i, () => null],
  ]);
  db.quotes = quotes;
  const inner = db.prepare.bind(db);
  return {
    env: {
      ...{ SQUARE_ACCESS_TOKEN: 'tok', SQUARE_LOCATION_ID: 'LOC', SQUARE_ENV: 'sandbox' },
      DB: {
        ...db,
        prepare(sql) {
          // loadMenu asks for BOTH tables in one Promise.all; letting the modifier query throw
          // sends the whole load to its fallback and silently unprices the cart.
          if (sql.includes('menu_items') || sql.includes('menu_modifier_prices')) {
            const rows = sql.includes('menu_items') ? items : [];
            const stmt = { bind: () => stmt, all: async () => ({ results: rows }), first: async () => null, run: async () => ({ meta: {} }) };
            return stmt;
          }
          return inner(sql);
        },
        batch: db.batch ? db.batch.bind(db) : undefined,
      },
    },
    db,
    quotes,
  };
}

const GOOD = { name: 'Dayan', email: 'dayan@example.test', phone: '5615550100', event_date: FAR, guests: 30 };
const CART = [{ id: 'lechon', quantity: 25 }, { id: 'yuca', quantity: 25 }];

const call = (env, body) => onRequestPost({
  env,
  request: new Request('https://anejocateringco.com/api/catering-deposit', { method: 'POST', body: JSON.stringify(body) }),
});

// ---------------------------------------------------------------- the price is ours, not theirs

test('the total is recomputed from the live menu — a browser cannot name its own price', async () => {
  const sq = stubSquare();
  const { env } = makeEnv();
  try {
    // $240 lechón tray + $105 yuca tray = $345. The body screams a different number in every
    // field a tampering client might try.
    const res = await call(env, {
      ...GOOD, products: CART,
      total_cents: 1, subtotal_cents: 1, discount_cents: 99999, deposit_cents: 1, amount: 1,
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.total_cents, 34500, 'the menu decides, not the request body');
    assert.equal(data.deposit_cents, 17250, '50% of $345.00');
    assert.equal(data.balance_cents, 17250);
    assert.equal(data.deposit_cents + data.balance_cents, data.total_cents);
    // And Square was asked for the DEPOSIT, not the total or the client's number.
    const charged = JSON.stringify(sq.calls[0].body);
    assert.ok(charged.includes('17250'), 'Square must be asked for the recomputed deposit');
    assert.ok(!charged.includes('99999'));
  } finally { sq.restore(); }
});

test('the volume discount is applied before the deposit is taken', async () => {
  const sq = stubSquare();
  const { env } = makeEnv();
  try {
    // Four lechón trays = $960 → $23 off (5% of the $460 above $500) → $937.
    const res = await call(env, { ...GOOD, products: [{ id: 'lechon', quantity: 100 }] });
    const data = await res.json();
    assert.equal(data.total_cents, 93700, 'the customer is not deposited against the undiscounted price');
    assert.equal(data.deposit_cents, 46850);
  } finally { sq.restore(); }
});

// ---------------------------------------------------------------- who is on the hook

test('a deposit is never taken without the details that tie it to an event', async () => {
  const sq = stubSquare();
  const { env } = makeEnv();
  try {
    for (const missing of [{ name: '' }, { email: '' }, { email: 'not-an-email' }, { event_date: '' }, { guests: 0 }, { guests: 99999 }]) {
      const res = await call(env, { ...GOOD, ...missing, products: CART });
      assert.equal(res.status, 400, `${JSON.stringify(missing)} should be refused`);
      assert.ok((await res.json()).error, 'and must say what is missing');
    }
    assert.equal(sq.calls.length, 0, 'no payment link may be minted for any of them');
  } finally { sq.restore(); }
});

test('the 48-hour rule is enforced before the card, not after', async () => {
  const sq = stubSquare();
  const { env } = makeEnv();
  try {
    const res = await call(env, { ...GOOD, event_date: SOON, products: CART });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /48 hours/);
    assert.equal(sq.calls.length, 0, 'taking the money first makes this a refund instead of a conversation');
  } finally { sq.restore(); }
});

// ---------------------------------------------------------------- what may not be sold this way

test('a selection with nothing priceable is sent to a human instead of a card reader', async () => {
  const sq = stubSquare();
  const { env } = makeEnv();
  try {
    const res = await call(env, { ...GOOD, products: [{ id: 'cajita-standard', quantity: 10 }] });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /quote/i);
    assert.equal(sq.calls.length, 0);
  } finally { sq.restore(); }
});

test('a noted line cannot be deposited against at the standard price', async () => {
  const sq = stubSquare();
  const { env } = makeEnv();
  try {
    const res = await call(env, { ...GOOD, products: [{ id: 'lechon', quantity: 25, notes: 'no onions, swap the sauce' }] });
    assert.equal(res.status, 400, 'the only line asked for something other than the menu item');
    assert.equal(sq.calls.length, 0);
  } finally { sq.restore(); }
});

test('Fit bowls keep their modifiers in the bowl editor and are refused here', async () => {
  const sq = stubSquare();
  const { env } = makeEnv();
  try {
    const res = await call(env, { ...GOOD, products: [{ id: 'fit-fuego', quantity: 10 }] });
    assert.equal(res.status, 400);
    assert.equal(sq.calls.length, 0);
  } finally { sq.restore(); }
});

test('a priced line still books even when another line needs a hand quote', async () => {
  const sq = stubSquare();
  const { env, quotes } = makeEnv();
  try {
    const res = await call(env, { ...GOOD, products: [...CART, { id: 'custom-1', quantity: 30, notes: 'themed boxes' }] });
    assert.equal(res.status, 200, 'the food is bookable; the custom work is quoted separately');
    const data = await res.json();
    assert.equal(data.total_cents, 34500, 'and the unpriced line is NOT charged for');
    assert.equal(JSON.parse(JSON.stringify(sq.calls[0].body)).order.line_items[0].base_price_money.amount, 17250, 'the card is charged 50% of the priced food only');
    assert.ok(data.unpriced.length, 'the response tells the page what is still to be quoted');

    // The warning belongs on the QUOTE ROW, which is what Dayan reads in the Hub when he picks
    // this booking up. Square's own note is the ratified terms summary and is not ours to edit —
    // rewriting it here would change the Hub's deposit path too.
    assert.ok(quotes.length, 'a quote row was written');
    assert.ok(quotes[0].some((v) => typeof v === 'string' && /NOT included/i.test(v)),
      'the stored quote must say the deposit does not cover the hand-quoted lines');
  } finally { sq.restore(); }
});

// ---------------------------------------------------------------- failure modes

test('a Square failure returns an error and hands back no link', async () => {
  const sq = stubSquare(false);
  const { env } = makeEnv();
  try {
    const res = await call(env, { ...GOOD, products: CART });
    assert.ok(res.status >= 400);
    const data = await res.json();
    assert.ok(!data.url, 'never hand back a link that does not exist');
  } finally { sq.restore(); }
});

test('malformed and oversized bodies are refused without touching Square', async () => {
  const sq = stubSquare();
  const { env } = makeEnv();
  try {
    const junk = await onRequestPost({ env, request: new Request('https://x/api/catering-deposit', { method: 'POST', body: 'not json' }) });
    assert.equal(junk.status, 400);
    const huge = await call(env, { ...GOOD, products: CART, pad: 'x'.repeat(41000) });
    assert.equal(huge.status, 413);
    assert.equal(sq.calls.length, 0);
  } finally { sq.restore(); }
});

test('the response is never cached — it carries a one-time payment link', async () => {
  const sq = stubSquare();
  const { env } = makeEnv();
  try {
    const res = await call(env, { ...GOOD, products: CART });
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  } finally { sq.restore(); }
});
