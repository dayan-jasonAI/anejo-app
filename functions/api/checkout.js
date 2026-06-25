// POST /api/checkout — à-la-carte ordering via Square hosted checkout (Payment Links).
// The client sends { items: [{id, qty}], fulfillment } using catalog IDs only; prices are
// resolved SERVER-SIDE from CATALOG below so they can't be tampered with from the browser.
import { json, bad, id, appBaseUrl, normalizePhone } from '../_lib/util.js';
import { square, squareConfigured, money } from '../_lib/square.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { geocode, formatAddress } from '../_lib/geo.js';
import { BOWL_IDS, onDemandConfig, windowState, remainingByBowl } from '../_lib/ondemand.js';
import { BOWL_BY_NAME, BOWL_LABEL, scaledBowlMacros } from '../_lib/bowlspec.js';

// "11" → "11 AM", "19" → "7 PM" — for friendly window messaging.
function fmtHour(h) {
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${ampm}`;
}

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
// Non-bowl catalog (drinks + a standalone side sauce). Bowls are customized per-instance and
// priced via BOWL_BASE + priceCustomBowl below.
const CATALOG = {
  // Añejo Fit drinks (12 oz)
  fit_gold:     { name: 'Añejo Fit — Gold Vitality',  price: 9.99 },
  fit_hibiscus: { name: 'Añejo Fit — Hibiscus Zen',   price: 9.99 },
  fit_emerald:  { name: 'Añejo Fit — Emerald Hydrate', price: 9.99 },
  // Add-on
  sauce_extra:  { name: 'Extra Signature Sauce (2 oz)', price: 1.50 },
};

// Bowl base prices in cents (authoritative). Each bowl can be customized per-instance.
const BOWL_BASE = { vida: 1999, fuego: 2299, ligero: 1899, mar: 2299, coco: 2299, congreen: 2099, raiz: 1899 };
const HOUSE_SAUCES = ['Mango Omega', 'Ajo Cítrico', 'Chimichurri Vital', 'Golden Turmeric', 'Aguacate Cilantro'];
// Extra of an on-bowl ingredient: veg/grain/garnish $1.50, protein/premium $3.00.
const EXTRA_STD_CENTS = 150, EXTRA_PREMIUM_CENTS = 300;
// Added house sauces: the FIRST one is free, each ADDITIONAL one is $1.50.
const EXTRA_SAUCE_CENTS = 150;
const PREMIUM_RE = /\b(tuna|salmon|steak|shrimp|chicken|tofu|beef|pork|avocado|queso|cheese|almond|pecan)\b/i;
const ADDON_PRICE = { avocado_half: 200, extra_protein: 450, sweet_potato: 200, sauce_cup: 150 };
const ADDON_NAME = { avocado_half: '½ avocado', extra_protein: 'extra protein (4 oz)', sweet_potato: 'sweet potato', sauce_cup: 'extra sauce cup (2 oz)' };

function bowlLabel(key) { const N = String(key || '').toUpperCase(); return BOWL_LABEL[N] || N; }

// Validate + price ONE customized bowl against bowlspec. The protein (build[0]) can't be removed
// and only ingredients actually on the bowl can be removed or added-extra. Brown-rice swap is free
// and the FIRST added house sauce is free (each additional sauce is $1.50); addons + extra
// ingredients are priced server-side. Returns a priced
// snapshot with kitchen-facing fields (removals/addons/notes/build/macros) or { error }.
function priceCustomBowl(key, mods) {
  const baseCents = BOWL_BASE[key];
  if (baseCents == null) return { error: `Unknown bowl: ${key}` };
  const spec = BOWL_BY_NAME[String(key).toUpperCase()];
  if (!spec || spec.hidden) return { error: `Unknown bowl: ${key}` };
  const buildNames = spec.build.map((x) => x.item);
  const protein = buildNames[0];
  const m = mods || {};

  const removed = [];
  for (const r of (Array.isArray(m.removed) ? m.removed : [])) {
    if (typeof r !== 'string' || !buildNames.includes(r)) return { error: `Can't remove "${r}" from ${spec.name}.` };
    if (r === protein) return { error: `The protein can't be removed from ${spec.name}.` };
    if (!removed.includes(r)) removed.push(r);
  }
  const base = m.base === 'brown_rice' ? 'brown_rice' : null;
  const sauces = [];
  for (const s of (Array.isArray(m.sauces) ? m.sauces : [])) {
    if (HOUSE_SAUCES.includes(s) && !sauces.includes(s)) sauces.push(s);
  }
  // First added sauce is free; each additional sauce is $1.50.
  let extraCents = Math.max(0, sauces.length - 1) * EXTRA_SAUCE_CENTS;
  let avocado = false;
  const addonLabels = [];
  for (const e of (Array.isArray(m.extras) ? m.extras.slice(0, 12) : [])) {
    if (e && e.type === 'ingredient') {
      if (!buildNames.includes(e.name)) return { error: `Can't add extra "${e && e.name}".` };
      extraCents += PREMIUM_RE.test(e.name) ? EXTRA_PREMIUM_CENTS : EXTRA_STD_CENTS;
      addonLabels.push('extra ' + e.name);
    } else if (e && e.type === 'addon' && ADDON_PRICE[e.id] != null) {
      extraCents += ADDON_PRICE[e.id];
      addonLabels.push(ADDON_NAME[e.id]);
      if (e.id === 'avocado_half') avocado = true;
    } else {
      return { error: `Invalid extra on ${spec.name}.` };
    }
  }

  const noteParts = [];
  removed.forEach((r) => noteParts.push('no ' + r.toLowerCase()));
  if (base === 'brown_rice') noteParts.push('base→brown rice');
  sauces.forEach((s, i) => noteParts.push('+' + s + (i === 0 ? '' : ' ($1.50)')));
  addonLabels.forEach((l) => noteParts.push('+' + l));
  const keptBuild = spec.build.filter((x) => !removed.includes(x.item)).map((x) => ({ item: x.item, oz: x.oz }));

  return {
    unitCents: baseCents + extraCents,
    removed, base, sauces, avocado,
    addons: [...sauces.map((s, i) => '+' + s + (i === 0 ? '' : ' ($1.50)')), ...addonLabels.map((l) => '+' + l)],
    notes: noteParts.join(' · ') || null,
    build: keptBuild,
    ingredients: keptBuild.map((x) => x.item),
    macros: scaledBowlMacros(spec.name, 1),
    label: bowlLabel(key),
  };
}

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
    if (BOWL_BASE[it && it.id] != null) {
      // Customized bowl: qty units of one configuration. Re-priced + re-validated server-side.
      const qty = Math.floor(Number(it.qty));
      if (!Number.isFinite(qty) || qty < 1 || qty > 20) return bad('Invalid bowl quantity.');
      const pr = priceCustomBowl(it.id, it.mods);
      if (pr.error) return bad(pr.error);
      subtotalCents += pr.unitCents * qty;
      const lineName = pr.label + ' Bowl';
      const li = { name: lineName, quantity: String(qty), base_price_money: { amount: pr.unitCents, currency: 'USD' } };
      if (pr.notes) li.note = pr.notes.slice(0, 500);   // per-line mods for the kitchen on the Square order
      lineItems.push(li);
      orderItems.push({
        id: it.id, name: lineName + (pr.notes ? ' — ' + pr.notes : ''), qty, price_cents: pr.unitCents,
        size_oz: 16, size_pct: 100, macros: pr.macros, build: pr.build, ingredients: pr.ingredients,
        removals: pr.removed, addons: pr.addons, notes: pr.notes, avocado: pr.avocado, base: pr.base,
      });
    } else {
      const prod = CATALOG[it && it.id];
      if (!prod) return bad(`Unknown item: ${it && it.id}`);
      const qty = Math.floor(Number(it.qty));
      if (!Number.isFinite(qty) || qty < 1 || qty > 20) return bad(`Invalid quantity for ${prod.name}.`);
      const cents = Math.round(prod.price * 100);
      subtotalCents += cents * qty;
      lineItems.push({ name: prod.name, quantity: String(qty), base_price_money: money(prod.price) });
      orderItems.push({ id: it.id, name: prod.name, qty, price_cents: cents });
    }
  }

  // Two fulfillment modes:
  //   on_demand → make-now, delivered today. Only accepted inside the ET ordering window
  //               (default 11 AM–7 PM) and capped per bowl per day (launch throttle).
  //   scheduled → an upcoming Mon–Sat delivery, ordered before the 6 PM day-before cutoff.
  const WINDOWS = { lunch: 'Lunch (11:00 AM–1:00 PM)', dinner: 'Dinner (5:00 PM–7:00 PM)', asap: 'ASAP · today' };
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const onDemand = !!(b.fulfillment && b.fulfillment.mode === 'on_demand') || b.mode === 'on_demand';

  let win, dateStr, fulfillmentMode, fulfillLabel;
  if (onDemand) {
    fulfillmentMode = 'on_demand';
    const w = windowState(env);
    if (!w.open) {
      const closeDisp = w.closeMinute ? `${w.closeHour % 12 === 0 ? 12 : w.closeHour % 12}:${String(w.closeMinute).padStart(2, '0')} ${w.closeHour >= 12 ? 'PM' : 'AM'}` : fmtHour(w.closeHour);
      return bad(`On-demand ordering is open ${fmtHour(w.openHour)}–${closeDisp} ET. Please schedule a delivery instead, or order again during ordering hours.`, 409);
    }
    // Per-bowl daily production cap (launch throttle, tuned weekly). Tally the bowls in this
    // cart and reject if any would exceed what's left today. Drinks/add-ons are uncapped.
    const { limit } = onDemandConfig(env);
    const remaining = await remainingByBowl(env, w.dateStr, limit).catch(() => null);
    if (remaining) {
      const want = {};
      for (const it of orderItems) if (BOWL_IDS.includes(it.id)) want[it.id] = (want[it.id] || 0) + it.qty;
      for (const itemId of Object.keys(want)) {
        const left = Math.max(0, remaining[itemId] != null ? remaining[itemId] : limit);
        if (want[itemId] > left) {
          const nm = bowlLabel(itemId) + ' Bowl';
          return bad(
            left > 0
              ? `${nm} is limited to ${limit}/day on-demand — only ${left} left today. Lower the quantity or schedule a delivery.`
              : `${nm} is sold out for today's on-demand orders. Try another bowl or schedule a delivery.`,
            409
          );
        }
      }
    }
    dateStr = w.dateStr;     // today (ET) — kitchen makes it now, driver delivers same day
    win = 'asap';
    fulfillLabel = `On-demand (ASAP today ${w.dateStr})`;
  } else {
    fulfillmentMode = 'scheduled';
    const dlv = b.delivery || {};
    win = (dlv.window === 'lunch' || dlv.window === 'dinner') ? dlv.window : null;
    dateStr = (typeof dlv.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dlv.date)) ? dlv.date : null;
    if (!dateStr || !win) return bad('Please choose a delivery date and time window.');
    const midnightUtc = Date.parse(dateStr + 'T00:00:00Z');
    if (Number.isNaN(midnightUtc)) return bad('Invalid delivery date.');
    const dow = new Date(midnightUtc).getUTCDay();
    if (dow === 0) return bad('We deliver Monday–Saturday. Please pick another date.');
    const cutoff = midnightUtc - 2 * 3600 * 1000;   // ≈ 6 PM ET the prior day (EDT = UTC-4)
    if (Date.now() >= cutoff) return bad('That date has passed its order cutoff (6 PM the day before). Pick a later date.');
    if (midnightUtc - Date.now() > 24 * 24 * 3600 * 1000) return bad('Please choose a delivery date within the next few weeks.');
    fulfillLabel = `${DOW[dow]} ${dateStr} · ${WINDOWS[win]}`;
  }
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

  const deliveryNote = `${onDemand ? 'ON-DEMAND' : 'Delivery'} for ${firstName}: ${fulfillLabel} · ${addrLine}`;

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
        reference_id: onDemand ? 'web-ondemand' : 'web-delivery',
        note: deliveryNote,   // shows on the Square order for the kitchen
      },
      checkout_options: {
        redirect_url: `${base}/order/confirmed`,
        // We collect the delivery address ourselves (stored for routing), so don't ask twice.
        ask_for_shipping_address: false,
        // Show a tip prompt at checkout — driver gratuities. Tip lands in the Square order's
        // total_tip_money; the webhook records it on the order for owner/driver payout.
        allow_tipping: true,
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
            fulfillment_mode, subtotal_cents, fee_cents, tax_pct, total_estimate_cents,
            customer_name, customer_phone, sms_consent,
            delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes,
            delivery_lat, delivery_lng, geocoded_at, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'pending', ?, ?)`
      ).bind(
        id('ord'), pl.order_id || null, pl.id || null, JSON.stringify(orderItems), dateStr, win,
        fulfillmentMode, subtotalCents, feeCents, Number(taxPct),
        Math.round((subtotalCents + feeCents) * (1 + Number(taxPct) / 100)),
        firstName, custPhone, smsConsent,
        addr.street, addr.unit, addr.city, addr.state, addr.zip, addr.notes,
        lat, lng, geocodedAt, t, t
      ).run();
    } catch (_) { /* never fail checkout on the order-log write */ }
  }

  return json({ url });
};
