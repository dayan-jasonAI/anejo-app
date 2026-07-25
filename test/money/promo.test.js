// Promo + affiliate codes (functions/_lib/promo.js).
//
// Two rules here are worth more than the rest combined, and both were live bugs:
//   1. A 'customer' code is NON-SHAREABLE — it must be bound to the redeeming session's email.
//   2. An affiliate CANNOT redeem their own code, INCLUDING AS A GUEST. Unguarded, an
//      influencer's code was a self-service discount they could ring up all day.
// The third is claimPromoUse's atomicity: max_uses is only real if exactly one caller wins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePromo, claimPromoUse, releasePromoUse, norm, payoutOptions } from '../../functions/_lib/promo.js';
import { makeD1 } from '../helpers/d1.js';

const HOUR = 3600 * 1000;

// A promo_codes table with just enough behaviour to be truthful: the conditional UPDATE that
// backs claimPromoUse is evaluated against the stored row exactly the way SQLite evaluates it.
function promoEnv({ codes = [], trainers = {}, paidOrders = {} } = {}) {
  const byCode = new Map(codes.map((c) => [c.code, { uses: 0, status: 'active', pct_off: 0, points_mult: 1, ...c }]));
  const DB = makeD1([
    [/^SELECT \* FROM promo_codes WHERE code = \?/, ({ args }) => byCode.get(args[0]) || null],
    [/SELECT email, phone FROM trainers WHERE id = \?/, ({ args }) => trainers[args[0]] || null],
    [/SELECT COUNT\(\*\) n FROM orders/, ({ args }) => ({ n: paidOrders[args[0]] || 0 })],
    [/^UPDATE promo_codes SET uses = uses \+ 1/, ({ args }) => {
      const [code, status] = args;
      const row = byCode.get(code);
      if (!row || row.status !== status) return 0;
      if (row.max_uses != null && (row.uses || 0) >= row.max_uses) return 0;
      row.uses = (row.uses || 0) + 1;
      return 1;
    }],
    [/^UPDATE promo_codes SET uses = MAX\(0, uses - 1\)/, ({ args }) => {
      const row = byCode.get(args[0]);
      if (!row) return 0;
      row.uses = Math.max(0, (row.uses || 0) - 1);
      return 1;
    }],
  ]);
  return { env: { DB }, byCode, DB };
}

const CUSTOMER = { code: 'FOUND-ABC123', kind: 'customer', bound_email: 'dayan@example.com', points_mult: 2 };
const AFFILIATE = {
  code: 'COACHJEN', kind: 'affiliate', partner_id: 'trn_jen', pct_off: 10, points_mult: 2,
  perk: 'fit_drink', perk_first_order_only: 1, commission_pct: 10,
};
const JEN = { trn_jen: { email: 'JEN@Fitness.com', phone: '+1 (561) 555-0134' } };

// ---- customer codes: non-shareable ----

test('a customer code redeems for the account it was issued to', async () => {
  const { env } = promoEnv({ codes: [CUSTOMER] });
  const r = await evaluatePromo(env, { code: 'found-abc123', sessionEmail: 'Dayan@Example.com ', subtotalCents: 5000 });
  assert.equal(r.ok, true, 'code + email are both case/whitespace insensitive');
  assert.equal(r.points_mult, 2);
  assert.equal(r.discount_cents, 0, 'the Founding Legacy benefit is points, not money off');
});

test('A CUSTOMER CODE IS NOT SHAREABLE — another signed-in account is refused', async () => {
  const { env } = promoEnv({ codes: [CUSTOMER] });
  const r = await evaluatePromo(env, { code: 'FOUND-ABC123', sessionEmail: 'friend@example.com', subtotalCents: 5000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'not_your_code');
});

test('a GUEST cannot redeem a customer code — there is no email to bind it to', async () => {
  const { env } = promoEnv({ codes: [CUSTOMER] });
  for (const sessionEmail of [null, undefined, '', '   ']) {
    const r = await evaluatePromo(env, { code: 'FOUND-ABC123', sessionEmail, guestPhone: '5615550199', subtotalCents: 5000 });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'signin_required', `sessionEmail=${JSON.stringify(sessionEmail)} must not pass`);
  }
});

// ---- affiliate codes: anti-self-referral (the P0) ----

test('an affiliate code works for a real follower, with the first-order perk', async () => {
  const { env } = promoEnv({ codes: [AFFILIATE], trainers: JEN });
  const r = await evaluatePromo(env, { code: 'COACHJEN', sessionEmail: null, guestPhone: '561-555-0199', subtotalCents: 5000 });
  assert.equal(r.ok, true);
  assert.equal(r.perk, 'fit_drink');
  assert.equal(r.commission_pct, 10);
  assert.equal(r.partner_id, 'trn_jen');
});

