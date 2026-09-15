// The two deadlines a catering quote prints, and the deposit rate behind them.
//
// WHAT HAPPENED (Dayan, 2026-09-09). He priced a 15 Sep event in the Hub and the quote read
// "Final count due 2026-09-05" — four days in the PAST. The arithmetic was right: the policy is
// ten days before the event, and 15 − 10 = 5. The policy was wrong for a booking made six days
// out. Nothing clamped it, so a client could have received a contract with an expired deadline.
//
// Two other changes ride with the fix, both his call on the same day: the deposit goes 25% → 50%,
// and the balance falls due the day BEFORE the event rather than the day of.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { termsFor, termsSummary, DEPOSIT_PCT, TERMS, TERMS_VERSION, dateMinusDays } from '../../functions/_lib/catering_terms.js';

const quote = (eventDate, today, total = 42500) => termsFor({
  totalCents: total,
  depositCents: Math.round(total * DEPOSIT_PCT),
  balanceCents: total - Math.round(total * DEPOSIT_PCT),
  eventDate, today,
});

// ---------------------------------------------------------------- the bug he found

test("Dayan's own 15 Sep quote, priced on 9 Sep, prints no past deadline", () => {
  const t = quote('2026-09-15', '2026-09-09');
  assert.equal(t.final_count_due, '2026-09-09', 'ten days out has already gone — the answer is today');
  assert.ok(t.final_count_due >= '2026-09-09', 'never in the past');
  assert.equal(t.short_notice, true, 'and the quote knows to explain why');
});

test('no deadline on any quote can precede the day it was written', () => {
  // Sweep every booking distance from same-day to a year out.
  const today = '2026-09-09';
  for (let days = 0; days <= 365; days++) {
    const eventDate = dateMinusDays('2027-09-09', 365 - days);
    const t = quote(eventDate, today);
    assert.ok(t.final_count_due >= today, `final count went backwards for ${eventDate}`);
    assert.ok(t.balance_due_date >= today, `balance date went backwards for ${eventDate}`);
  }
});

test('a normal booking is untouched by the clamp', () => {
  // 40 days out: both deadlines sit comfortably in the future and follow the published policy.
  const t = quote('2026-10-19', '2026-09-09');
  assert.equal(t.final_count_due, '2026-10-09', 'exactly ten days before');
  assert.equal(t.balance_due_date, '2026-10-18', 'exactly one day before');
  assert.equal(t.short_notice, false, 'nothing unusual to explain');
});

test('the clamp moves the deadline forward, never past the event', () => {
  for (const [event, today] of [['2026-09-15', '2026-09-09'], ['2026-09-10', '2026-09-09'], ['2026-09-09', '2026-09-09']]) {
    const t = quote(event, today);
    assert.ok(t.final_count_due <= t.event_date, `final count must not land after the event (${event})`);
    assert.ok(t.balance_due_date <= t.event_date, `balance must not fall due after the event (${event})`);
  }
});

// ---------------------------------------------------------------- balance the day before

test('the balance is due the day before the event, not the day of', () => {
  const t = quote('2026-12-25', '2026-09-09');
  assert.equal(t.balance_due_date, '2026-12-24');
  assert.notEqual(t.balance_due_date, t.event_date, 'chasing money while the van loads is the thing this prevents');
  assert.equal(TERMS.balance_due_days_before, 1);
});

test('the customer-facing lines say the day before, in words as well as dates', () => {
  const t = quote('2026-12-25', '2026-09-09');
  const balanceLine = t.lines.find((l) => l.startsWith('Balance:'));
  assert.match(balanceLine, /2026-12-24/);
  assert.match(termsSummary(t), /balance due the day before the event/);
  assert.ok(!/balance due on the day of the event/.test(termsSummary(t)), 'the old promise must be gone');
});

// ---------------------------------------------------------------- 50% deposit

test('half up front', () => {
  assert.equal(DEPOSIT_PCT, 0.5);
  const t = quote('2026-12-25', '2026-09-09', 42500);
  assert.equal(t.deposit_cents, 21250);
  assert.equal(t.balance_cents, 21250);
  assert.equal(t.deposit_cents + t.balance_cents, t.total_cents, 'the split must never lose or invent a cent');
});

test('the deposit line quotes the real rate, not a hardcoded 25%', () => {
  const t = quote('2026-12-25', '2026-09-09', 42500);
  const line = t.lines[0];
  assert.match(line, /50%/);
  assert.ok(!/25%/.test(line), 'the old rate must not survive anywhere a customer reads');
  assert.match(line, /\$212\.50/);
});

test('an odd total splits without a rounding leak', () => {
  for (const total of [1, 3, 99, 12345, 99999, 100001]) {
    const t = termsFor({
      totalCents: total,
      depositCents: Math.round(total * DEPOSIT_PCT),
      balanceCents: total - Math.round(total * DEPOSIT_PCT),
      eventDate: '2026-12-25', today: '2026-09-09',
    });
    assert.equal(t.deposit_cents + t.balance_cents, total, `cents leaked at ${total}`);
  }
});

// ---------------------------------------------------------------- the version marker

test('the terms version moved with the terms', () => {
  // Every quote snapshots terms_json + terms_version. If the version had not moved, two quotes
  // sold under materially different promises would be indistinguishable in the table.
  assert.notEqual(TERMS_VERSION, '2026-08-v1', 'a material change needs a new version');
  assert.equal(TERMS.deposit_pct, DEPOSIT_PCT, 'the published table and the constant must agree');
});

test('an unparseable event date yields no deadline rather than a wrong one', () => {
  for (const bad of [null, undefined, '', 'next Friday', '2026-13-45']) {
    const t = quote(bad, '2026-09-09');
    assert.equal(t.final_count_due, null, `invented a final count for "${bad}"`);
    assert.equal(t.balance_due_date, null, `invented a balance date for "${bad}"`);
  }
});
