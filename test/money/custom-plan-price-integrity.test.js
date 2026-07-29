// The custom plan price must be what gets charged — never the cheaper standard tier.
//
// Añejo sells two ways: fixed tiers (plan_5/10/12 at $99/$189/$219) and macro-portal plans where
// every bowl is portion-sized to the member and priced from that size. The pricing code falls back
// to the tier price whenever it cannot find a per-bowl price. That fallback is CORRECT for a
// walk-up buyer with no custom plan, and a silent money leak for a member who has one.
//
// Scale of it, using the real plan in production ($29.02/bowl):
//     plan_5   $145.10 correct vs  $99.00 fallback  → −$46.10/week
//     plan_10  $290.20 correct vs $189.00 fallback  → −$101.20/week
//     plan_12  $348.24 correct vs $219.00 fallback  → −$129.24/week
// On a weekly recurring charge that is up to ~$6,700/year per member, billed quietly, and it would
// surface only when someone reconciled the books months later.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  perBowlCentsFromOz, clampPerBowlCents, PER_BOWL_CENTS_MIN, PER_BOWL_CENTS_MAX, BASE_BOWL_PRICE_USD,
} from '../../functions/_lib/sizing.js';
import { PLAN_TIERS } from '../../functions/_lib/plans.js';

const CREATE = readFileSync(new URL('../../functions/api/subscriptions/create.js', import.meta.url), 'utf8');
const MANAGE = readFileSync(new URL('../../functions/api/subscriptions/manage.js', import.meta.url), 'utf8');

// ---------- the leak is closed ----------

test('a plan with NO price recovers from the bowl SIZE instead of dropping to the tier', () => {
  // The size is saved on every plan and is the authoritative input — the price is a function of it.
  assert.match(CREATE, /else if \(plan && plan\.bowl_size_oz != null\) perBowlCents = perBowlCentsFromOz\(plan\.bowl_size_oz\)/);
  assert.match(MANAGE, /else if \(plan && plan\.bowl_size_oz != null\) perBowl = perBowlCentsFromOz\(plan\.bowl_size_oz\)/);
});

