// Añejo Rewards — earning (functions/_lib/rewards.js).
//
// The orders stub below PARSES the `status IN (…)` list out of the SQL and honours it, rather
// than returning a canned number. That makes the query itself the thing under test: if the
// lifetime-spend query stops counting a status a customer's money is actually sitting in, the
// tier silently under-ranks them and these tests go red.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  awardOrderPoints, redeemOrderPoints, lifetimeSpendCents, pointsBalance,
  tierForSpend, nextTier, redeemValueCents, maxRedeemCents, pointsForCents,
} from '../../functions/_lib/rewards.js';
import { makeD1, makeKV } from '../helpers/d1.js';

// Money a customer has already handed over is money they have already spent. An order sitting in
// the kitchen ('prep') or on the counter ('ready') is PAID — Square took the card before the
// ticket ever printed. Counting only 'paid'/'fulfilled' loses a member's spend for the whole
// window between payment and delivery, which is exactly when they are most likely to be looking
// at their tier.
const SPENT_STATUSES = ['paid', 'prep', 'ready', 'fulfilled'];

function rewardsEnv({ orders = [], clients = {}, config = null, ledgerThrows = false } = {}) {
  const ledger = [];
  const statusesIn = (sql) => {
    const m = /status IN \(([^)]*)\)/.exec(sql);
    return m ? m[1].split(',').map((s) => s.trim().replace(/'/g, '')) : [];
  };
  const DB = makeD1([
    [/SUM\(total_estimate_cents\)/, ({ sql, args }) => {
      const allowed = statusesIn(sql);
      const [em, excludeId] = args;
      const c = orders
        .filter((o) => o.email === em && allowed.includes(o.status) && o.id !== excludeId)
        .reduce((sum, o) => sum + o.cents, 0);
      return { c };
    }],
    [/SELECT id FROM clients WHERE/, ({ args }) => (clients[args[0]] ? { id: clients[args[0]] } : null)],
    [/SELECT COALESCE\(SUM\(delta\)/, ({ args }) => ({
      b: ledger.filter((l) => l.email === args[0]).reduce((s, l) => s + l.delta, 0),
    })],
    [/INSERT INTO points_ledger/, ({ args }) => {
      // The real table has UNIQUE(order_id, reason) — a retried webhook hits it and throws.
      if (ledgerThrows) throw new Error('UNIQUE constraint failed: points_ledger.order_id');
      const [, email, client_id, delta, reason, order_id, note] = args;
      ledger.push({ email, client_id, delta, reason, order_id, note });
      return 1;
    }],
  ]);
  return { env: { DB, SESSIONS: makeKV(config ? { 'rewards:config': JSON.stringify(config) } : {}) }, ledger, DB };
}

const EM = 'member@example.com';

// ---- the multiplier stack ----

test('points = dollars × tier multiplier × promo multiplier', async () => {
  // $600 of prior spend = Legend (×1.5). A 2x promo code stacks on top of it.
  const { env, ledger } = rewardsEnv({ orders: [{ id: 'ord_old', email: EM, status: 'paid', cents: 60000 }] });
  const pts = await awardOrderPoints(env, { orderId: 'ord_new', email: EM, subtotalCents: 10000, promoMult: 2 });
  assert.equal(pts, 300, '$100 × 1 pt/$ × 1.5 (Legend) × 2 (promo) = 300');
  assert.equal(ledger[0].delta, 300);
  assert.match(ledger[0].note, /Legend x1\.5 · promo x2/, 'the ledger has to explain itself');
});

test('the tier multiplier alone applies when there is no promo', async () => {
  const { env } = rewardsEnv({ orders: [{ id: 'ord_old', email: EM, status: 'paid', cents: 60000 }] });
  assert.equal(await awardOrderPoints(env, { orderId: 'ord_new', email: EM, subtotalCents: 10000 }), 150);
});

test('a promo multiplier alone applies at the base tier', async () => {
  const { env } = rewardsEnv({ orders: [] });
  assert.equal(await awardOrderPoints(env, { orderId: 'ord_1', email: EM, subtotalCents: 5000, promoMult: 2 }), 100);
});

test('the top tier and a 2x code compound to 4x', async () => {
  const { env } = rewardsEnv({ orders: [{ id: 'ord_old', email: EM, status: 'paid', cents: 150000 }] });
  assert.equal(await awardOrderPoints(env, { orderId: 'ord_new', email: EM, subtotalCents: 10000, promoMult: 2 }), 400);
});

test('a promo multiplier below 1 can never REDUCE what a member earns', async () => {
  const { env } = rewardsEnv({ orders: [] });
  for (const promoMult of [0, 0.5, -3, null, 'x']) {
    assert.equal(await awardOrderPoints(env, { orderId: 'o' + promoMult, email: EM, subtotalCents: 10000, promoMult }), 100);
  }
});

// ---- WHICH ORDERS COUNT AS SPEND ----

test("an order in 'prep' or 'ready' COUNTS toward lifetime spend", async () => {
  // The money is already collected. A member who just ordered $400 and is watching the kitchen
  // make it must not be ranked as if they had never spent it.
  const { env } = rewardsEnv({
    orders: [
      { id: 'o1', email: EM, status: 'paid', cents: 20000 },
      { id: 'o2', email: EM, status: 'ready', cents: 30000 },
      { id: 'o3', email: EM, status: 'prep', cents: 15000 },
    ],
  });
  // $650 of collected spend = Legend (×1.5). Counting only 'paid' would leave them Vital (×1.0).
  const pts = await awardOrderPoints(env, { orderId: 'ord_new', email: EM, subtotalCents: 10000 });
  assert.equal(pts, 150, "'prep' and 'ready' are paid money and must lift the tier");
});

test('lifetimeSpendCents counts every status the customer has already paid for', async () => {
  const orders = SPENT_STATUSES.map((status, i) => ({ id: 'o' + i, email: EM, status, cents: 1000 }));
  const { env } = rewardsEnv({ orders });
  assert.equal(await lifetimeSpendCents(env, EM), 1000 * SPENT_STATUSES.length);
});

test('a cancelled or refunded order is NOT spend', async () => {
  const { env } = rewardsEnv({
    orders: [
      { id: 'o1', email: EM, status: 'paid', cents: 20000 },
      { id: 'o2', email: EM, status: 'cancelled', cents: 500000 },
      { id: 'o3', email: EM, status: 'refunded', cents: 500000 },
      { id: 'o4', email: EM, status: 'pending', cents: 500000 },
    ],
  });
  assert.equal(await lifetimeSpendCents(env, EM), 20000, 'only money actually collected counts');
});

test('an order cannot inflate its OWN earn rate', async () => {
  // The multiplier is read from PRIOR spend — this order is excluded by id.
  const { env } = rewardsEnv({ orders: [{ id: 'ord_new', email: EM, status: 'paid', cents: 150000 }] });
  assert.equal(
    await awardOrderPoints(env, { orderId: 'ord_new', email: EM, subtotalCents: 10000 }),
    100,
    'a first $1,500 order earns at Vital, not Immortal'
  );
});

test("another member's spend never lifts this member's tier", async () => {
  const { env } = rewardsEnv({ orders: [{ id: 'o1', email: 'someone@else.com', status: 'paid', cents: 150000 }] });
  assert.equal(await awardOrderPoints(env, { orderId: 'ord_new', email: EM, subtotalCents: 10000 }), 100);
});

// ---- idempotency + refusals ----

test('a retried webhook awards nothing the second time', async () => {
  const { env } = rewardsEnv({ orders: [], ledgerThrows: true });
  assert.equal(await awardOrderPoints(env, { orderId: 'ord_1', email: EM, subtotalCents: 10000 }), 0);
});

test('no email, no order id, no database → no points, no throw', async () => {
  const { env } = rewardsEnv({ orders: [] });
  assert.equal(await awardOrderPoints(env, { orderId: 'ord_1', email: '', subtotalCents: 10000 }), 0);
  assert.equal(await awardOrderPoints(env, { orderId: null, email: EM, subtotalCents: 10000 }), 0);
  assert.equal(await awardOrderPoints({ SESSIONS: null }, { orderId: 'o', email: EM, subtotalCents: 100 }), 0);
});

test('a sub-dollar subtotal earns nothing and writes no ledger row', async () => {
  const { env, ledger } = rewardsEnv({ orders: [] });
  assert.equal(await awardOrderPoints(env, { orderId: 'ord_1', email: EM, subtotalCents: 40 }), 0);
  assert.equal(ledger.length, 0, 'an empty ledger row is noise the owner has to read past');
});

test('the email is normalised so one member is one balance', async () => {
  const { env, ledger } = rewardsEnv({ orders: [], clients: { [EM]: 'cli_1' } });
  await awardOrderPoints(env, { orderId: 'ord_1', email: '  Member@Example.COM ', subtotalCents: 10000 });
  assert.equal(ledger[0].email, EM);
  assert.equal(ledger[0].client_id, 'cli_1', 'the ledger row links to the client record when there is one');
});

test('points still award for a customer with no client record', async () => {
  const { env, ledger } = rewardsEnv({ orders: [], clients: {} });
  assert.equal(await awardOrderPoints(env, { orderId: 'ord_1', email: EM, subtotalCents: 10000 }), 100);
  assert.equal(ledger[0].client_id, null);
});

// ---- owner-tunable config ----

test('the owner-configured earn rate and thresholds drive the award', async () => {
  const { env } = rewardsEnv({
    orders: [{ id: 'o1', email: EM, status: 'paid', cents: 30000 }],
    config: { earn_per_dollar: 3, thresholds: { thriving: 100000, legend: 200000, immortal: 300000 } },
  });
  // $300 prior spend no longer reaches Thriving under the owner's ladder → ×1.0, at 3 pts/$.
  assert.equal(await awardOrderPoints(env, { orderId: 'ord_new', email: EM, subtotalCents: 10000 }), 300);
});

// ---- redemption ----

test('redeeming deducts exactly the points spent, once', async () => {
  const { env, ledger } = rewardsEnv({ orders: [] });
  assert.equal(await redeemOrderPoints(env, { orderId: 'ord_1', email: EM, points: 200 }), 200);
  assert.equal(ledger[0].delta, -200, 'a redemption is a NEGATIVE ledger entry');
  assert.equal(ledger[0].reason, 'redeem');
});

test('a zero or negative redemption is refused', async () => {
  const { env, ledger } = rewardsEnv({ orders: [] });
  assert.equal(await redeemOrderPoints(env, { orderId: 'ord_1', email: EM, points: 0 }), 0);
  assert.equal(await redeemOrderPoints(env, { orderId: 'ord_1', email: EM, points: -500 }), 0);
  assert.equal(ledger.length, 0);
});

test('the balance is earn minus redeem', async () => {
  const { env } = rewardsEnv({ orders: [] });
  await awardOrderPoints(env, { orderId: 'ord_1', email: EM, subtotalCents: 10000 });
  await redeemOrderPoints(env, { orderId: 'ord_2', email: EM, points: 40 });
  assert.equal(await pointsBalance(env, EM), 60);
});

// ---- pure tier + redemption math ----

test('tier thresholds are inclusive at the boundary cent', () => {
  assert.equal(tierForSpend(0).key, 'vital');
  assert.equal(tierForSpend(24999).key, 'vital');
  assert.equal(tierForSpend(25000).key, 'thriving');
  assert.equal(tierForSpend(59999).key, 'thriving');
  assert.equal(tierForSpend(60000).key, 'legend');
  assert.equal(tierForSpend(150000).key, 'immortal');
  assert.equal(tierForSpend(9999999).key, 'immortal');
  assert.equal(tierForSpend(-100).key, 'vital', 'negative spend cannot buy a tier');
});

test('nextTier points at the rung above, and runs out at the top', () => {
  assert.equal(nextTier(0).key, 'thriving');
  assert.equal(nextTier(60000).key, 'immortal');
  assert.equal(nextTier(150000), null);
});

test('20 points = $1, and a member can never redeem past the subtotal', () => {
  assert.equal(redeemValueCents(200), 1000);
  assert.equal(redeemValueCents(199), 995, 'partial points round down, never up');
  assert.equal(redeemValueCents(-50), 0);
  assert.equal(maxRedeemCents(2000, 3000), 3000, '2,000 pts is $100 but the cart is $30');
  assert.equal(maxRedeemCents(200, 3000), 1000);
  assert.equal(pointsForCents(1000), 200);
  assert.equal(pointsForCents(999), 200, 'the points cost rounds UP — never give away a cent');
});
