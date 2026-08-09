// /api/hub/owner/catering-deposit — the payable end of the catering quote engine.
//
//   GET                          → recent quotes with their deposit/balance state AND the terms
//                                  snapshot each one was sold under
//   POST { op:'preview', … }     → the split and the terms for a total, touching nothing
//   POST { op:'create', … }      → build a quote, mint the 25% deposit checkout, store the terms
//   POST { op:'mark_balance_paid', quote_id, ref? } → close out the balance after the event
//
// Owner-only. The quote engine (_lib/quote.js) refuses to invent cost inputs, and this endpoint
// inherits that refusal wholesale: send cost inputs + a guest count and it prices the event, or
// send a total_cents you have already agreed and it takes the deposit on that. What it will not
// do is guess.
import { json, bad, appBaseUrl } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now, parseJson } from '../../../_lib/hub.js';
import { buildQuote } from '../../../_lib/quote.js';
import { DEPOSIT_PCT, TERMS_VERSION, termsFor } from '../../../_lib/catering_terms.js';
import { createDepositCheckout, depositSplit } from '../../../_lib/catering_deposit.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let quotes = [];
  try {
    const r = await env.DB.prepare(
      `SELECT id, customer_name, customer_email, event_date, guests, total_cents, deposit_pct,
              deposit_cents, balance_cents, deposit_status, deposit_paid_at, deposit_paid_cents,
              balance_status, balance_paid_at, balance_due_date, final_count_due,
              payment_link_url, terms_version, terms_json, note, created_at
         FROM catering_quotes ORDER BY created_at DESC LIMIT 50`
    ).all();
    // THE TERMS COME OFF THE ROW, PARSED — never rebuilt from today's constants. A quote sold last
    // year under a different deposit rate or a different cancellation ladder must read back as
    // what that customer agreed to, which is why termsFor() is NOT called anywhere in this handler.
    // `terms_json` itself is dropped from the payload: the parsed object is the same information
    // and shipping both invites a caller to pick the wrong one.
    quotes = ((r && r.results) || []).map((q) => {
      const { terms_json, ...rest } = q;
      return { ...rest, terms: parseJson(terms_json, null) };
    });
  } catch { quotes = []; }

  // deposit_pct / terms_version here describe what a NEW quote would be sold under. Every existing
  // row carries its own, and the desk must render each row's own.
  return json({ ok: true, deposit_pct: DEPOSIT_PCT, terms_version: TERMS_VERSION, quotes });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = (b && b.op) || 'create';

  if (op === 'mark_balance_paid') {
    const qid = String((b && b.quote_id) || '').trim();
    if (!qid) return bad('Missing quote_id.');
    try {
      const r = await env.DB.prepare(
        "UPDATE catering_quotes SET balance_status='paid', balance_paid_at=?, updated_at=? WHERE id=? AND balance_status='due'"
      ).bind(now(), now(), qid).run();
      if (!r || !r.meta || r.meta.changes !== 1) return bad('That balance is not open, or the quote does not exist.', 400);
      return json({ ok: true, quote_id: qid, balance_status: 'paid' });
    } catch { return bad('Could not close the balance.', 500); }
  }

  // The desk shows the owner the deposit, the balance and the deadlines BEFORE he mints a link a
  // customer can pay. This op is the honest way to do that: the same depositSplit()/termsFor()
  // the create path uses, so the figure on screen and the figure Square is asked for are computed
  // by one function. It writes nothing, contacts nobody, and mints no link.
  if (op === 'preview') {
    const split = depositSplit(b.total_cents);
    if (!split.ok) return bad(split.error, 400);
    if (split.total_cents > 10000000) return bad('That total looks wrong (over $100,000) — enter cents, not dollars.');
    return json({
      ok: true,
      preview: true,
      ...split,
      terms: termsFor({
        totalCents: split.total_cents,
        depositCents: split.deposit_cents,
        balanceCents: split.balance_cents,
        eventDate: b.event_date,
      }),
    });
  }

  if (op !== 'create') return bad('Unknown action.');

  const guests = Number(b.guests);
  if (!Number.isFinite(guests) || guests <= 0) return bad('guests must be greater than 0.');

  // Two ways in. Either the caller supplies a total they have already agreed, or they supply the
  // cost inputs and the engine builds the total — in which case a missing input is a refusal, not
  // a default, and it says exactly which one is missing.
  let totalCents = null;
  let breakdown = null;
  if (b.total_cents != null && b.total_cents !== '') {
    const t = Math.round(Number(b.total_cents));
    if (!Number.isFinite(t) || t <= 0) return bad('total_cents must be greater than 0.');
    // $100,000 ceiling — the same "typed dollars where cents were meant" guard the contracts desk
    // uses. A quote is a number a human typed under time pressure.
    if (t > 10000000) return bad('That total looks wrong (over $100,000) — enter cents, not dollars.');
    totalCents = t;
  } else {
    const q = buildQuote(b.inputs || {}, guests);
    if (!q.ok) {
      return json({
        ok: false,
        error: q.error || 'Cannot quote yet.',
        missing: q.missing || [],
        invalid: q.invalid || [],
        note: q.note,
      }, 400);
    }
    totalCents = Math.round(q.total * 100);
    breakdown = q;
  }

  const r = await createDepositCheckout(env, {
    totalCents,
    guests,
    eventDate: b.event_date,
    customerName: b.customer_name,
    customerEmail: b.customer_email,
    customerPhone: b.customer_phone,
    quoteBreakdown: breakdown,
    note: b.note,
    createdBy: (ctx && (ctx.email || ctx.distinct_id)) || null,
    baseUrl: appBaseUrl(env, request),
  });
  if (!r.ok) return bad(r.error || 'Could not create the deposit link.', 400);
  return json(r);
};