test('an unpriceable plan REFUSES rather than charging the tier price', () => {
  // Failing one signup loudly beats undercharging a member every week indefinitely.
  assert.match(CREATE, /if \(plan && perBowlCents == null\)/);
  assert.match(CREATE, /cannot price it/);
  assert.match(MANAGE, /if \(plan && perBowl == null\)/);
  assert.ok(/return bad\(/.test(CREATE.slice(CREATE.indexOf('if (plan && perBowlCents == null)'))));
});

test('a FAILED plan lookup is never treated as "no plan"', () => {
  // One transient D1 error during a tier change used to silently re-price a custom member down to
  // the standard tier, permanently.
  assert.match(MANAGE, /planLookupFailed = true/);
  assert.match(MANAGE, /if \(planLookupFailed\) return bad\(/);
  assert.ok(!/catch \{ \/\* none \*\/ \}/.test(MANAGE), 'the swallowing catch is gone');
});

test('the tier fallback still applies to a genuine walk-up buyer', () => {
  // Someone with no custom plan SHOULD pay the advertised tier price — the fix must not break that.
  assert.match(CREATE, /perBowlCents != null \? perBowlCents \* tier\.bowls : tier\.weeklyCents/);
});

// ---------- the price can never be supplied by the caller ----------

test('a saved plan derives its price server-side, not from the request', () => {
  // It used to read per_bowl_price_usd / per_bowl_price_cents straight off the payload: a caller
  // could send its own price, and omitting it saved a NULL that triggered the fallback forever.
  assert.match(CREATE, /const pbpCents = sizeOz != null\s*\n\s*\? perBowlCentsFromOz\(sizeOz\)/);
  assert.ok(!/raw\.per_bowl_price_usd != null \? Math\.round\(Number\(raw\.per_bowl_price_usd\) \* 100\)/.test(CREATE),
    'the client-supplied price path is gone');
});

// ---------- the numbers themselves ----------

test('the real production plan prices above every tier fallback', () => {
  // $29.02/bowl — the plan that exists today. If any of these ever inverted, the "fallback" would
  // be the MORE expensive option and this test would be telling us something important.
  const perBowl = 2902;
  for (const [key, t] of Object.entries(PLAN_TIERS)) {
    const correct = perBowl * t.bowls;
    assert.ok(correct > t.weeklyCents,
      `${key}: custom ${correct} should exceed the ${t.weeklyCents} fallback`);
  }
  assert.equal(2902 * PLAN_TIERS.plan_12.bowls, 34824, '12 bowls at $29.02 = $348.24');
  assert.equal(PLAN_TIERS.plan_12.weeklyCents, 21900, 'the fallback would have been $219.00');
});

test('the clamp does not shave a legitimate large plan', () => {
  // $29.02 must survive; only genuinely out-of-range values get pulled in.
  assert.equal(clampPerBowlCents(2902), 2902);
  assert.equal(PER_BOWL_CENTS_MIN, Math.round(BASE_BOWL_PRICE_USD * 0.6 * 100));
  assert.equal(PER_BOWL_CENTS_MAX, Math.round(BASE_BOWL_PRICE_USD * 1.8 * 100));
  assert.equal(clampPerBowlCents(999999), PER_BOWL_CENTS_MAX, 'absurd highs are capped');
  assert.equal(clampPerBowlCents(1), PER_BOWL_CENTS_MIN, 'absurd lows are floored');
});

test('a bigger bowl always costs more than a smaller one', () => {
  // The whole premise of sized pricing. If this ever inverted, large members would subsidise nobody.
  const sizes = [10, 12, 16, 20, 26];
  const prices = sizes.map(perBowlCentsFromOz);
  for (let i = 1; i < prices.length; i++) {
    assert.ok(prices[i] >= prices[i - 1], `${sizes[i]}oz must not cost less than ${sizes[i - 1]}oz`);
  }
  assert.equal(perBowlCentsFromOz(16), Math.round(BASE_BOWL_PRICE_USD * 100), 'a standard bowl is the base price');
});

test('an out-of-range bowl size cannot produce an out-of-range charge', () => {
  assert.equal(perBowlCentsFromOz(500), PER_BOWL_CENTS_MAX);
  assert.equal(perBowlCentsFromOz(1), PER_BOWL_CENTS_MIN);
  assert.equal(perBowlCentsFromOz(0), Math.round(BASE_BOWL_PRICE_USD * 100), 'zero falls back to standard, not free');
});

// ---------- what Square is actually told ----------

test('our price is sent to Square unconditionally', () => {
  // A conditional "should we override?" was itself a bug source — every variant had to correctly
  // predict which of {sized bowls, avocado, an owner price change} counted as different.
  assert.match(CREATE, /price_override_money: \{ amount: weeklyCents, currency: 'USD' \}/);
});

test('Square is checked for having ECHOED the price we sent', () => {
  // Square silently billing a stale catalog amount while /subscribe advertises the new one is the
  // failure this guards.
  assert.match(CREATE, /price_override_money && Number\(sub\.price_override_money\.amount\)/);
});

// ---------- guest checkout must capture an email ----------
//
// Until now the order only stored an email when the buyer happened to be SIGNED IN. Every guest
// order wrote customer_email = NULL, and everything keyed on it silently did nothing:
// awardOrderPoints returns 0 without an email, order notifications had nobody to reach, and an
// abandoned cart could never be followed up. That is why points_ledger held ONE row against real
// paid orders — the buyers simply never existed as far as rewards were concerned.

const CHECKOUT = readFileSync(new URL('../../functions/api/checkout.js', import.meta.url), 'utf8');
const ORDER_PAGE = readFileSync(new URL('../../public/order.html', import.meta.url), 'utf8');

test('the checkout form asks for an email, and requires it', () => {
  assert.match(ORDER_PAGE, /id="custEmail"[^>]*type="email"/);
  assert.match(ORDER_PAGE, /id="custEmail"[^>]*required/);
  assert.match(ORDER_PAGE, /valid email for your receipt and rewards/);
});

test('the email is actually sent to the server', () => {
  // The field existing is worthless if the payload drops it.
  assert.match(ORDER_PAGE, /email: \$\('custEmail'\)\.value\.trim\(\)/);
});

test('a guest order now stores the typed email', () => {
  assert.match(CHECKOUT, /const typedEmail = String\(contact\.email \|\| ''\)/);
  assert.match(CHECKOUT, /sessEmail \|\| \(isEmail\(typedEmail\) \? typedEmail : null\)/);
});

test('a proven session still wins over a typed address', () => {
  // Order matters: someone typing a different address must not overwrite who they are signed in as.
  const expr = (CHECKOUT.match(/sessEmail \|\| \(isEmail\(typedEmail\)[^)]*\)[^,]*/) || [''])[0];
  assert.ok(expr.indexOf('sessEmail') < expr.indexOf('typedEmail'), 'session first');
});

test('a malformed typed email stores NULL rather than junk', () => {
  // customer_email is the CRM's join key — "asdf" in that column poisons points, notifications
  // and every customer lookup that follows.
  assert.match(CHECKOUT, /isEmail\(typedEmail\) \? typedEmail : null/);
});

test('member benefits still require a real session, not a typed address', () => {
  // A bound customer code can carry a discount. Auto-applying it from a TYPED email would let
  // anyone claim another member's benefit by guessing their address.
  assert.match(CHECKOUT, /if \(!promoInput && sessEmail\)/);
  assert.ok(!/autoCustomerCodeFor\(env, typedEmail\)/.test(CHECKOUT),
    'the bound-code lookup must never key off an unverified email');
});
