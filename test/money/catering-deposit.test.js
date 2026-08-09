// The catering deposit — Decision #12.
//
// THE DEAD END. _lib/quote.js has computed a deposit since the day it was written and there was
// no way on earth to pay one: no row, no link, no record of what the customer had been told. The
// tests below pin the three things that make the new path safe to point at a real customer:
//
//   1. THE MATH. 25% of the total, and a balance that is the REMAINDER — deposit + balance is
//      exactly the total at every rounding boundary. Two halves that don't sum to the whole is an
//      argument with a paying customer.
//   2. THE TERMS ARE STORED, NOT LOOKED UP. What the customer agreed to lives on the row, so
//      changing the standard terms next year cannot retroactively re-write a booking.
//   3. NO ORPHANS, EITHER WAY. No quote row without a payable link; no payable link handed back
//      when the row could not be written.
//
// Square is stubbed at `fetch` throughout. Nothing here can reach live money.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeD1 } from '../helpers/d1.js';
import { depositSplit, createDepositCheckout, markDepositPaid } from '../../functions/_lib/catering_deposit.js';
import { DEPOSIT_PCT, TERMS, TERMS_VERSION, termsFor, termsSummary, cancellationOutcome, dateMinusDays } from '../../functions/_lib/catering_terms.js';

const ENV = { SQUARE_ACCESS_TOKEN: 'tok', SQUARE_LOCATION_ID: 'LOC', SQUARE_ENV: 'sandbox' };

// A Square that answers with a payment link, and records what we asked it for.
function stubSquare(response = { payment_link: { id: 'pl_1', order_id: 'sqo_1', long_url: 'https://sq.link/deposit' } }, ok = true) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body || '{}') });
    return { ok, status: ok ? 200 : 400, json: async () => response };
  };
  return { calls, restore: () => { globalThis.fetch = real; } };
}

// ---------- 1. the math ----------

test('the deposit is 25% and the balance is the REMAINDER, not a second percentage', () => {
  assert.equal(DEPOSIT_PCT, 0.25, 'ratified rate');
  const s = depositSplit(120000);            // $1,200.00
  assert.equal(s.deposit_cents, 30000);
  assert.equal(s.balance_cents, 90000);
  assert.equal(s.deposit_cents + s.balance_cents, s.total_cents);
});

test('deposit + balance sums to the total at EVERY rounding boundary', () => {
  // The failure this catches: computing the balance as total × 0.75 independently. On a total
  // like 1,001 cents that yields 751 while the deposit rounds to 250 — a penny that does not
  // exist, on a document a customer is invited to argue with.
  for (let total = 1; total <= 3000; total++) {
    const s = depositSplit(total);
    assert.equal(s.deposit_cents + s.balance_cents, total, `broke at ${total}¢`);
    assert.ok(s.deposit_cents >= 0 && s.balance_cents >= 0);
  }
});

test('a deposit refuses on a total or a rate that cannot be real', () => {
  assert.equal(depositSplit(0).ok, false);
  assert.equal(depositSplit(-100).ok, false);
  assert.equal(depositSplit('abc').ok, false);
  assert.equal(depositSplit(10000, 25).ok, false, '25 meaning 25% is the classic input error');
  assert.equal(depositSplit(10000, 0).ok, false);
  assert.equal(depositSplit(10000, 1).ok, false);
});

// ---------- 2. the terms ----------

test('the terms resolve real dates from the event date, and never invent one', () => {
  const t = termsFor({ totalCents: 120000, depositCents: 30000, balanceCents: 90000, eventDate: '2026-09-20' });
  assert.equal(t.final_count_due, '2026-09-10', '10 calendar days before the event');
  assert.equal(t.balance_due_date, '2026-09-20', 'balance is due on the day');
  assert.equal(t.version, TERMS_VERSION);

  const noDate = termsFor({ totalCents: 120000, depositCents: 30000, balanceCents: 90000 });
  assert.equal(noDate.final_count_due, null, 'no event date must produce NO deadline, not a wrong one');
  assert.equal(dateMinusDays('not-a-date', 10), null);
});

