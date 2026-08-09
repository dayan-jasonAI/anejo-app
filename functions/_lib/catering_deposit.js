// catering_deposit.js — turn a quote into a payable 25% deposit. Files under _lib are NOT routed.
//
// THE DEAD END THIS CLOSES. _lib/quote.js has computed a deposit since it was written
// (depositFor, line 125) and there has never been a way to PAY one. The owner built a quote, read
// a deposit figure off the screen, and then had to chase the money by hand through some other
// channel. A deposit you cannot collect is not a booking system.
//
// TWO RULES THIS MODULE ENFORCES:
//
//   1. THE MATH IS DERIVED, NEVER TYPED. deposit = round(total × 0.25), balance = total − deposit.
//      The balance is subtraction, not a second percentage, so deposit + balance is exactly the
//      total at every rounding boundary. A quote where the two halves do not add up to the whole
//      is a customer-facing argument waiting to happen.
//
//   2. THE TERMS GO IN THE ROW, AT CREATION TIME. Not looked up when someone later asks what was
//      agreed. See _lib/catering_terms.js for why.
//
// Square is called through the same thin client as every other payment link (_lib/square.js), so
// SQUARE_ENV governs sandbox-vs-live here exactly as it does at checkout.
import { square, squareConfigured } from './square.js';
import { id, now } from './hub.js';
import { DEPOSIT_PCT, TERMS_VERSION, termsFor, termsSummary } from './catering_terms.js';

/**
 * Split a quoted total into deposit + balance at the ratified rate.
 * Pure. Cents in, cents out — no floats past the boundary.
 */
export function depositSplit(totalCents, pct = DEPOSIT_PCT) {
  const total = Math.round(Number(totalCents));
  if (!Number.isFinite(total) || total <= 0) {
    return { ok: false, error: 'A deposit needs a quoted total greater than zero.' };
  }
  const p = Number(pct);
  if (!Number.isFinite(p) || p <= 0 || p >= 1) {
    return { ok: false, error: 'Deposit percentage must be a fraction between 0 and 1 (0.25 = 25%).' };
  }
  const deposit = Math.round(total * p);
  // Subtraction, not total × (1 − p): see rule 1 above.
  return { ok: true, total_cents: total, deposit_pct: p, deposit_cents: deposit, balance_cents: total - deposit };
}

const clean = (s, max) => {
  const v = String(s == null ? '' : s).trim();
  return v ? v.slice(0, max) : null;
};

/**
 * Create the deposit checkout for a quote and persist the quote + its terms.
 *
 * Returns { ok, quote_id, url, deposit_cents, balance_cents, terms } or { ok:false, error }.
 * NEVER writes a quote row it could not attach a payment link to: a stored "deposit" with no way
 * to pay it is the exact dead end this module exists to remove.
 */
