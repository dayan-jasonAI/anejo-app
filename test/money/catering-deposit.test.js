// The catering deposit — Decision #12.
//
// THE DEAD END. _lib/quote.js has computed a deposit since the day it was written and there was
// no way on earth to pay one: no row, no link, no record of what the customer had been told. The
// tests below pin the three things that make the new path safe to point at a real customer:
//
//   1. THE MATH. Half the total (25% until 2026-09-09), and a balance that is the REMAINDER — deposit + balance is
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
import { makeSqliteD1 } from '../helpers/sqlite-d1.js';
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

test('the deposit is 50% and the balance is the REMAINDER, not a second percentage', () => {
  assert.equal(DEPOSIT_PCT, 0.5, 'ratified rate — raised from 25% by Dayan on 2026-09-09');
  const s = depositSplit(120000);            // $1,200.00
  assert.equal(s.deposit_cents, 60000);
  assert.equal(s.balance_cents, 60000);
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


// A NOTE ON `today`. termsFor() clamps a deadline that has already gone by up to today, so a
// customer is never handed a date in the past. That makes any test with a fixed event date
// time-dependent: these all passed when written on 2026-09-09 and began failing on their own once
// the real date passed the 10th. Every call below pins `today` so the assertions mean what they
// say on any day. A test that depends on when it is run is not a test.
const TODAY = '2026-09-01';

// ---------- 2. the terms ----------

test('the terms resolve real dates from the event date, and never invent one', () => {
  const t = termsFor({ totalCents: 120000, depositCents: 60000, balanceCents: 60000, eventDate: '2026-09-20', today: TODAY });
  assert.equal(t.final_count_due, '2026-09-10', '10 calendar days before the event');
  assert.equal(t.balance_due_date, '2026-09-19', 'balance is due the DAY BEFORE the event');
  assert.equal(t.version, TERMS_VERSION);

  const noDate = termsFor({ totalCents: 120000, depositCents: 60000, balanceCents: 60000 });
  assert.equal(noDate.final_count_due, null, 'no event date must produce NO deadline, not a wrong one');
  assert.equal(dateMinusDays('not-a-date', 10), null);
});

test('every term the customer needs is actually IN the copy', () => {
  const t = termsFor({ totalCents: 120000, depositCents: 60000, balanceCents: 60000, eventDate: '2026-09-20', today: TODAY });
  const all = t.lines.join(' ');
  assert.match(t.lines.find((l) => l.startsWith('Deposit:')), /\$600\.00/, 'the deposit in dollars');
  assert.match(t.lines.find((l) => l.startsWith('Balance:')), /\$600\.00/, 'the balance in dollars');
  assert.match(all, /2026-09-10/, 'the final-count deadline');
  assert.match(all, /72 hours/, 'the refundable window');
  assert.match(all, /non-refundable/, 'and when it stops being refundable');
  assert.match(all, /cancel/i, 'the cancellation ladder');
  assert.match(all, /every dollar back/i, 'what happens when WE are the ones who fail');
  assert.match(termsSummary(t), /50% deposit/);
});

test('the cancellation ladder is computed from the SNAPSHOT, not from today’s constants', () => {
  // A booking is governed by the terms that were on the customer's screen. Feeding an old snapshot
  // in must produce that snapshot's answer, whatever this file says now.
  const t = termsFor({ totalCents: 120000, depositCents: 60000, balanceCents: 60000, eventDate: '2026-09-20', today: TODAY });
  assert.equal(cancellationOutcome(t, { daysBeforeEvent: 30 }).balance_refund_cents, 60000);
  assert.equal(cancellationOutcome(t, { daysBeforeEvent: 10 }).balance_refund_cents, 60000);
  assert.equal(cancellationOutcome(t, { daysBeforeEvent: 5 }).balance_refund_cents, 30000, 'half inside a week');
  assert.equal(cancellationOutcome(t, { daysBeforeEvent: 1 }).balance_refund_cents, 0, 'the food is already bought');
  // The deposit is never refunded by the ladder — it is refundable only in the 72h window.
  for (const d of [30, 10, 5, 1]) assert.equal(cancellationOutcome(t, { daysBeforeEvent: d }).deposit_refund_cents, 0);
  assert.ok(TERMS.cancellation_tiers.length >= 3, 'a ladder, not one flat cutoff');
});

// ---------- 3. the checkout ----------

function depositDb(onInsert = () => 1) {
  return makeD1([[/INSERT INTO catering_quotes/i, onInsert]]);
}

test('the deposit link charges 50%, names what it is, and carries the terms to the checkout page', async () => {
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
  assert.equal(r.deposit_cents, 60000);
  assert.equal(r.balance_cents, 60000);
  assert.equal(r.url, 'https://sq.link/deposit');

  const sent = sq.calls[0].body;
  assert.match(sq.calls[0].url, /online-checkout\/payment-links/);
  assert.equal(sent.order.line_items[0].base_price_money.amount, 60000, 'Square is asked for the DEPOSIT, never the total');
  assert.match(sent.order.line_items[0].name, /50% of \$1200\.00/, 'the customer sees what it is a percentage OF');
  assert.match(sent.order.note, /50% deposit/, 'the terms are on the hosted page, at deposit time');
  assert.equal(sent.checkout_options.allow_tipping, false, 'nobody tips a deposit');

  // Stored with the quote: the money, the terms, and the deadlines.
  assert.ok(stored.includes(60000) && stored.includes(120000));
  assert.ok(stored.includes(TERMS_VERSION), 'the terms VERSION is on the row');
  // Derived, not hardcoded: createDepositCheckout calls termsFor() on the real clock, so a literal
  // date here rots the moment the calendar passes it. What this asserts is the claim in the test's
  // own name — the deadline the terms engine produced is what got stored.
  const expectedDeadline = termsFor({ totalCents: 120000, depositCents: 60000, balanceCents: 60000, eventDate: '2026-09-20' }).final_count_due;
  assert.ok(stored.includes(expectedDeadline), 'the final-count deadline is on the row');
  assert.ok(stored.includes('marisol@example.test'), 'email normalised');
  const termsJson = stored.find((a) => typeof a === 'string' && a.startsWith('{') && a.includes('cancellation_tiers'));
  assert.ok(termsJson, 'the FULL terms snapshot is stored, not a reference to them');
  assert.equal(JSON.parse(termsJson).deposit_cents, 60000);
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

function paymentEnv(status = 'unpaid') {
  const DB = makeSqliteD1();
  DB.sqlite.prepare(`INSERT INTO catering_quotes
    (id,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,square_order_id,terms_version,terms_json,created_at,updated_at)
    VALUES ('cq_test',30,120000,0.5,60000,60000,?,'sqo_test','test','{}',1,1)`).run(status);
  return { DB };
}
test('only an exact verified USD deposit books the quote and retains its receipt once', async () => {
  const env = paymentEnv();
  assert.equal(await markDepositPaid(env, 'sqo_test', 60000, 'USD', 'payment_test'), 'cq_test');
  assert.equal(await markDepositPaid(env, 'sqo_test', 60000, 'USD', 'payment_test'), null);
  const q = env.DB.one("SELECT * FROM catering_quotes WHERE id='cq_test'");
  assert.equal(q.deposit_status, 'paid');
  assert.equal(q.deposit_paid_cents, 60000);
  assert.equal(q.balance_status, 'due');
  assert.equal(env.DB.rows("SELECT * FROM activity_log WHERE event='catering.deposit.receipt'").length, 1);
});
test('wrong, missing, noninteger or non-USD captures are durably held for reconciliation', async () => {
  for (const [amount,currency,payment] of [[30000,'USD','a'],[60001,'USD','a'],[60000.1,'USD','a'],
    [60000,'EUR','a'],[null,'USD','a'],['60000','USD','a'],[60000,'USD',null],[0,'USD','a']]) {
    const env = paymentEnv();
    const result = await markDepositPaid(env,'sqo_test',amount,currency,payment);
    assert.equal(result.reconciliation_required,true);
    assert.equal(env.DB.one("SELECT deposit_status FROM catering_quotes").deposit_status,'unpaid');
    const receipt = env.DB.one("SELECT properties FROM activity_log");
    assert.equal(JSON.parse(receipt.properties).outcome,'reconciliation_required');
    assert.deepEqual(await markDepositPaid(env,'sqo_test',amount,currency,payment),result);
  }
});
test('void quotes and additional captures on paid quotes never silently book again', async () => {
  for(const status of ['void','paid']) {
    const env=paymentEnv(status);
    assert.equal((await markDepositPaid(env,'sqo_test',60000,'USD','another_capture')).reconciliation_required,true);
    assert.equal(env.DB.one('SELECT deposit_status FROM catering_quotes').deposit_status,status);
  }
});
test('unrelated payments are ignored but deposit storage failures propagate for retry', async () => {
  const env=paymentEnv();
  assert.equal(await markDepositPaid(env,'unrelated',1234,'USD','p'),null);
  assert.equal(await markDepositPaid(env,null,1234,'USD','p'),null);
  assert.equal(await markDepositPaid({},'sqo_test',1234,'USD','p'),null);
  env.DB.batch=async()=>{throw Error('storage unavailable');};
  await assert.rejects(markDepositPaid(env,'sqo_test',60000,'USD','p'),/storage unavailable/);
  assert.equal(env.DB.one('SELECT deposit_status FROM catering_quotes').deposit_status,'unpaid');
});
