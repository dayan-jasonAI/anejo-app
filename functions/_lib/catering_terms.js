// catering_terms.js — the booking terms a customer agrees to when they pay the deposit.
// Files under _lib are NOT routed.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHERE THESE NUMBERS CAME FROM
//
// Dayan's instruction was "standard practices — research what successful catering businesses do
// and build around that", so every figure below is anchored to a published catering policy, not
// invented. Sources read 2026-08-09:
//
//   [1] L.A. Catering — Payment Policies. https://www.la-catering.com/payment-policies/
//       "A 25% deposit is required to consummate the contract and to confirm your event(s)."
//       "All deposits are non-refundable." Final count 48h prior; balance due by the day of the
//       event. This is the closest published match to the ratified 25% and is the anchor for the
//       deposit rate and for balance-due-by-event-day.
//
//   [2] HoneyBook — Catering Contract Template: Free Sample and Key Clauses.
//       https://www.honeybook.com/blog/catering-contract-template
//       Recommends a final-headcount deadline "10-15 days prior to the event", and a tiered
//       "cancellation ladder" rather than one flat rate — their worked example being deposits
//       forfeited after 30 days, a 50% refund at 14 days, a full refund within 7 days [of booking].
//
//   [3] Iowa State University Catering — Terms and Conditions.
//       https://catering.iastate.edu/terms-and-conditions/
//       Final guest count due 5 business days prior; a deposit reserves the date; cancellation
//       inside 5 business days carries a 100% fee, 6–10 business days a 25% fee. The two-step
//       "some notice costs something, no notice costs everything" shape below is theirs.
//
//   [4] International Caterers Association — Corporate Full Service deposit & cancellation policy.
//       https://www.internationalcaterers.org/assets/docs/Contract%20Corporate%20Contract.pdf
//       Trade-association corporate template: staged cancellation credit by days-out rather than
//       a single cutoff.
//
// WHERE WE DEVIATE FROM THE STRICTEST READING, AND WHY
//
//   · [1] and much of the industry make the deposit non-refundable from the minute it is paid.
//     We give a 72-hour "changed our mind" window in which it is refunded in full. A same-week
//     booking that a customer regrets three hours later costs the kitchen nothing, and keeping
//     that money is how a young caterer buys a chargeback and a review. After 72 hours (and
//     always inside 14 days of the event) it is non-refundable, which is the standard.
//
//   · Final count at 10 days [2] rather than 48 hours [1]. Añejo buys and preps against the
//     count; 48 hours is a restaurant's answer, not a caterer's, and [3]'s 5-business-day rule
//     is ~7 calendar days. 10 days is inside the published range and is the honest one for a
//     kitchen this size.
//
// EVERY NUMBER HERE IS VERSIONED AND SNAPSHOTTED ONTO THE QUOTE (catering_quotes.terms_json).
// Changing this file changes what NEW quotes promise. It must never change what an already-paid
// booking promised — that argument is settled by the row, not by this file.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Ratified 2026 (Decision #12): a 25% deposit books the date. */
export const DEPOSIT_PCT = 0.25;

export const TERMS_VERSION = '2026-08-v1';

export const TERMS = {
  version: TERMS_VERSION,
  deposit_pct: DEPOSIT_PCT,
  // When the deposit is due: immediately — the date is not held until it clears. [1]
  deposit_due: 'at booking',
  // Our deviation from [1]: a short, unconditional change-of-mind window.
  deposit_refundable_hours: 72,
  // Headcount deadline, calendar days before the event. [2] 10–15 days; [3] 5 business days.
  final_count_days_before: 10,
  // Balance: due by the day of the event. [1]
  balance_due: 'day of event',
  balance_due_days_before: 0,
  // Cancellation ladder, in calendar days before the event. Shape from [2]/[3]/[4]:
  // notice costs something, no notice costs everything.
  cancellation_tiers: [
    { min_days_before: 15, refund_pct_of_total: 1.00, deposit_refunded: false,
      label: '15 or more days before the event' },
    { min_days_before: 8, refund_pct_of_total: 1.00, deposit_refunded: false,
      label: '8–14 days before the event' },
    { min_days_before: 3, refund_pct_of_total: 0.50, deposit_refunded: false,
      label: '3–7 days before the event' },
    { min_days_before: 0, refund_pct_of_total: 0.00, deposit_refunded: false,
      label: 'less than 3 days before the event' },
  ],
};

