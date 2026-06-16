// Per-delivery add-on upsell helpers. Files under _lib are NOT routed.
//
// The morning of each subscription delivery day, the client is invited to add an extra
// item to that day's drop; they pay now via a Square payment link and the paid add-on is
// attached to the order so the kitchen + driver see it.
//
// SAFETY: the whole feature is gated by env.ADDONS_ENABLED === '1'. Until the owner flips
// it on (after confirming prices + copy), no customer is ever messaged or charged.
import { square, squareConfigured } from './square.js';
import { id } from './util.js';
import { SITE_BOWLS, BOWL_LABEL } from './bowlspec.js';

// The public bowls a client can pick for an "extra bowl for a friend" add-on.
export function bowlChoices() {
  return SITE_BOWLS.map((b) => ({
    name: b.name,
    label: BOWL_LABEL[b.name] || b.name,
    description: (b.description || '').slice(0, 90),
  }));
}
export function bowlLabel(name) {
  const hit = SITE_BOWLS.find((b) => b.name === name);
  return hit ? (BOWL_LABEL[hit.name] || hit.name) : null; // null ⇒ not a valid public bowl
}

// Master add-on catalog. PRICES ARE PLACEHOLDERS — owner confirms before enabling.
// Override any price via env (cents): ADDON_PRICE_DRINK / ADDON_PRICE_SHAKE / ADDON_PRICE_BOWL.
export const ADDON_CATALOG = [
  { kind: 'drink', name: 'Añejo Fit Drink', price_cents: 600, blurb: 'Oro Vital · Hibiscus Zen · Verde Vida' },
  { kind: 'shake', name: 'Protein Shake', price_cents: 900, blurb: 'Post-workout protein boost' },
  { kind: 'bowl', name: 'Extra 16oz Bowl (for a friend)', price_cents: 1500, blurb: "A full Añejo bowl added to today's drop" },
];

// Add-on order cutoffs (America/New_York, "HH:MM"). After the cutoff for that delivery's
// window, the kitchen has locked prep and the offer closes. Override via env.
const DEFAULT_CUTOFF = { lunch: '09:30', dinner: '14:00' };

export function addonsEnabled(env) {
  return !!(env && String(env.ADDONS_ENABLED || '') === '1');
}

// Resolve the catalog with any env price overrides applied.
export function catalogFor(env) {
  const ov = {
    drink: Number(env && env.ADDON_PRICE_DRINK),
    shake: Number(env && env.ADDON_PRICE_SHAKE),
    bowl: Number(env && env.ADDON_PRICE_BOWL),
  };
  return ADDON_CATALOG.map((c) => ({ ...c, price_cents: Number.isFinite(ov[c.kind]) && ov[c.kind] > 0 ? ov[c.kind] : c.price_cents }));
}

export function findAddon(env, kind) {
  return catalogFor(env).find((c) => c.kind === kind) || null;
}

// Current wall-clock minutes-since-midnight in America/New_York.
function nowMinutesET(ms) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(ms));
  const g = (t) => Number((p.find((x) => x.type === t) || {}).value);
  return (g('hour') % 24) * 60 + g('minute');
}
function cutoffMinutes(env, window) {
  const raw = (window === 'dinner' ? (env && env.ADDON_CUTOFF_DINNER) : (env && env.ADDON_CUTOFF_LUNCH))
    || DEFAULT_CUTOFF[window] || DEFAULT_CUTOFF.lunch;
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw));
  return m ? (Math.min(23, +m[1]) * 60 + Math.min(59, +m[2])) : (window === 'dinner' ? 840 : 570);
}
// True when add-ons for `deliveryDate`/`window` are still open right now.
export function addonOpen(env, deliveryDate, window, nowMs, todayStr) {
  if (deliveryDate < todayStr) return false;       // past day
  if (deliveryDate > todayStr) return true;        // future day — always open
  return nowMinutesET(nowMs) < cutoffMinutes(env, window); // today — until the window cutoff
}

// Create a Square payment link for the selected add-ons. Returns { url, squareOrderId } or
// null. selections: [{ kind, qty }]. Never throws on a Square hiccup (returns null).
export async function createAddonPaymentLink(env, { selections, base, order }) {
  if (!squareConfigured(env)) return null;
  const lineItems = [];
  let total = 0;
  for (const s of selections) {
    const c = findAddon(env, s.kind);
    const qty = Math.max(1, Math.min(20, Math.floor(Number(s.qty) || 0)));
    if (!c || qty <= 0) continue;
    total += c.price_cents * qty;
    lineItems.push({
      name: s.name || c.name,   // 'bowl' add-ons carry a specific bowl name override
      quantity: String(qty),
      base_price_money: { amount: c.price_cents, currency: 'USD' },
    });
  }
  if (!lineItems.length) return null;
  const { ok, data } = await square(env, '/v2/online-checkout/payment-links', {
    method: 'POST',
    body: {
      idempotency_key: id('adn'),
      order: {
        location_id: env.SQUARE_LOCATION_ID,
        line_items: lineItems,
        reference_id: 'addon',
        note: `Add-on for ${order.customer_name || 'member'} — ${order.delivery_date} ${order.delivery_window}`,
      },
      checkout_options: { redirect_url: `${base}/add-ons/confirmed`, ask_for_shipping_address: false },
    },
  });
  if (!ok) return null;
  const pl = data && data.payment_link;
  const url = pl && (pl.long_url || pl.url);
  if (!url) return null;
  return { url, squareOrderId: pl.order_id || null, totalCents: total };
}
