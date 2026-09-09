// POST /api/catering-deposit — the customer books their own date with a 25% deposit.
//
// Until now a deposit link could only be minted from inside the Hub: a customer who wanted to hold
// a date had to send a request, wait for Dayan to price it by hand, and wait again for a link.
// This is the same money path (`_lib/catering_deposit.js` — same quote row, same ratified 25%,
// same terms version), reached from the public quote builder instead.
//
// THE PRICE IS RECOMPUTED HERE. The request body carries product ids and quantities only; the
// browser's own total is never read, never trusted and never stored. Everything a customer could
// edit in devtools is re-derived from the live menu and the shared discount before a cent is
// asked for.
import { json, bad, isEmail } from '../_lib/util.js';
import { loadMenu } from '../_lib/menu.js';
import { normalizeCateringProducts } from '../_lib/catering-products.js';
import { estimateCateringProducts } from '../_lib/catering-estimate.js';
import { createDepositCheckout } from '../_lib/catering_deposit.js';
import { limitOr429 } from '../_lib/ratelimit.js';

const MENUS = ['Añejo Fit Menu', 'Cuban Food', 'Individual Cajitas'];
const clean = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

export async function onRequestPost({ request, env }) {
  // Tighter than the estimate's 90/min: this one mints a payment link and writes a quote row.
  const limited = await limitOr429(env, request, { name: 'catering-deposit', limit: 8, windowSec: 60 });
  if (limited) return limited;

  let body;
  try {
    const raw = await request.text();
    if (raw.length > 40000) return bad('Selection too large.', 413);
    body = JSON.parse(raw);
  } catch { return bad('Invalid request.'); }

  const name = clean(body?.name, 120);
  const email = clean(body?.email, 160);
  const phone = clean(body?.phone, 40);
  const eventDate = clean(body?.event_date, 10);
  const guests = Math.floor(Number(body?.guests));

  // Everything below is what the deposit RECORD needs to be worth anything later: who owes the
  // balance, and for which date. A deposit taken against a blank name is money we cannot reconcile.
  if (!name) return bad('Please enter your name.');
  if (!isEmail(email)) return bad('Please enter a valid email address.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return bad('Please choose your event date.');
  if (!Number.isFinite(guests) || guests < 1 || guests > 5000) return bad('Please enter how many people you are expecting.');

  // 48 hours' notice is the standing rule for standard catering; a deposit for tomorrow lunchtime
  // is a booking the kitchen cannot honour, and taking the card first makes it a refund instead of
  // a conversation.
  const eventMs = Date.parse(`${eventDate}T00:00:00-04:00`);
  if (!Number.isFinite(eventMs) || eventMs < Date.now() + 48 * 3600 * 1000) {
    return bad('Standard catering needs at least 48 hours. Please call us for anything sooner.');
  }

  const selection = normalizeCateringProducts(body?.products, MENUS);
  if (!selection.ok || !selection.items.length) return bad(selection.error || 'Choose products first.');

  const menu = await loadMenu(env);
  const estimate = estimateCateringProducts(selection.items, menu);
  // Fit bowls keep their modifiers in the bowl editor; they are not sold down this path.
  if (selection.items.some((item) => item.id.startsWith('fit-'))) {
    return bad('Fit bowls are ordered through the menu bowl editor.');
  }
  if (!estimate.checkout_eligible || estimate.total_cents <= 0) {
    return bad('These selections need a quote from us first. Send the request below and we will price it.');
  }

  const url = new URL(request.url);
  const result = await createDepositCheckout(env, {
    totalCents: estimate.total_cents,
    guests,
    eventDate,
    customerName: name,
    customerEmail: email,
    customerPhone: phone || null,
    // The breakdown is what makes the quote defensible six weeks later: which SKUs, at which
    // prices, with the discount that was applied, as they stood the moment the card was charged.
    quoteBreakdown: {
      source: 'public_quote_builder',
      items: estimate.items,
      subtotal_cents: estimate.subtotal_cents,
      discount_cents: estimate.discount_cents,
      discount_tiers: estimate.tiers,
      total_cents: estimate.total_cents,
      unpriced: estimate.unpriced,
      menu_source: menu?.source || null,
    },
    note: estimate.unpriced?.length
      ? 'Booked online from the website quote builder. Some lines still need a hand quote and are NOT included in this total.'
      : 'Booked online from the website quote builder.',
    createdBy: 'website',
    baseUrl: `${url.protocol}//${url.host}`,
  });

  if (!result.ok) return bad(result.error || 'Could not start the deposit checkout.', 502);

  const response = json({
    ok: true,
    url: result.url,
    quote_id: result.quote_id,
    total_cents: estimate.total_cents,
    deposit_cents: result.deposit_cents,
    balance_cents: result.balance_cents,
    // Named so the page can say what is still to be quoted rather than implying the deposit
    // covers the whole event.
    unpriced: estimate.unpriced,
  });
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