const money = (cents) => `$${(Math.round(Number(cents) || 0) / 100).toFixed(2)}`;

// YYYY-MM-DD minus n calendar days, as YYYY-MM-DD. Returns null on an unparseable date rather
// than a wrong one — a made-up deadline on a contract is worse than a blank.
export function dateMinusDays(dateStr, days) {
  const ms = Date.parse(String(dateStr || '') + 'T12:00:00Z');
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - days * 86400000).toISOString().slice(0, 10);
}

/**
 * The terms for ONE quote: the constants above, resolved against this event's date and money.
 * Returns { version, deposit_cents, balance_cents, final_count_due, balance_due_date, lines[] }.
 * `lines` is the customer-facing copy, in order, ready to render as plain text or <li>s.
 */
export function termsFor({ totalCents, depositCents, balanceCents, eventDate } = {}) {
  const finalCountDue = dateMinusDays(eventDate, TERMS.final_count_days_before);
  const t = {
    ...TERMS,
    total_cents: Math.round(Number(totalCents) || 0),
    deposit_cents: Math.round(Number(depositCents) || 0),
    balance_cents: Math.round(Number(balanceCents) || 0),
    event_date: eventDate || null,
    final_count_due: finalCountDue,
    balance_due_date: eventDate || null,
  };

  const onDate = (d, fallback) => (d ? `by ${d}` : fallback);

  t.lines = [
    `Deposit: ${money(t.deposit_cents)} — ${Math.round(DEPOSIT_PCT * 100)}% of your ${money(t.total_cents)} quote. Paying it books your date; until it is paid the date is not held.`,
    `Changed your mind? The deposit is fully refundable for ${TERMS.deposit_refundable_hours} hours after you pay it. After that it is non-refundable, because that is when we start committing your date to suppliers and staff.`,
    `Final guest count: due ${onDate(t.final_count_due, `${TERMS.final_count_days_before} days before the event`)}. We buy and prep against that number, so it is the last point at which it can go down. It can still go UP after that if the kitchen has room — ask us.`,
    `Balance: ${money(t.balance_cents)}, due ${onDate(t.balance_due_date, 'on the day of the event')}. If the final count goes up, the balance goes up with it at the same per-guest price.`,
    'If you cancel: 15+ days out, the balance is fully refunded and the deposit is kept. 8–14 days out, the same. 3–7 days out, half the balance is refunded. Under 3 days, the food is already bought and prepped, so nothing is refunded.',
    'If WE cannot deliver — kitchen failure, our vehicle, our staffing — you get every dollar back, deposit included. That is on us, not on you.',
    'Questions, changes, or something not right: reply to this message or call us. A human reads every one.',
  ];
  return t;
}

/** One paragraph of the same terms — for a Square note field or an SMS, where lines[] is too long. */
export function termsSummary(t) {
  const pct = Math.round(DEPOSIT_PCT * 100);
  return `${pct}% deposit books the date · fully refundable for ${TERMS.deposit_refundable_hours}h, non-refundable after` +
    ` · final guest count due ${t && t.final_count_due ? t.final_count_due : `${TERMS.final_count_days_before} days before`}` +
    ` · balance due on the day of the event · cancellation: 8+ days = balance refunded, 3–7 days = half, under 3 days = none.`;
}

/**
 * What a cancellation costs, given the terms snapshot the customer actually agreed to.
 * Pure — no I/O — so the number the owner quotes on the phone and the number the system computes
 * can never disagree.
 */
export function cancellationOutcome(terms, { daysBeforeEvent } = {}) {
  const tiers = (terms && terms.cancellation_tiers) || TERMS.cancellation_tiers;
  const d = Number(daysBeforeEvent);
  const days = Number.isFinite(d) ? d : 0;
  const tier = tiers.find((x) => days >= x.min_days_before) || tiers[tiers.length - 1];
  const balance = Math.round(Number(terms && terms.balance_cents) || 0);
  const deposit = Math.round(Number(terms && terms.deposit_cents) || 0);
  return {
    tier: tier.label,
    balance_refund_cents: Math.round(balance * tier.refund_pct_of_total),
    deposit_refund_cents: tier.deposit_refunded ? deposit : 0,
  };
}