export async function createDepositCheckout(env, {
  totalCents, guests, eventDate, customerName, customerEmail, customerPhone,
  quoteBreakdown, note, createdBy, baseUrl, depositPct = DEPOSIT_PCT,
} = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Database not configured.' };
  if (!squareConfigured(env)) return { ok: false, error: 'Square is not configured — no deposit link can be created.' };

  const split = depositSplit(totalCents, depositPct);
  if (!split.ok) return split;

  const g = Math.round(Number(guests));
  if (!Number.isFinite(g) || g <= 0) return { ok: false, error: 'A quote needs a guest count greater than zero.' };

  const terms = termsFor({
    totalCents: split.total_cents,
    depositCents: split.deposit_cents,
    balanceCents: split.balance_cents,
    eventDate,
  });

  const quoteId = id('cq');
  const base = (baseUrl || '').replace(/\/$/, '');
  const pctLabel = `${Math.round(split.deposit_pct * 100)}%`;
  const totalLabel = `$${(split.total_cents / 100).toFixed(2)}`;

  // The customer sees the terms BEFORE they pay: the line-item name says what the payment is and
  // what it is a percentage of, and Square renders `note` on the hosted checkout page. That is
  // the "surfaced at deposit time" requirement — the same text is returned to the caller so the
  // quote email carries it in full, and stored on the row so it can be proven later.
  const { ok, status, data } = await square(env, '/v2/online-checkout/payment-links', {
    method: 'POST',
    body: {
      idempotency_key: quoteId,
      order: {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: [{
          name: `Catering deposit (${pctLabel} of ${totalLabel}) — ${g} guests${eventDate ? ` · ${eventDate}` : ''}`,
          quantity: '1',
          base_price_money: { amount: split.deposit_cents, currency: 'USD' },
        }],
        reference_id: 'catering-deposit',
        note: termsSummary(terms).slice(0, 500),
      },
      checkout_options: {
        redirect_url: base ? `${base}/order/confirmed` : undefined,
        ask_for_shipping_address: false,
        allow_tipping: false,
      },
    },
  });

  if (!ok) {
    const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
    return { ok: false, error: detail || `Square could not create the deposit link (${status}).` };
  }
  const pl = (data && data.payment_link) || null;
  const url = pl && (pl.long_url || pl.url);
  if (!url) return { ok: false, error: 'Square did not return a deposit checkout URL.' };

  const t = now();
  try {
    await env.DB.prepare(
      `INSERT INTO catering_quotes
         (id, customer_name, customer_email, customer_phone, event_date, guests,
          total_cents, deposit_pct, deposit_cents, balance_cents,
          deposit_status, square_order_id, payment_link_id, payment_link_url,
          balance_status, balance_due_date, final_count_due,
          terms_version, terms_json, quote_json, note, created_by, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?, 'unpaid', ?,?,?, 'due', ?,?, ?,?,?,?,?,?,?)`
    ).bind(
      quoteId, clean(customerName, 80), (clean(customerEmail, 160) || '').toLowerCase() || null,
      clean(customerPhone, 32), clean(eventDate, 10), g,
      split.total_cents, split.deposit_pct, split.deposit_cents, split.balance_cents,
      pl.order_id || null, pl.id || null, url,
      terms.balance_due_date, terms.final_count_due,
      TERMS_VERSION, JSON.stringify(terms), quoteBreakdown ? JSON.stringify(quoteBreakdown) : null,
      clean(note, 500), clean(createdBy, 160), t, t,
    ).run();
  } catch (e) {
    // The link exists in Square but we could not record it. Say so plainly rather than handing
    // back a URL whose payment nothing will ever reconcile.
    return { ok: false, error: 'The deposit link was created but could not be saved. Do not send it — try again. ' + String((e && e.message) || '').slice(0, 120) };
  }

  return {
    ok: true,
    quote_id: quoteId,
    url,
    total_cents: split.total_cents,
    deposit_cents: split.deposit_cents,
    balance_cents: split.balance_cents,
    deposit_pct: split.deposit_pct,
    terms,
  };
}

/**
 * A deposit payment landed in Square → mark the quote paid and leave the balance owing.
 * Idempotent: the `deposit_status='unpaid'` guard means Square's webhook retries are no-ops.
 * Returns the quote id when THIS call is the one that flipped it, else null.
 */
export async function markDepositPaid(env, squareOrderId, capturedCents) {
  if (!env || !env.DB || !squareOrderId) return null;
  try {
    const q = await env.DB
      .prepare("SELECT id, deposit_cents FROM catering_quotes WHERE square_order_id = ? AND deposit_status = 'unpaid' LIMIT 1")
      .bind(squareOrderId).first();
    if (!q) return null;
    const paid = Number.isFinite(Number(capturedCents)) && Number(capturedCents) > 0
      ? Math.round(Number(capturedCents)) : q.deposit_cents;
    const r = await env.DB.prepare(
      "UPDATE catering_quotes SET deposit_status='paid', deposit_paid_at=?, deposit_paid_cents=?, updated_at=? WHERE id=? AND deposit_status='unpaid'"
    ).bind(now(), paid, now(), q.id).run();
    return (r && r.meta && r.meta.changes === 1) ? q.id : null;
  } catch { return null; }
}
