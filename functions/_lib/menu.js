// The menu, as data.
//
// D1 (menu_items / menu_modifier_prices) is the source of truth so the owner can change a price
// from the HUB without a deploy. The constants below are a LAST-KNOWN-GOOD FALLBACK, not a second
// source of truth: if D1 is unreachable, checkout must still take money at the right price rather
// than fail. Every getter degrades to them and says so via `source`.
//
// Seeded identical to these values in migration 0043, so the switch changed no price.

export const FALLBACK_BOWLS = {
  vida: 1999, fuego: 2299, ligero: 1899, mar: 2299, coco: 2299, congreen: 2099, raiz: 1899,
};
export const FALLBACK_NON_BOWLS = {
  fit_gold: { name: 'Añejo Fit — Gold Vitality', price_cents: 999 },
  fit_hibiscus: { name: 'Añejo Fit — Hibiscus Zen', price_cents: 999 },
  fit_emerald: { name: 'Añejo Fit — Emerald Hydrate', price_cents: 999 },
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

  const bowls = {}, nonBowls = {};
  for (const it of items) {
    if (it.kind === 'bowl') bowls[it.id] = it.price_cents;
    else nonBowls[it.id] = { name: it.name, price_cents: it.price_cents };
  }
  const modifiers = { ...FALLBACK_MODIFIERS };
  for (const m of mods) modifiers[m.key] = m.cents;

  // A bowl missing from D1 would be unbuyable; keep the fallback price for anything absent.
  for (const [k, v] of Object.entries(FALLBACK_BOWLS)) if (bowls[k] == null) bowls[k] = v;

  return { items, bowls, nonBowls, modifiers, source: 'd1' };
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
    });
  }
  return { bowls: byKind.bowl, drinks: byKind.drink, addons: byKind.addon, modifiers: menu.modifiers };
}