test('SELF-REFERRAL IS BLOCKED FOR A GUEST MATCHING ON PHONE', async () => {
  // The P0. A partner checking out LOGGED OUT gives a phone, not an email — before this guard,
  // their own code was a permanent self-service discount plus commission back to themselves.
  const { env } = promoEnv({ codes: [AFFILIATE], trainers: JEN });
  const r = await evaluatePromo(env, { code: 'COACHJEN', sessionEmail: null, guestPhone: '5615550134', subtotalCents: 5000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'self_referral');
});

test('guest phone matching survives every formatting the partner might type', async () => {
  const { env } = promoEnv({ codes: [AFFILIATE], trainers: JEN });
  for (const phone of ['5615550134', '561-555-0134', '(561) 555-0134', '+1 561 555 0134', '15615550134', '+15615550134']) {
    const r = await evaluatePromo(env, { code: 'COACHJEN', guestPhone: phone, subtotalCents: 5000 });
    assert.equal(r.reason, 'self_referral', `${phone} must be recognised as the partner`);
  }
});

test('a DIFFERENT phone is not treated as the partner', async () => {
  const { env } = promoEnv({ codes: [AFFILIATE], trainers: JEN });
  const r = await evaluatePromo(env, { code: 'COACHJEN', guestPhone: '5615550135', subtotalCents: 5000 });
  assert.equal(r.ok, true);
});

test('a short/garbage phone never matches — a 9-digit number must not collide with a partner', async () => {
  const { env } = promoEnv({ codes: [AFFILIATE], trainers: { trn_jen: { email: 'jen@fitness.com', phone: '' } } });
  const r = await evaluatePromo(env, { code: 'COACHJEN', guestPhone: '555', subtotalCents: 5000 });
  assert.equal(r.ok, true, 'an unusable phone on either side must not produce a false block');
});

test('self-referral is blocked on the SIGNED-IN email too', async () => {
  const { env } = promoEnv({ codes: [AFFILIATE], trainers: JEN });
  const r = await evaluatePromo(env, { code: 'COACHJEN', sessionEmail: ' jen@FITNESS.com ', subtotalCents: 5000 });
  assert.equal(r.reason, 'self_referral');
});

test('self-referral is blocked on a guest EMAIL when one is supplied', async () => {
  const { env } = promoEnv({ codes: [AFFILIATE], trainers: JEN });
  const r = await evaluatePromo(env, { code: 'COACHJEN', guestEmail: 'jen@fitness.com', subtotalCents: 5000 });
  assert.equal(r.reason, 'self_referral');
});

test('the perk is withheld from a customer who has already had a paid order', async () => {
  const { env } = promoEnv({ codes: [AFFILIATE], trainers: JEN, paidOrders: { 'repeat@example.com': 3 } });
  const r = await evaluatePromo(env, { code: 'COACHJEN', sessionEmail: 'repeat@example.com', subtotalCents: 5000 });
  assert.equal(r.ok, true);
  assert.equal(r.perk, null, 'first-order perk, once');
});

// ---- validity gates ----

test('expired, not-yet-started, disabled, exhausted and unknown codes are all refused', async () => {
  const t = Date.now();
  const { env } = promoEnv({
    codes: [
      { code: 'OLD', kind: 'campaign', pct_off: 20, expires_at: t - HOUR },
      { code: 'EARLY', kind: 'campaign', pct_off: 20, starts_at: t + HOUR },
      { code: 'OFF', kind: 'campaign', pct_off: 20, status: 'disabled' },
      { code: 'USEDUP', kind: 'campaign', pct_off: 20, max_uses: 5, uses: 5 },
    ],
  });
  const reason = async (code) => (await evaluatePromo(env, { code, subtotalCents: 5000 })).reason;
  assert.equal(await reason('OLD'), 'expired');
  assert.equal(await reason('EARLY'), 'not_started');
  assert.equal(await reason('OFF'), 'disabled');
  assert.equal(await reason('USEDUP'), 'exhausted');
  assert.equal(await reason('NOPE'), 'not_found');
  assert.equal(await reason(''), 'empty');
});

test('a code that has not reached its cap still evaluates', async () => {
  const { env } = promoEnv({ codes: [{ code: 'LAUNCH', kind: 'campaign', pct_off: 20, max_uses: 5, uses: 4 }] });
  assert.equal((await evaluatePromo(env, { code: 'LAUNCH', subtotalCents: 5000 })).ok, true);
});

test('with no database at all, a promo fails CLOSED', async () => {
  const r = await evaluatePromo({}, { code: 'ANY', subtotalCents: 5000 });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'unavailable');
});

