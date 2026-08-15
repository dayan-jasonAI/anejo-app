// The menu, as data.
//
// D1 (menu_items / menu_modifier_prices) is the source of truth so the owner can change a price
// from the HUB without a deploy. The constants below are a LAST-KNOWN-GOOD FALLBACK, not a second
// source of truth: if D1 is unreachable, checkout must still take money at the right price rather
// than fail. Every getter degrades to them and says so via `source`.
//
// Seeded identical to these values in migration 0043, so the switch changed no price.
//
// A row here makes an item LISTED and PRICED. For a bowl that is still not enough to make it
// BUYABLE — see orderability() below.
//
// ── KEEPING THIS TABLE HONEST (Dayan, 2026-08-15) ────────────────────────────────────────────
// "Last-known-good" only stays good if somebody keeps it good. Between migration 0043 and
// 2026-08-15 the owner repriced from the HUB — as designed, no deploy — and these constants
// silently became a year-old snapshot: 5 bowls up to $3.00 BELOW live, and all three Fit drinks
// $2.50 ABOVE it. Display and charge never disagreed (both resolve through loadMenu), so no
// customer was ever shown one price and charged another — but a D1 outage would have quietly
// discounted the bowls and OVERCHARGED every drink, which is the half that has to be answered
// to a real person holding a real receipt.
//
// Synced to live D1 on 2026-08-15 (read from /api/menu, source:"d1"). Drift is no longer left to
// anyone noticing: `npm run verify:live` now diffs this table against the live menu on every run
// and fails, naming each item and the direction. It refuses to compare when /api/menu is itself
// serving these fallbacks — otherwise the check would pass by comparing the table to itself in
// exactly the outage it exists to catch. When the owner reprices, re-run it and update here.
import { BOWL_BY_NAME } from './bowlspec.js';

export const FALLBACK_BOWLS = {
  vida: 2299, fuego: 2399, ligero: 1999, mar: 2499, coco: 2299, congreen: 2099, raiz: 2199,
};
export const FALLBACK_NON_BOWLS = {
  fit_gold: { name: 'Añejo Fit — Gold Vitality', price_cents: 749 },
  fit_hibiscus: { name: 'Añejo Fit — Hibiscus Zen', price_cents: 749 },
  fit_emerald: { name: 'Añejo Fit — Emerald Hydrate', price_cents: 749 },
  sauce_extra: { name: 'Extra Signature Sauce (2 oz)', price_cents: 150 },
};
export const FALLBACK_MODIFIERS = {
  extra_std: 150, extra_premium: 300, extra_sauce: 150,
  avocado_half: 200, extra_protein: 450, sweet_potato: 200, sauce_cup: 150,
};

const KINDS = ['bowl', 'drink', 'addon'];

/**
 * Full menu for pricing + display.
 * Returns { items, bowls, nonBowls, modifiers, source: 'd1' | 'fallback' }.
 * `bowls` / `nonBowls` / `modifiers` are shaped for direct use by checkout.
 */
export async function loadMenu(env) {
  const fallback = () => ({
    items: [],
    bowls: { ...FALLBACK_BOWLS },
    nonBowls: { ...FALLBACK_NON_BOWLS },
    modifiers: { ...FALLBACK_MODIFIERS },
    source: 'fallback',
  });
  if (!env || !env.DB) return fallback();

  let items = [], mods = [];
  try {
    const [ri, rm] = await Promise.all([
      env.DB.prepare('SELECT * FROM menu_items WHERE active = 1 ORDER BY kind, sort').all(),
      env.DB.prepare('SELECT key, cents FROM menu_modifier_prices').all(),
    ]);
    items = (ri && ri.results) || [];
    mods = (rm && rm.results) || [];
  } catch {
    return fallback();                       // table missing / D1 down → last known good
  }
  // An empty menu is far more likely to be a migration that hasn't run than a real empty menu —
  // serving "no bowls" would silently take the storefront down, so treat it as a fallback case.
  if (!items.length) return fallback();

  const bowls = {}, nonBowls = {}, availability = {}, stock = {};
  for (const it of items) {
    // Kept in the price maps even when sold out: removing it here would make checkout answer
    // "Unknown item", which is what it says for a typo. A sold-out bowl is not a typo, and the
    // difference matters to whoever reads the error.
    if (it.kind === 'bowl') bowls[it.id] = it.price_cents;
    else nonBowls[it.id] = { name: it.name, price_cents: it.price_cents };
    availability[it.id] = availabilityOf(it);
    // Only when the owner actually set one. NULL must stay NULL all the way down: 0 means "none
    // left" and undefined means "no manual count", and collapsing them would take an uncapped
    // drink off sale the moment this column existed.
    if (it.stock_count != null && it.stock_count !== '') {
      const n = Math.floor(Number(it.stock_count));
      if (Number.isFinite(n) && n >= 0) stock[it.id] = n;
    }
  }
  const modifiers = { ...FALLBACK_MODIFIERS };
  for (const m of mods) modifiers[m.key] = m.cents;

  // NOTE: deliberately NO per-bowl backfill from FALLBACK_BOWLS here. Backfilling every missing
  // bowl meant a bowl the owner DEACTIVATED in the HUB was still purchasable (checkout accepts any
  // id in the request body, not just what /api/menu advertises) AND was charged at the stale
  // hardcoded price rather than the owner's last saved one. The whole-menu fallback above already
  // covers the only case that matters — D1 being unreachable or the table being empty.

  return { items, bowls, nonBowls, modifiers, availability, stock, source: 'd1' };
}

