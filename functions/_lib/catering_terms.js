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

/** Dayan, 2026-09-09: half up front books the date. Was 25% under 2026-08-v1.
 *  Raising this changes what NEW quotes promise only — every existing quote carries its own
 *  deposit_pct and terms_json, so a client already sold at 25% is still owed 25%. */
export const DEPOSIT_PCT = 0.50;

export const TERMS_VERSION = '2026-09-v2';

export const TERMS = {
  version: TERMS_VERSION,
  deposit_pct: DEPOSIT_PCT,
  // When the deposit is due: immediately — the date is not held until it clears. [1]
  deposit_due: 'at booking',
  // Our deviation from [1]: a short, unconditional change-of-mind window.
  deposit_refundable_hours: 72,
  // Headcount deadline, calendar days before the event. [2] 10–15 days; [3] 5 business days.
  final_count_days_before: 10,
  // Balance: due the day BEFORE the event (Dayan, 2026-09-09). [1] says day-of; collecting on
  // the day means chasing money while the van is loading, and a card that declines at 8am on the
  // event morning has no room left to be fixed.
  balance_due: 'day before event',
  balance_due_days_before: 1,
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
export function termsFor({ totalCents, depositCents, balanceCents, eventDate, today } = {}) {
  // A SHORT-NOTICE BOOKING MUST NOT PRINT A DEADLINE THAT HAS ALREADY PASSED.
  // The policy is "10 days before the event", but a client who books six days out would have
  // been handed "final count due 2026-09-05" on 2026-09-09 — four days in the past, on a
  // contract (Dayan caught this in the Hub, 2026-09-09). Both deadlines are therefore clamped
  // forward to today: when the window has already closed, the honest answer is "now", not a
  // date nobody can act on. `today` is injectable so the clamp is testable and pure.
  const asOf = String(today || new Date().toISOString().slice(0, 10));
  const notBeforeToday = (d) => (d && d < asOf ? asOf : d);
  const rawFinalCount = dateMinusDays(eventDate, TERMS.final_count_days_before);
  const rawBalanceDue = dateMinusDays(eventDate, TERMS.balance_due_days_before);
  const finalCountDue = notBeforeToday(rawFinalCount);
  const balanceDueDate = notBeforeToday(rawBalanceDue);
  const t = {
    ...TERMS,
    total_cents: Math.round(Number(totalCents) || 0),
    deposit_cents: Math.round(Number(depositCents) || 0),
    balance_cents: Math.round(Number(balanceCents) || 0),
    event_date: eventDate || null,
    final_count_due: finalCountDue,
    balance_due_date: balanceDueDate,
    // Flagged so the quote can say "because you booked inside our normal window" rather than
    // silently showing a deadline that does not match the published policy.
    short_notice: Boolean((rawFinalCount && rawFinalCount < asOf) || (rawBalanceDue && rawBalanceDue < asOf)),
  };

  t.lines = renderLines(t, 'en');
  // Both languages travel WITH the snapshot. A quote emailed in Spanish must be arguable in
  // Spanish later — storing only the English and translating at send time means the terms the
  // customer read are not the terms anyone can produce afterwards.
  t.lines_es = renderLines(t, 'es');
  return t;
}

/** The customer-facing terms copy, in one language. Pure formatting over a resolved terms row. */
export function renderLines(t, lang = 'en') {
  const onDate = (d, fallback) => (d ? (lang === 'es' ? `el ${d}` : `by ${d}`) : fallback);
  const pct = Math.round(DEPOSIT_PCT * 100);
  if (lang === 'es') return [
    `Depósito: ${money(t.deposit_cents)} — el ${pct}% de su cotización de ${money(t.total_cents)}. Pagarlo reserva su fecha; hasta que se pague, la fecha no queda apartada.`,
    `¿Cambió de opinión? El depósito es totalmente reembolsable durante ${TERMS.deposit_refundable_hours} horas después de pagarlo. Pasado ese plazo no es reembolsable, porque es cuando empezamos a comprometer su fecha con proveedores y personal.`,
    `Número final de invitados: ${onDate(t.final_count_due, `${TERMS.final_count_days_before} días antes del evento`)}. Compramos y preparamos según ese número, así que es el último momento en que puede bajar. Todavía puede SUBIR después si la cocina tiene espacio — pregúntenos.`,
    `Saldo: ${money(t.balance_cents)}, con vencimiento ${onDate(t.balance_due_date, 'el día antes del evento')}. Si el número final sube, el saldo sube con él al mismo precio por invitado.`,
    'Si cancela: 15 días o más antes, el saldo se reembolsa completo y el depósito se retiene. De 8 a 14 días antes, igual. De 3 a 7 días antes, se reembolsa la mitad del saldo. Con menos de 3 días, la comida ya está comprada y preparada, así que no hay reembolso.',
    'Si NOSOTROS no podemos cumplir — falla de cocina, de nuestro vehículo, de nuestro personal — le devolvemos cada dólar, depósito incluido. Eso corre por nuestra cuenta, no por la suya.',
    'Preguntas, cambios, o algo que no está bien: responda a este mensaje o llámenos. Una persona lee cada uno.',
  ];
  return [
    `Deposit: ${money(t.deposit_cents)} — ${Math.round(DEPOSIT_PCT * 100)}% of your ${money(t.total_cents)} quote. Paying it books your date; until it is paid the date is not held.`,
    `Changed your mind? The deposit is fully refundable for ${TERMS.deposit_refundable_hours} hours after you pay it. After that it is non-refundable, because that is when we start committing your date to suppliers and staff.`,
    `Final guest count: due ${onDate(t.final_count_due, `${TERMS.final_count_days_before} days before the event`)}. We buy and prep against that number, so it is the last point at which it can go down. It can still go UP after that if the kitchen has room — ask us.`,
    `Balance: ${money(t.balance_cents)}, due ${onDate(t.balance_due_date, 'the day before the event')}. If the final count goes up, the balance goes up with it at the same per-guest price.`,
    'If you cancel: 15+ days out, the balance is fully refunded and the deposit is kept. 8–14 days out, the same. 3–7 days out, half the balance is refunded. Under 3 days, the food is already bought and prepped, so nothing is refunded.',
    'If WE cannot deliver — kitchen failure, our vehicle, our staffing — you get every dollar back, deposit included. That is on us, not on you.',
    'Questions, changes, or something not right: reply to this message or call us. A human reads every one.',
  ];
}

/** One paragraph of the same terms — for a Square note field or an SMS, where lines[] is too long. */
export function termsSummary(t) {
  const pct = Math.round(DEPOSIT_PCT * 100);
  return `${pct}% deposit books the date · fully refundable for ${TERMS.deposit_refundable_hours}h, non-refundable after` +
    ` · final guest count due ${t && t.final_count_due ? t.final_count_due : `${TERMS.final_count_days_before} days before`}` +
    ` · balance due the day before the event · cancellation: 8+ days = balance refunded, 3–7 days = half, under 3 days = none.`;
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