// ---- discount math ----

test('the discount is computed from the SERVER percentage and rounds in the house favour', async () => {
  const { env } = promoEnv({ codes: [{ code: 'SAVE15', kind: 'campaign', pct_off: 15 }] });
  const r = await evaluatePromo(env, { code: 'SAVE15', subtotalCents: 3333 });
  assert.equal(r.discount_cents, 499, 'floor(3333 × 15%) = 499, never a rounded-up 500');
  assert.equal(r.pct_off, 15);
});

test('a negative or junk subtotal cannot produce a negative discount', async () => {
  const { env } = promoEnv({ codes: [{ code: 'SAVE15', kind: 'campaign', pct_off: 15 }] });
  for (const sub of [-5000, 'abc', null, undefined]) {
    assert.equal((await evaluatePromo(env, { code: 'SAVE15', subtotalCents: sub })).discount_cents, 0);
  }
});

// ---- the use cap has to be ATOMIC ----

test('TWO SEQUENTIAL CLAIMS ON A max_uses:1 CODE YIELD true THEN false', async () => {
  const { env, byCode } = promoEnv({ codes: [{ code: 'ONLYONE', kind: 'campaign', pct_off: 50, max_uses: 1 }] });
  assert.equal(await claimPromoUse(env, 'ONLYONE'), true, 'first caller wins the slot');
  assert.equal(await claimPromoUse(env, 'ONLYONE'), false, 'second caller must NOT get the same slot');
  assert.equal(byCode.get('ONLYONE').uses, 1, 'and the counter must not have run past the cap');
});

test('a 3-use code grants exactly three slots', async () => {
  const { env } = promoEnv({ codes: [{ code: 'THREE', kind: 'campaign', max_uses: 3 }] });
  const results = [];
  for (let i = 0; i < 5; i++) results.push(await claimPromoUse(env, 'THREE'));
  assert.deepEqual(results, [true, true, true, false, false]);
});

test('an UNCAPPED code always claims, and still counts uses', async () => {
  const { env, byCode } = promoEnv({ codes: [{ code: 'FOREVER', kind: 'customer', bound_email: 'a@b.c', max_uses: null }] });
  assert.equal(await claimPromoUse(env, 'forever'), true);
  assert.equal(await claimPromoUse(env, 'FOREVER'), true);
  assert.equal(byCode.get('FOREVER').uses, 2);
});

test('a disabled code cannot be claimed even if it has slots left', async () => {
  const { env } = promoEnv({ codes: [{ code: 'OFF', kind: 'campaign', status: 'disabled', max_uses: 10 }] });
  assert.equal(await claimPromoUse(env, 'OFF'), false);
});

test('claimPromoUse fails closed on an unknown code, an empty code, or no database', async () => {
  const { env } = promoEnv({ codes: [] });
  assert.equal(await claimPromoUse(env, 'GHOST'), false);
  assert.equal(await claimPromoUse(env, ''), false);
  assert.equal(await claimPromoUse({}, 'ANY'), false);
});

test('releasing a failed checkout gives the slot back — exactly once', async () => {
  const { env, byCode } = promoEnv({ codes: [{ code: 'ONLYONE', kind: 'campaign', max_uses: 1 }] });
  assert.equal(await claimPromoUse(env, 'ONLYONE'), true);
  await releasePromoUse(env, 'ONLYONE');
  assert.equal(byCode.get('ONLYONE').uses, 0);
  assert.equal(await claimPromoUse(env, 'ONLYONE'), true, 'the released slot is usable again');
});

test('release can never drive the counter negative', async () => {
  const { env, byCode } = promoEnv({ codes: [{ code: 'ONLYONE', kind: 'campaign', max_uses: 1 }] });
  await releasePromoUse(env, 'ONLYONE');
  await releasePromoUse(env, 'ONLYONE');
  assert.equal(byCode.get('ONLYONE').uses, 0);
});

// ---- small pure helpers ----

test('norm strips whitespace and upper-cases so a pasted code still matches', () => {
  assert.equal(norm(' coach jen \n'), 'COACHJEN');
  assert.equal(norm(null), '');
});

test('partner credit is worth 1.5x cash, rounded to the cent', () => {
  assert.deepEqual(payoutOptions(2500), { cash_cents: 2500, credit_cents: 3750 });
  assert.deepEqual(payoutOptions(333), { cash_cents: 333, credit_cents: 500 });
  assert.deepEqual(payoutOptions(-10), { cash_cents: 0, credit_cents: 0 });
});