/**
 * LISTED is not BUYABLE. A drink or add-on prices straight off its row and can be sold the moment
 * it is saved; a BOWL cannot. checkout.js re-validates and re-prices every customized bowl against
 * functions/_lib/bowlspec.js (macros + per-ingredient build) and rejects anything it has no recipe
 * for — after the customer has built a cart and pressed pay. So a bowl the owner adds in the HUB is
 * advertised by /api/menu and the assistant while checkout refuses it.
 *
 * This is the one place that answers "can it actually be bought?", so the HUB warns the owner using
 * the SAME test checkout applies rather than its own guess. Keep the lookup identical to
 * priceCustomBowl's guard in functions/api/checkout.js: menu id, uppercased, must hit a non-hidden
 * bowlspec entry.
 *
 * Returns { orderable, blocker } — blocker is null when orderable, otherwise says what is missing.
 */
/**
 * Temporary availability, separate from `active`.
 *
 * `active = 0` is a permanent hide and removes the row from /api/menu altogether. These states
 * keep the item VISIBLE and priced, and stop it being bought — so the customer sees "Sold out"
 * rather than a bowl that quietly vanished, which reads as a broken site rather than a busy kitchen.
 *
 * Everything except 'available' blocks the sale. The states differ only in what the customer is
 * told, and that difference is worth having: "sold out" says come back tomorrow, "coming soon"
 * says this is not a mistake, "out of stock" says the kitchen not the menu.
 */
export const AVAILABILITY = {
  available:    { label: 'Available',     label_es: 'Disponible',   sells: true },
  sold_out:     { label: 'Sold out',      label_es: 'Agotado',      sells: false },
  out_of_stock: { label: 'Out of stock',  label_es: 'Sin existencias', sells: false },
  unavailable:  { label: 'Not available', label_es: 'No disponible', sells: false },
  coming_soon:  { label: 'Coming soon',   label_es: 'Muy pronto',   sells: false },
};
export const AVAILABILITY_KEYS = Object.keys(AVAILABILITY);

/** Normalize whatever is on the row. An unrecognised value must never silently mean "sellable". */
export function availabilityOf(item) {
  const v = String((item && item.availability) || 'available').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(AVAILABILITY, v) ? v : 'unavailable';
}

/** Can this item be SOLD right now? Missing column (pre-migration) reads as available. */
export function isAvailable(item) {
  if (!item || item.availability == null || item.availability === '') return true;
  return AVAILABILITY[availabilityOf(item)].sells === true;
}

export function orderability(item) {
  const row = item || {};
  if (row.kind !== 'bowl') return { orderable: true, blocker: null };
  const spec = BOWL_BY_NAME[String(row.id).toUpperCase()];
  if (!spec) {
    return {
      orderable: false,
      blocker: `No recipe in functions/_lib/bowlspec.js — checkout rejects this bowl with "Unknown bowl: ${row.id}".`,
    };
  }
  if (spec.hidden) {
    return {
      orderable: false,
      blocker: `Its bowlspec recipe is flagged hidden, so checkout still rejects it with "Unknown bowl: ${row.id}".`,
    };
  }
  // Deliberately NOT folded into `orderable`. "Can this ever be bought?" and "is it on sale right
  // now?" are different questions with different fixes — one needs a recipe written, the other
  // needs a dropdown changed — and collapsing them would send the owner to the wrong one.
  return { orderable: true, blocker: null };
}

