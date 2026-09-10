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
import { createBalanceCheckout } from '../../../_lib/catering_balance.js';
import { extractCajitaConfiguration } from '../../../_lib/cajita-config.js';
import { loadMenu } from '../../../_lib/menu.js';
import { estimateCateringProducts } from '../../../_lib/catering-estimate.js';
import { normalizeQuoteLines } from '../../../_lib/catering_quote_lines.js';
import { cateringQuoteEmail } from '../../../_lib/catering_quote_email.js';
import { sendQuote, quoteUrl } from '../../../_lib/catering_quote_delivery.js';
import { renderLines } from '../../../_lib/catering_terms.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let quotes = [];
  let requests = [];
  try {
    const r = await env.DB.prepare(
      `SELECT id, customer_name, customer_email, event_date, guests, total_cents, deposit_pct,
              deposit_cents, balance_cents, deposit_status, deposit_paid_at, deposit_paid_cents,
              balance_status, balance_paid_at, balance_due_date, final_count_due,
              payment_link_url, (SELECT payment_link_url FROM catering_balance_checkouts WHERE quote_id=catering_quotes.id) AS balance_payment_link_url, terms_version, terms_json, note, created_at
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

  // Website quote requests stay in the shared leads table until Dayan agrees a price. They are
  // deliberately separate from catering_quotes: a customer's request is not yet an offer, and it
  // must never create a payable deposit link or imply an approved total on its own.
  try {
    const r = await env.DB.prepare(
      `SELECT id, name, email, phone, company, interest, message, source_lang, created_at
         FROM leads WHERE kind='catering' ORDER BY created_at DESC LIMIT 50`
    ).all();
    requests = ((r && r.results) || []).map((row) => {
      const parsed = extractCajitaConfiguration(row.message);
      return parsed ? { ...row, cajita_configuration: parsed.config, cajita_summary: parsed.summary } : row;
    });
  } catch { requests = []; }

  // A SUGGESTED TOTAL, so "Start a quote" is not an empty box.
  //
  // Dayan's complaint, 2026-09-09: "I get no help in pricing out the order." The request card
  // showed the products the customer chose and then handed him a blank "Agreed total" to fill in
  // by hand — while the menu has had a published price for most of those lines all along. His own
  // $1,200 birthday order was priced that way.
  //
  // The structured selection lives in catering_requests.event_json (the human-readable lines on
  // the lead are a rendering of it). Pricing it here, with the SAME estimator and the SAME volume
  // discount the website quotes against, means the number he is offered is the number the customer
  // was already shown. It is a SUGGESTION and nothing more: the field stays editable, and lines
  // with no published price are listed rather than guessed at.
  if (requests.length) {
    try {
      const rows = await env.DB.prepare(
        `SELECT lead_id, event_json FROM catering_requests WHERE lead_id IN (${requests.map(() => '?').join(',')})`
      ).bind(...requests.map((row) => row.id)).all();
      const byLead = new Map(((rows && rows.results) || []).map((row) => [row.lead_id, parseJson(row.event_json, null)]));
      if (byLead.size) {
        const menu = await loadMenu(env);
        requests = requests.map((requestRow) => {
          const payload = byLead.get(requestRow.id);
          const products = Array.isArray(payload?.products) ? payload.products : null;
          if (!products || !products.length) return requestRow;
          const estimate = estimateCateringProducts(products, menu);
          // ONE SUGGESTED LINE PER THING SHE CHOSE, so the quote desk opens with her order laid
          // out and he edits prices instead of retyping the order. Each line is priced on its own
          // — no volume discount — because his lines ARE the price once he touches them, and a
          // discount folded invisibly into a line he then overrides is a number nobody can explain.
          // A line the menu cannot price comes through with cents: null and he fills it in; that
          // is the yuca case that made his own order unquotable.
          const suggestedLines = products.map((product) => {
            const one = estimateCateringProducts([product], menu);
            const priced = one.checkout_eligible && one.subtotal_cents > 0;
            return {
              name: product.name_en || product.id,
              name_es: product.name_es || undefined,
              detail: product.notes || undefined,
              qty: product.quantity != null ? String(product.quantity) : undefined,
              cents: priced ? one.subtotal_cents : null,
            };
          });
          return {
            ...requestRow,
            suggested: {
              lines: suggestedLines,
              subtotal_cents: estimate.subtotal_cents,
              discount_cents: estimate.discount_cents,
              total_cents: estimate.total_cents,
              tiers: estimate.tiers,
              // What he still has to price himself, by name, so the gap between the suggestion
              // and the real quote is visible instead of silent.
              unpriced: estimate.unpriced,
              priced_lines: estimate.items.length,
              live_menu: menu?.source === 'd1',
            },
          };
        });
      }
    } catch { /* the migration may not be applied; the request still loads without a suggestion */ }
  }

  // Attachments are private R2 objects. Return metadata only; the authenticated download route
  // performs a fresh owner check and streams the bytes on demand.
  if (requests.length) {
    try {
      const a = await env.DB.prepare(
        `SELECT id, lead_id, filename, content_type, byte_size, created_at
           FROM catering_attachments WHERE lead_id IN (${requests.map(() => '?').join(',')})
           ORDER BY created_at ASC`
      ).bind(...requests.map((row) => row.id)).all();
      const byLead = new Map();
      for (const row of ((a && a.results) || [])) {
        if (!byLead.has(row.lead_id)) byLead.set(row.lead_id, []);
        byLead.get(row.lead_id).push(row);
      }
      requests = requests.map((requestRow) => byLead.has(requestRow.id)
        ? ({ ...requestRow, attachments: byLead.get(requestRow.id) })
        : requestRow);
    } catch { /* attachment migration may not be applied yet; requests still load */ }
  }

  // deposit_pct / terms_version here describe what a NEW quote would be sold under. Every existing
  // row carries its own, and the desk must render each row's own.
  return json({ ok: true, deposit_pct: DEPOSIT_PCT, terms_version: TERMS_VERSION, requests, quotes });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const op = (b && b.op) || 'create';

  if (op === 'create_balance_link') {
    const qid=String(b.quote_id||'').trim();
    if(!qid)return bad('Missing quote_id.');
    try { const result=await createBalanceCheckout(env,qid,appBaseUrl(env,request)); return result.ok?json(result):bad(result.error,409); }
    catch { return bad('Could not save the balance checkout. Retry to recover the same link.',503); }
  }

  if (op === 'mark_balance_paid') {
    const qid = String((b && b.quote_id) || '').trim();
    if (!qid) return bad('Missing quote_id.');
    try {
      const r = await env.DB.prepare(
        "UPDATE catering_quotes SET balance_status='paid', balance_paid_at=?, updated_at=? WHERE id=? AND balance_status='due' AND NOT EXISTS (SELECT 1 FROM catering_balance_checkouts WHERE quote_id=catering_quotes.id)"
      ).bind(now(), now(), qid).run();
      if (!r || !r.meta || r.meta.changes !== 1) return bad('That balance is not open, or the quote does not exist.', 400);
      return json({ ok: true, quote_id: qid, balance_status: 'paid' });
    } catch { return bad('Could not close the balance.', 500); }
  }

  // The desk shows the owner the deposit, the balance and the deadlines BEFORE he mints a link a
  // customer can pay. This op is the honest way to do that: the same depositSplit()/termsFor()
  // the create path uses, so the figure on screen and the figure Square is asked for are computed
  // by one function. It writes nothing, contacts nobody, and mints no link.
  // READ IT BEFORE SHE DOES. Renders the exact email the customer would receive, from the values
  // sitting in the form, and creates NOTHING: no quote row, no Square link, no message. This is
  // the human preview that op 'send' below refuses to go without.
  //
  // Dayan, 2026-09-10: "no email should go out without a human preview, this is law."
  if (op === 'render') {
    const guests = Math.round(Number(b.guests));
    if (!Number.isFinite(guests) || guests <= 0) return bad('guests must be greater than 0.');

    let lines = [];
    let totalCents = null;
    if (b.lines != null) {
      const norm = normalizeQuoteLines(b.lines);
      if (!norm.ok) return bad(norm.error);
      lines = norm.lines;
      totalCents = norm.subtotal_cents;
    } else {
      const split0 = depositSplit(b.total_cents);
      if (!split0.ok) return bad(split0.error, 400);
      totalCents = split0.total_cents;
    }
    const split = depositSplit(totalCents);
    if (!split.ok) return bad(split.error, 400);

    const terms = termsFor({
      totalCents: split.total_cents,
      depositCents: split.deposit_cents,
      balanceCents: split.balance_cents,
      eventDate: b.event_date,
    });
    const lang = b.lang === 'es' ? 'es' : 'en';
    // The buttons point at a placeholder because nothing has been minted yet. That is the honest
    // thing to show: this is what she will READ, and the live links appear once it exists.
    const { subject, html } = cateringQuoteEmail({
      lang,
      customerName: b.customer_name || '',
      eventDate: b.event_date,
      guests,
      quoteId: 'preview',
      lines,
      subtotalCents: totalCents,
      discountCents: 0,
      totalCents: split.total_cents,
      depositCents: split.deposit_cents,
      depositPct: split.deposit_pct,
      balanceCents: split.balance_cents,
      balanceDueDate: terms.balance_due_date,
      depositUrl: '#preview',
      termsLines: renderLines(terms, lang),
    });
    return json({ ok: true, preview: true, subject, html, ...split, terms });
  }

  // The second, deliberate click. A quote that already exists — and that a human has therefore had
  // the chance to read — is sent to the customer here. Creating never sends; only this does.
  if (op === 'send') {
    const qid = String(b.quote_id || '').trim();
    if (!qid) return bad('quote_id is required.');
    let row = null;
    try {
      row = await env.DB.prepare(
        `SELECT id, customer_name, customer_email, customer_phone, event_date, guests, total_cents,
                deposit_pct, deposit_cents, balance_cents, deposit_status, balance_due_date,
                terms_json, quote_json, payment_link_url, access_token, lang, email_sent_at, sms_sent_at
           FROM catering_quotes WHERE id = ?`
      ).bind(qid).first();
    } catch { return bad('Could not read that quote.', 500); }
    if (!row) return bad('No such quote.', 404);
    if (!row.payment_link_url) return bad('That quote has no deposit link — create it again.');

    const r = await sendQuote(env, row, { baseUrl: appBaseUrl(env, request), force: b.force === true });
    return json({ ok: true, delivery: r, quote_url: quoteUrl(row.access_token, appBaseUrl(env, request)) });
  }

  if (op === 'preview') {
    // Preview from the typed LINES when there are any, so the split on screen is the split of the
    // same subtotal the create path will charge — not of a number typed into a second field.
    let previewTotal = b.total_cents;
    if (b.lines != null) {
      const norm = normalizeQuoteLines(b.lines);
      if (!norm.ok) return bad(norm.error);
      previewTotal = norm.subtotal_cents;
    }
    const split = depositSplit(previewTotal);
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

  // Three ways in, in priority order.
  //
  // 1. LINES the owner typed. His prices, printed to the customer exactly as entered, and the
  //    subtotal of those same lines is what the card is charged. This is the path that exists
  //    because the estimator's number is a suggestion and his is the decision.
  // 2. A total he has already agreed, with no itemisation.
  // 3. The cost inputs, from which the engine builds a total — a missing input is a refusal, not
  //    a default, and it says exactly which one is missing.
  let totalCents = null;
  let breakdown = null;
  if (b.lines != null) {
    const norm = normalizeQuoteLines(b.lines);
    if (!norm.ok) return bad(norm.error);
    // A caller that sends BOTH lines and a total that disagrees with them is refused rather than
    // reconciled. Picking either one silently is how a customer reads $485 in the itemisation and
    // gets charged the deposit on something else.
    if (b.total_cents != null && b.total_cents !== '') {
      const stated = Math.round(Number(b.total_cents));
      if (Number.isFinite(stated) && stated !== norm.subtotal_cents) {
        return bad(`The lines add up to $${(norm.subtotal_cents / 100).toFixed(2)} but the agreed total says $${(stated / 100).toFixed(2)}. Fix one of them — the customer must be charged what she reads.`);
      }
    }
    totalCents = norm.subtotal_cents;
    // `lines` is the key catering_quote_delivery reads to print the itemisation, and
    // `source: 'manual'` records that no estimator produced these numbers, a person did.
    breakdown = { source: 'manual', lines: norm.lines, subtotal_cents: norm.subtotal_cents, total_cents: norm.subtotal_cents };
  } else if (b.total_cents != null && b.total_cents !== '') {
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

  // LANGUAGE AND SMS CONSENT COME FROM THE LEAD, NOT FROM A CHECKBOX SOMEBODY HAS TO REMEMBER.
  // She told us both when she filled the form in: `source_lang` is the language she was reading
  // the site in, and `sms_consent` is what she actually agreed to. Asking the owner to re-enter
  // them is how a Spanish-speaking customer gets an English quote and no text.
  let lead = null;
  if (b.lead_id) {
    try {
      lead = await env.DB.prepare('SELECT source_lang, sms_consent, phone FROM leads WHERE id = ?')
        .bind(String(b.lead_id)).first();
    } catch { /* no lead is not an error — the owner can quote somebody who never used the form */ }
  }
  const lang = (b.lang || lead?.source_lang) === 'es' ? 'es' : 'en';
  // An explicit body flag can only ever be used to WITHHOLD the text, never to grant a consent
  // the customer did not give.
  const smsConsent = (lead?.sms_consent === 1 || lead?.sms_consent === true) && b.sms_consent !== false;

  const r = await createDepositCheckout(env, {
    totalCents,
    guests,
    eventDate: b.event_date,
    customerName: b.customer_name,
    customerEmail: b.customer_email,
    customerPhone: b.customer_phone || lead?.phone || null,
    quoteBreakdown: breakdown,
    note: b.note,
    createdBy: (ctx && (ctx.email || ctx.distinct_id)) || null,
    baseUrl: appBaseUrl(env, request),
    lang,
    smsConsent,
    // NO EMAIL GOES OUT WITHOUT A HUMAN PREVIEW. Dayan, 2026-09-10, after a quote emailed itself
    // to a client the moment he hit Create: "no email should go out without a human preview, this
    // is law." So sending is OPT-IN and the default is silence. Creating a quote mints the Square
    // link and stores the terms; it contacts nobody. The Hub renders the quote for him to read
    // and sends it on a second, deliberate click (op: 'send').
    send: b.send === true,
  });
  if (!r.ok) return bad(r.error || 'Could not create the deposit link.', 400);
  return json(r);
};
