// POST /api/checkout — à-la-carte ordering via Square hosted checkout (Payment Links).
// The client sends { items: [{id, qty}], fulfillment } using catalog IDs only; prices are
// resolved SERVER-SIDE from CATALOG below so they can't be tampered with from the browser.
import { json, bad, id, appBaseUrl } from '../_lib/util.js';
import { square, squareConfigured, money } from '../_lib/square.js';
import { limitOr429 } from '../_lib/ratelimit.js';

// Authoritative à-la-carte catalog (base prices in USD). Bowl size/protein variations and
// real bites retail pricing are a follow-up; these are the launch defaults.
const CATALOG = {
  // Bowls (16 oz, base price)
  vida:     { name: 'VIDA Bowl',     price: 19.99 },
  fuego:    { name: 'FUEGO Bowl',    price: 22.99 },
  ligero:   { name: 'LIGERO Bowl',   price: 18.99 },
  mar:      { name: 'MAR Bowl',      price: 22.99 },
  coco:     { name: 'COCO Bowl',     price: 22.99 },
  congreen: { name: 'CONGREEN Bowl', price: 20.99 },
  raiz:     { name: 'RAÍZ Bowl',     price: 18.99 },
  // Añejo Fit drinks (12 oz)
  fit_gold:     { name: 'Añejo Fit — Gold Vitality',  price: 9.99 },
  fit_hibiscus: { name: 'Añejo Fit — Hibiscus Zen',   price: 9.99 },
  fit_emerald:  { name: 'Añejo Fit — Emerald Hydrate', price: 9.99 },
  // Add-on
  sauce_extra:  { name: 'Extra Signature Sauce (2 oz)', price: 1.50 },
};

export const onRequestPost = async ({ request, env }) => {
  // Abuse guard: cap checkout creations per IP (each creates a Square order/payment link).
  const limited = await limitOr429(env, request, { name: 'checkout', limit: 15, windowSec: 60 });
  if (limited) return limited;

  if (!squareConfigured(env)) return bad('Checkout is not configured yet.', 503);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length) return bad('Your cart is empty.');

  const lineItems = [];
  for (const it of items) {
    const prod = CATALOG[it && it.id];
    if (!prod) return bad(`Unknown item: ${it && it.id}`);
    const qty = Math.floor(Number(it.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) return bad(`Invalid quantity for ${prod.name}.`);
    lineItems.push({
      name: prod.name,
      quantity: String(qty),
      base_price_money: money(prod.price),
    });
  }

  // Delivery-only fulfillment with scheduled windows: Mon–Sat, Lunch or Dinner.
  const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const WINDOWS = { lunch: 'Lunch (11:00 AM–1:00 PM)', dinner: 'Dinner (5:00 PM–7:00 PM)' };
  const d = b.delivery || {};
  const day = DAYS.includes(d.day) ? d.day : null;
  const win = WINDOWS[d.window] ? d.window : null;
  if (!day || !win) return bad('Please choose a delivery day (Mon–Sat) and time window.');
  const deliveryNote = `Delivery: ${day} · ${WINDOWS[win]}`;

  // FL state 6% + Palm Beach County 1% surtax = 7% by default. Override via the
  // SALES_TAX_PCT var once the exact registered rate is confirmed after FL DOR registration.
  const taxPct = String(env.SALES_TAX_PCT || '7.0');

  const base = appBaseUrl(env, request);

  const { ok, status, data } = await square(env, '/v2/online-checkout/payment-links', {
    method: 'POST',
    body: {
      idempotency_key: id('co'),
      order: {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: lineItems,
        taxes: [{
          uid: 'sales-tax',
          name: `Sales Tax (FL · Palm Beach County · ${taxPct}%)`,
          percentage: taxPct,
          scope: 'ORDER',   // applies to every line item on the order
        }],
        reference_id: 'web-delivery',
        note: deliveryNote,   // shows on the Square order for the kitchen
      },
      checkout_options: {
        redirect_url: `${base}/order/confirmed`,
        ask_for_shipping_address: true,   // delivery always needs an address
      },
    },
  });

  if (!ok) {
    const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
    return bad(detail || `Square checkout failed (${status}).`, 502);
  }

  const url = data && data.payment_link && (data.payment_link.long_url || data.payment_link.url);
  if (!url) return bad('Square did not return a checkout URL.', 502);
  return json({ url });
};