/** Convenience predicate for surfaces that only need yes/no. */
export function isOrderable(item) {
  return orderability(item).orderable;
}

/**
 * Is a bowl SOLD OUT right now, for a bowl already committed to a PAID ticket (a meal-plan
 * rotation slot) — a different question from "can this be bought", which is what isAvailable()
 * and orderability() answer for a NEW cart. The kitchen already has the money; this only asks
 * whether the promise it printed can still be kept, using the same two signals checkout.js
 * enforces before taking that money: the owner's availability dropdown, and today's manual
 * stock count (migrations 0059/0060).
 *
 * Returns 'availability' | 'stock' | null. Missing data — bowlId not present on the loaded menu
 * at all (a deleted item, a stale rotation, or loadMenu() having fallen back to the module
 * constants, which carry neither map) — is UNKNOWN, not sold out. Warning on data we don't have
 * would train the kitchen to ignore the warning the one day it is real.
 */
export function rotationBowlSoldOut(menu, bowlId) {
  const availability = menu && menu.availability;
  if (!bowlId || !availability || !Object.prototype.hasOwnProperty.call(availability, bowlId)) return null;
  if (availability[bowlId] !== 'available') return 'availability';
  const stock = menu && menu.stock;
  if (stock && Object.prototype.hasOwnProperty.call(stock, bowlId) && stock[bowlId] <= 0) return 'stock';
  return null;
}

/**
 * Scan a ticket's items for meal-plan rotation bowls that are sold out RIGHT NOW, and say so —
 * naming the bowl, never picking a replacement for it. A rotation bowl line only ever comes from
 * kitchenBowlLine() (functions/_lib/bowlspec.js), which ids it 'bowl_<name>'; an à-la-carte
 * item's id is the bare menu id (e.g. 'vida', from checkout.js), so this never fires on a regular
 * order — only on the plan/subscription deliveries suborders.js materializes.
 *
 * Deliberately just a report: NO substitution, NO reordering, NO hiding the ticket. What to do
 * about a sold-out rotation bowl is a decision for a person, not this function.
 */
export function planRotationWarnings(items, menu) {
  const warnings = [];
  for (const it of (Array.isArray(items) ? items : [])) {
    const itemId = it && it.id;
    if (typeof itemId !== 'string' || !itemId.startsWith('bowl_')) continue; // not a rotation line
    const bowlId = itemId.slice(5);
    const reason = rotationBowlSoldOut(menu, bowlId);
    if (!reason) continue;
    let label = 'Sold out — 0 made today', labelEs = 'Agotado — 0 preparados hoy';
    if (reason === 'availability') {
      const av = AVAILABILITY[menu.availability[bowlId]] || AVAILABILITY.unavailable;
      label = av.label; labelEs = av.label_es;
    }
    warnings.push({ item_id: itemId, bowl: (it && it.name) || bowlId.toUpperCase(), reason, label, label_es: labelEs });
  }
  return warnings;
}

/** Public catalog shape for /api/menu and the order page. */
export function publicCatalog(menu) {
  const byKind = { bowl: [], drink: [], addon: [] };
  for (const it of menu.items || []) {
    if (!KINDS.includes(it.kind)) continue;
    byKind[it.kind].push({
      id: it.id,
      name: it.name,
      name_es: it.name_es || it.name,
      price: (it.price_cents || 0) / 100,
      price_cents: it.price_cents,
      desc: it.description || '',
      desc_es: it.description_es || it.description || '',
      img: it.image || null,
      // Advertised but not yet buyable (a bowl with no recipe): flagged rather than filtered, so a
      // surface can hide it or grey it out while the owner still sees what they created.
      orderable: isOrderable(it),
      // Temporarily 86'd. Sent as a state rather than a boolean so the storefront can print the
      // owner's chosen wording instead of inventing one.
      availability: availabilityOf(it),
      available: isAvailable(it),
      availability_label: AVAILABILITY[availabilityOf(it)].label,
      availability_label_es: AVAILABILITY[availabilityOf(it)].label_es,
      // How many were made today, when the owner has said. The storefront shows what is LEFT,
      // which /api/order-availability computes — this is the ceiling, not the remainder.
      stock_count: it.stock_count == null || it.stock_count === '' ? null : Math.max(0, Math.floor(Number(it.stock_count)) || 0),
    });
  }
  return { bowls: byKind.bowl, drinks: byKind.drink, addons: byKind.addon, modifiers: menu.modifiers };
}