test('every term the customer needs is actually IN the copy', () => {
  const t = termsFor({ totalCents: 120000, depositCents: 30000, balanceCents: 90000, eventDate: '2026-09-20' });
  const all = t.lines.join(' ');
  assert.match(all, /\$300\.00/, 'the deposit in dollars');
  assert.match(all, /\$900\.00/, 'the balance in dollars');
  assert.match(all, /2026-09-10/, 'the final-count deadline');
  assert.match(all, /72 hours/, 'the refundable window');
  assert.match(all, /non-refundable/, 'and when it stops being refundable');
  assert.match(all, /cancel/i, 'the cancellation ladder');
  assert.match(all, /every dollar back/i, 'what happens when WE are the ones who fail');
  assert.match(termsSummary(t), /25% deposit/);
});

test('the cancellation ladder is computed from the SNAPSHOT, not from today’s constants', () => {
  // A booking is governed by the terms that were on the customer's screen. Feeding an old snapshot
  // in must produce that snapshot's answer, whatever this file says now.
  const t = termsFor({ totalCents: 120000, depositCents: 30000, balanceCents: 90000, eventDate: '2026-09-20' });
  assert.equal(cancellationOutcome(t, { daysBeforeEvent: 30 }).balance_refund_cents, 90000);
  assert.equal(cancellationOutcome(t, { daysBeforeEvent: 10 }).balance_refund_cents, 90000);
  assert.equal(cancellationOutcome(t, { daysBeforeEvent: 5 }).balance_refund_cents, 45000, 'half inside a week');
  assert.equal(cancellationOutcome(t, { daysBeforeEvent: 1 }).balance_refund_cents, 0, 'the food is already bought');
  // The deposit is never refunded by the ladder — it is refundable only in the 72h window.
  for (const d of [30, 10, 5, 1]) assert.equal(cancellationOutcome(t, { daysBeforeEvent: d }).deposit_refund_cents, 0);
  assert.ok(TERMS.cancellation_tiers.length >= 3, 'a ladder, not one flat cutoff');
});

// ---------- 3. the checkout ----------

function depositDb(onInsert = () => 1) {
  return makeD1([[/INSERT INTO catering_quotes/i, onInsert]]);
}

test('the deposit link charges 25%, names what it is, and carries the terms to the checkout page', async () => {
  const sq = stubSquare();
  let stored = null;
  const env = { ...ENV, DB: depositDb(({ args }) => { stored = args; return 1; }) };

  const r = await createDepositCheckout(env, {
    totalCents: 120000, guests: 60, eventDate: '2026-09-20',
    customerName: 'Marisol Reyes', customerEmail: 'MARISOL@example.test',
    baseUrl: 'https://anejocateringco.com',
  });
  sq.restore();

  assert.equal(r.ok, true);
  assert.equal(r.deposit_cents, 30000);
  assert.equal(r.balance_cents, 90000);
  assert.equal(r.url, 'https://sq.link/deposit');

  const sent = sq.calls[0].body;
  assert.match(sq.calls[0].url, /online-checkout\/payment-links/);
  assert.equal(sent.order.line_items[0].base_price_money.amount, 30000, 'Square is asked for the DEPOSIT, never the total');
  assert.match(sent.order.line_items[0].name, /25% of \$1200\.00/, 'the customer sees what it is a percentage OF');
  assert.match(sent.order.note, /25% deposit/, 'the terms are on the hosted page, at deposit time');
  assert.equal(sent.checkout_options.allow_tipping, false, 'nobody tips a deposit');

  // Stored with the quote: the money, the terms, and the deadlines.
  assert.ok(stored.includes(30000) && stored.includes(90000) && stored.includes(120000));
  assert.ok(stored.includes(TERMS_VERSION), 'the terms VERSION is on the row');
  assert.ok(stored.includes('2026-09-10'), 'the final-count deadline is on the row');
  assert.ok(stored.includes('marisol@example.test'), 'email normalised');
  const termsJson = stored.find((a) => typeof a === 'string' && a.startsWith('{') && a.includes('cancellation_tiers'));
  assert.ok(termsJson, 'the FULL terms snapshot is stored, not a reference to them');
  assert.equal(JSON.parse(termsJson).deposit_cents, 30000);
});

