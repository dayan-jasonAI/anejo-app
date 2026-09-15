// GET /api/catering-catalog — what each catering product costs and looks like, right now.
//
// The quote form could previously show a customer only one number: a lump subtotal, after they
// had already chosen quantities blind. "Prices should be upfront" (Dayan, 2026-09-09) needs the
// opposite — a price and a photo on each product BEFORE it is picked.
//
// Everything here is derived from the SAME mapping the estimate prices against
// (_lib/catering-estimate.js: candidates), read off the SAME live D1 menu. A price shown here can
// therefore never be a price the checkout disagrees with: if a tray is unpublished, sold out or
// out of stock it produces no pack here and no pack there. Nothing in this file has its own
// number in it.
import { json } from '../_lib/util.js';
import { loadMenu, isAvailable, isOrderable } from '../_lib/menu.js';
import { candidates } from '../_lib/catering-estimate.js';
import { DISCOUNT_TIERS } from '../_lib/catering-pricing.js';
import { DEPOSIT_PCT } from '../_lib/catering_terms.js';
import { cateringProducts } from '../../public/assets/js/catering-products-catalog.js';
import { CAJITA_FLAVORS } from '../_lib/cajita-food-options.js';
import { limitOr429 } from '../_lib/ratelimit.js';

// Menu rows store a path relative to the image root ('menu-launch/food-lechon.webp'), and every
// other surface on the site renders it as '/assets/img/' + image (menu.html, order.html,
// shop-order.js). Same convention here — a bare relative path 404s from /catering and the customer
// gets a monogram where the food should be.
const imageUrl = (v) => (!v ? null : /^(https?:)?\/\//.test(v) || v.startsWith('/') ? v : `/assets/img/${v}`);

// A menu row is sellable only under exactly the conditions the estimator applies. Kept as one
// predicate so the two cannot drift into disagreeing about what "available" means.
function sellable(item, menu) {
  return item && item.active !== 0 && item.active !== false
    && isAvailable(item) && isOrderable(item)
    && (!menu.availability?.[item.id] || menu.availability[item.id] === 'available')
    && Number.isSafeInteger(item.price_cents) && item.price_cents > 0;
}

// Resolve one selector product (optionally at one flavor) into its published packs.
function packsFor(id, flavor, live, menu) {
  const out = [];
  for (const [sku, size] of candidates({ id, flavor })) {
    const item = live.get(sku);
    if (!sellable(item, menu)) continue;
    out.push({ sku, size, cents: item.price_cents, per_unit_cents: Math.round(item.price_cents / size), image: imageUrl(item.image) });
  }
  return out.sort((a, b) => a.size - b.size);
}

export async function onRequestGet({ request, env }) {
  const limited = await limitOr429(env, request, { name: 'catering-catalog', limit: 120, windowSec: 60 });
  if (limited) return limited;

  const menu = await loadMenu(env);
  const live = new Map((menu?.source === 'd1' ? menu.items || [] : []).map((row) => [row.id, row]));
  const products = [];

  for (const product of cateringProducts) {
    // A custom line has no published price by definition — it is what "quoted after review" is
    // for. Listed anyway so the picker can render it, just without a number it cannot honour.
    if (product.custom) {
      products.push({ id: product.id, category: product.category, en: product.en, es: product.es, unit: product.unit, custom: true, packs: [], flavors: null });
      continue;
    }

    const flavorList = product.flavorKey ? CAJITA_FLAVORS[product.flavorKey] : null;
    let packs = [];
    let flavors = null;

    if (flavorList) {
      flavors = {};
      for (const [key, en, es] of flavorList) {
        const p = packsFor(product.id, key, live, menu);
        flavors[key] = { en, es, packs: p, from_cents: p.length ? Math.min(...p.map((x) => x.per_unit_cents)) : null };
      }
      // The product's headline price is its cheapest priced filling; fillings with no published
      // tray (croqueta de chorizo, atún…) stay visible and simply say they are quoted.
      const priced = Object.values(flavors).filter((f) => f.from_cents != null);
      packs = priced.length ? flavors[Object.keys(flavors).find((k) => flavors[k].from_cents === Math.min(...priced.map((f) => f.from_cents)))].packs : [];
    } else {
      packs = packsFor(product.id, null, live, menu);
    }

    const image = packs.find((p) => p.image)?.image
      || (flavors && Object.values(flavors).flatMap((f) => f.packs).find((p) => p.image)?.image)
      || null;

    products.push({
      id: product.id, category: product.category, en: product.en, es: product.es,
      unit: product.unit, addon: Boolean(product.addon), custom: false,
      image,
      unit_cents: packs.find((p) => p.size === 1)?.cents ?? null,
      from_cents: packs.length ? Math.min(...packs.map((p) => p.per_unit_cents)) : null,
      // The tray sizes actually published for this product — 10/25, 25/50, 12, 3 — so the picker
      // offers real buttons instead of a number box and a guess.
      packs: packs.map(({ size, cents, per_unit_cents }) => ({ size, cents, per_unit_cents })),
      flavors: flavors && Object.fromEntries(Object.entries(flavors).map(([k, v]) => [k, {
        en: v.en, es: v.es, from_cents: v.from_cents,
        packs: v.packs.map(({ size, cents, per_unit_cents }) => ({ size, cents, per_unit_cents })),
      }])),
    });
  }

  const response = json({
    currency: 'USD',
    // 'fallback' means D1 was unreachable and these are not live prices. The picker must say so
    // rather than quietly showing a stale number next to a Buy button.
    live: menu?.source === 'd1',
    products,
    discount_tiers: DISCOUNT_TIERS.filter((t) => t.rate > 0).map((t) => ({ from_cents: t.from_cents, rate: t.rate })),
    // The deposit rate travels WITH the catalogue. The selector used to hardcode 0.25; when the
    // rate went to 50% on 2026-09-09 the button still said "25% deposit, $135.93" while the
    // server minted a link for twice that. A page must never name a price the server will not
    // charge — so this is served, not copied.
    deposit_pct: DEPOSIT_PCT,
    minimum_notice_hours: 48,
    custom_printing_notice_hours: 72,
  });
  // Prices and stock move during service; a cached catalog is a wrong price on a Buy button.
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
