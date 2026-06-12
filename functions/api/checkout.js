// POST /api/checkout — à-la-carte ordering via Square hosted checkout (Payment Links).
// The client sends { items: [{id, qty}], fulfillment } using catalog IDs only; prices are
// resolved SERVER-SIDE from CATALOG below so they can't be tampered with from the browser.
import { json, bad, id, appBaseUrl, normalizePhone } from '../_lib/util.js';
import { square, squareConfigured, money } from '../_lib/square.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { geocode, formatAddress } from '../_lib/geo.js';

// Validate + normalize a delivery address from the order form. Returns { addr } or { error }.
// Street, city, and a 5-digit ZIP are required (we deliver within Palm Beach County).
function parseAddress(raw) {
  const a = raw || {};
  const street = (a.street || '').trim();
  const city = (a.city || '').trim();
  const zip = (a.zip || '').trim();
  if (!street) return { error: 'Please enter your delivery street address.' };
  if (!city) return { error: 'Please enter your delivery city.' };
  if (!/^\d{5}$/.test(zip)) return { error: 'Please enter a valid 5-digit ZIP code.' };
  return {
    addr: {
      street: street.slice(0, 160),
      unit: (a.unit || '').trim().slice(0, 60) || null,
      city: city.slice(0, 80),
      state: ((a.state || 'FL').trim() || 'FL').slice(0, 20),
      zip,
      notes: (a.notes || '').trim().slice(0, 240) || null,
    },
  };
}

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
  const orderItems = [];
  let subtotalCents = 0;
  for (const it of items) {
    const prod = CATALOG[it && it.id];
    if (!prod) return bad(`Unknown item: ${it && it.id}`);
    const qty = Math.floor(Number(it.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > 20) return bad(`Invalid quantity for ${prod.name}.`);
    const cents = Math.round(prod.price * 100);
    subtotalCents += cents * qty;
    lineItems.push({ name: prod.name, quantity: String(qty), base_price_money: money(prod.price) });
    orderItems.push({ id: it.id, name: prod.name, qty, price_cents: cents });
  }

  // Delivery-only with a real date + window. Date must be an upcoming Mon–Sat, ordered
  // before the cutoff (6:00 PM ET the day before — fresh prep). Sundays rejected.
  const WINDOWS = { lunch: 'Lunch (11:00 AM–1:00 PM)', dinner: 'Dinner (5:00 PM–7:00 PM)' };
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dlv = b.delivery || {};
  const win = WINDOWS[dlv.window] ? dlv.window : null;
  const dateStr = (typeof dlv.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dlv.date)) ? dlv.date : null;
  if (!dateStr || !win) return bad('Please choose a delivery date and time window.');
  const midnightUtc = Date.parse(dateStr + 'T00:00:00Z');
  if (Number.isNaN(midnightUtc)) return bad('Invalid delivery date.');
  const dow = new Date(midnightUtc).getUTCDay();
  if (dow === 0) return bad('We deliver Monday–Saturday. Please pick another date.');
  const cutoff = midnightUtc - 2 * 3600 * 1000;   // ≈ 6 PM ET the prior day (EDT = UTC-4)
  if (Date.now() >= cutoff) return bad('That date has passed its order cutoff (6 PM the day before). Pick a later date.');
  if (midnightUtc - Date.now() > 24 * 24 * 3600 * 1000) return bad('Please choose a delivery date within the next few weeks.');
  // Delivery address (we collect it ourselves now and store it for routing).
  const parsed = parseAddress(b.address);
  if (parsed.error) return bad(parsed.error);
  const addr = parsed.addr;
  const addrLine = formatAddress({ street: addr.street, unit: addr.unit, city: addr.city, state: addr.state, zip: addr.zip });

  // Customer contact — a first name is REQUIRED so every order is identifiable for the kitchen
  // and the delivery driver. Phone + SMS consent are optional; with consent we can text delivery
  // updates (otherwise we fall back to email). We never text a number without an explicit opt-in.
  const contact = b.contact || {};
  const firstName = (contact.first_name || contact.name || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  if (!firstName) return bad('Please enter your first name so we can label your order.');
  const custPhone = normalizePhone(contact.phone);
  const smsConsent = ((contact.sms_consent === true || contact.sms_consent === 1) && custPhone) ? 1 : 0;

  const deliveryNote = `Delivery for ${firstName}: ${DOW[dow]} ${dateStr} · ${WINDOWS[win]} · ${addrLine}`;

  // Order minimum + flat delivery fee (configurable via env).
  const orderMinCents = Math.round(Number(env.ORDER_MIN_USD || 25) * 100);
  if (subtotalCents < orderMinCents) return bad(`Order minimum is $${(orderMinCents / 100).toFixed(2)}. Please add a little more.`);
  const feeCents = Math.round(Number(env.DELIVERY_FEE_USD || 5) * 100);

  // FL state 6% + Palm Beach County 1% surtax = 7% by default; override via SALES_TAX_PCT.
  const taxPct = String(env.SALES_TAX_PCT || '7.0');

  const base = appBaseUrl(env, request);

  const { ok, status, data } = await square(env, '/v2/online-checkout/payment-links', {
    method: 'POST',
    body: {
      idempotency_key: id('co'),
      order: {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: lineItems,
        service_charges: feeCents > 0 ? [{
          uid: 'delivery-fee', name: 'Delivery fee',
          amount_money: { amount: feeCents, currency: 'USD' },
          calculation_phase: 'SUBTOTAL_PHASE', taxable: false,
        }] : undefined,
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
        // We collect the delivery address ourselves (stored for routing), so don't ask twice.
        ask_for_shipping_address: false,
      },
    },
  });

  if (!ok) {
    const detail = data && data.errors && data.errors[0] && data.errors[0].detail;
    return bad(detail || `Square checkout failed (${status}).`, 502);
  }

  const pl = data && data.payment_link;
  const url = pl && (pl.long_url || pl.url);
  if (!url) return bad('Square did not return a checkout URL.', 502);

  // Persist a pending order for the kitchen view; the webhook marks it paid.
  if (env.DB) {
    try {
      const t = Date.now();
      // Best-effort geocode for routing (no-ops without GOOGLE_MAPS_API_KEY → lat/lng stay null,
      // the owner route builder falls back to manual ordering).
      let lat = null, lng = null, geocodedAt = null;
      const g = await geocode(env, addrLine).catch(() => null);
      if (g) { lat = g.lat; lng = g.lng; geocodedAt = t; }
      await env.DB.prepare(
        `INSERT INTO orders (id, square_order_id, payment_link_id, items, delivery_date, delivery_window,
            subtotal_cents, fee_cents, tax_pct, total_estimate_cents,
            customer_name, customer_phone, sms_consent,
            delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes,
            delivery_lat, delivery_lng, geocoded_at, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`
      ).bind(
        id('ord'), pl.order_id || null, pl.id || null, JSON.stringify(orderItems), dateStr, win,
        subtotalCents, feeCents, Number(taxPct),
        Math.round((subtotalCents + feeCents) * (1 + Number(taxPct) / 100)),
        firstName, custPhone, smsConsent,
        addr.street, addr.unit, addr.city, addr.state, addr.zip, addr.notes,
        lat, lng, geocodedAt, t, t
      ).run();
    } catch (_) { /* never fail checkout on the order-log write */ }
  }

  return json({ url });
};