test('the idempotency key is the quote id, so a retry cannot mint two links', async () => {
  const sq = stubSquare();
  const env = { ...ENV, DB: depositDb() };
  const r = await createDepositCheckout(env, { totalCents: 40000, guests: 20, eventDate: '2026-10-01' });
  sq.restore();
  assert.equal(sq.calls[0].body.idempotency_key, r.quote_id);
});

test('NO ORPHANS: a Square failure writes no quote row', async () => {
  const sq = stubSquare({ errors: [{ detail: 'CARD_DECLINED-ish failure' }] }, false);
  let inserts = 0;
  const env = { ...ENV, DB: depositDb(() => { inserts++; return 1; }) };
  const r = await createDepositCheckout(env, { totalCents: 40000, guests: 20 });
  sq.restore();
  assert.equal(r.ok, false);
  assert.match(r.error, /CARD_DECLINED-ish/);
  assert.equal(inserts, 0, 'a quote that cannot be paid must not exist');
});

test('NO ORPHANS: a failed write refuses to hand back a link, and says not to send it', async () => {
  const sq = stubSquare();
  const env = { ...ENV, DB: depositDb(() => { throw new Error('no such table: catering_quotes'); }) };
  const r = await createDepositCheckout(env, { totalCents: 40000, guests: 20 });
  sq.restore();
  assert.equal(r.ok, false);
  assert.equal(r.url, undefined, 'a link whose payment nothing will reconcile must never be returned');
  assert.match(r.error, /Do not send it/);
});

test('a deposit is refused outright when Square is not configured', async () => {
  const r = await createDepositCheckout({ DB: depositDb() }, { totalCents: 40000, guests: 20 });
  assert.equal(r.ok, false);
  assert.match(r.error, /Square is not configured/);
});

test('a quote with no guests is refused — the engine does not assume a headcount either', async () => {
  const sq = stubSquare();
  const env = { ...ENV, DB: depositDb() };
  for (const guests of [0, -3, 'lots', null]) {
    const r = await createDepositCheckout(env, { totalCents: 40000, guests });
    assert.equal(r.ok, false, `guests=${guests}`);
  }
  sq.restore();
  assert.equal(sq.calls.length, 0, 'Square is never called for a quote we would refuse');
});

// ---------- 4. the balance ----------

test('a paid deposit flips ONCE and leaves the balance owing', async () => {
  const updates = [];
  const DB = makeD1([
    [/SELECT id, deposit_cents FROM catering_quotes/i, () => ({ id: 'cq_1', deposit_cents: 30000 })],
    [/UPDATE catering_quotes SET deposit_status='paid'/i, ({ args }) => { updates.push(args); return 1; }],
  ]);
  const id = await markDepositPaid({ DB }, 'sqo_1', 30000);
  assert.equal(id, 'cq_1');
  assert.equal(updates.length, 1);
  assert.equal(updates[0][1], 30000, 'what Square actually captured is what is recorded');
  // Nothing in that UPDATE touches the balance: paying a deposit does not settle an event.
  assert.doesNotMatch(DB.sqlLog().join(' '), /balance_status\s*=\s*'paid'/);
});

test('a webhook retry is a no-op — the deposit cannot be recorded twice', async () => {
  let flips = 0;
  const DB = makeD1([
    // Second delivery: the `deposit_status='unpaid'` guard finds nothing.
    [/SELECT id, deposit_cents FROM catering_quotes/i, () => null],
    [/UPDATE catering_quotes/i, () => { flips++; return 1; }],
  ]);
  assert.equal(await markDepositPaid({ DB }, 'sqo_1', 30000), null);
  assert.equal(flips, 0);
});

test('a payment that matches no quote is silently ignored — most payments are not deposits', async () => {
  const DB = makeD1([[/SELECT id, deposit_cents FROM catering_quotes/i, () => null]]);
  assert.equal(await markDepositPaid({ DB }, 'sqo_unrelated', 1234), null);
  assert.equal(await markDepositPaid({ DB }, null, 1234), null);
  assert.equal(await markDepositPaid({}, 'sqo_1', 1234), null, 'no DB binding at all');
});
