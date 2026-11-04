import { loadMenu, isAvailable, isOrderable } from './menu.js';

export const DEFAULT_SALE_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_SALE_TTL_MS = 48 * 60 * 60 * 1000;

export class InventorySaleError extends Error {
  constructor(code) { super(code); this.name = 'InventorySaleError'; this.code = code; }
}

const int = (v) => v !== null && v !== '' && v !== undefined && Number.isSafeInteger(Number(v));
const resultChanges = (r) => Number(r?.meta?.changes || 0);
const validImage = (v) => typeof v === 'string' && /^(?:\/?[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(v) && !v.split('/').includes('..');
const idSet = (xs) => [...new Set(xs)];

function imagePath(item) {
  if (!validImage(item.image)) return null;
  return item.image.startsWith('/assets/img/') ? item.image : `/assets/img/${item.image.replace(/^\//, '')}`;
}

/**
 * Read current sale offers for exact menu SKUs. `quantity` is an absolute count of unreserved
 * sellable units at declaration time; only reservations against that offer revision are removed.
 * This does not convert between package sizes and does not use ingredient or production counts.
 */
export async function saleOfferSnapshot(env, at = Date.now()) {
  if (!env?.DB || !Number.isFinite(Number(at))) return { ok: false, error: 'sale_offer_authority_unavailable', read_at: at, offers: [], suppressed: [] };
  try {
    const menu = await loadMenu(env);
    if (menu?.source !== 'd1') return { ok: false, error: 'sale_offer_authority_unavailable', read_at: at, offers: [], suppressed: [] };
    const offersResult = await env.DB.prepare('SELECT * FROM inventory_sale_offers ORDER BY menu_item_id').all();
    const reservationsResult = await env.DB.prepare('SELECT menu_item_id,offer_revision,quantity FROM inventory_sale_reservations').all();
    if (offersResult?.success === false || reservationsResult?.success === false || !Array.isArray(offersResult?.results) || !Array.isArray(reservationsResult?.results)) throw new Error('read_failed');
    const items = new Map((menu.items || []).map((item) => [item.id, item]));
    const reserved = new Map();
    for (const row of reservationsResult.results) {
      const key = `${row.menu_item_id}:${row.offer_revision}`;
      reserved.set(key, (reserved.get(key) || 0) + Number(row.quantity || 0));
    }
    const offers = [], suppressed = [];
    for (const offer of offersResult.results) {
      const item = items.get(offer.menu_item_id);
      const reason = !item ? 'menu_item_missing'
        : !item.active ? 'menu_item_inactive'
          : !isOrderable(item) ? 'menu_item_not_orderable'
            : !isAvailable(item) ? 'menu_item_unavailable'
              : !imagePath(item) ? 'catalog_image_missing'
                : !int(item.inventory_revision) || Number(item.inventory_revision) !== Number(offer.inventory_revision) ? 'inventory_revision_changed'
                  : !offer.enabled ? 'offer_disabled'
                    : !Number.isFinite(Number(offer.counted_at)) || Number(offer.counted_at) > at ? 'count_time_invalid'
                      : !Number.isFinite(Number(offer.sale_expires_at)) || Number(offer.sale_expires_at) <= at ? 'offer_expired'
                        : Number(offer.sale_expires_at) - Number(offer.counted_at) > MAX_SALE_TTL_MS ? 'offer_ttl_invalid'
                          : Number(offer.quantity) <= 0 ? 'zero_quantity'
                            : null;
      const quantity = Number(offer.quantity);
      const held = reserved.get(`${offer.menu_item_id}:${offer.revision}`) || 0;
      const remaining = quantity - held;
      if (reason || remaining <= 0) {
        suppressed.push({ item_id: offer.menu_item_id, revision: Number(offer.revision), reason: reason || 'zero_remaining' });
        continue;
      }
      const image = imagePath(item);
      offers.push({
        item_id: item.id, name: item.name, name_es: item.name_es || null,
        image, price_cents: item.price_cents,
        quantity, reserved: held, remaining,
        revision: Number(offer.revision), counted_at: Number(offer.counted_at),
        sale_expires_at: Number(offer.sale_expires_at), inventory_revision: Number(offer.inventory_revision),
        cta_url: `/order?product=${encodeURIComponent(item.id)}`,
      });
    }
    return { ok: true, read_at: at, offers, suppressed };
  } catch {
    return { ok: false, error: 'sale_offer_authority_unavailable', read_at: at, offers: [], suppressed: [] };
  }
}

/** Save or replace a declaration with optimistic revision and same-change replay protection. */
export async function saveSaleOffer(env, {
  itemId, quantity, enabled = true, expectedRevision = null, inventoryRevision,
  changeId, actorId = null, expiresAt = null, at = Date.now(),
} = {}) {
  if (!env?.DB) return { ok: false, error: 'sale_offer_authority_unavailable' };
  if (typeof itemId !== 'string' || !itemId.trim()) return { ok: false, error: 'invalid_item_id' };
  if (!int(quantity) || Number(quantity) < 0 || Number(quantity) > 9999) return { ok: false, error: 'invalid_quantity' };
  if (typeof enabled !== 'boolean') return { ok: false, error: 'invalid_enabled' };
  if (!int(inventoryRevision) || Number(inventoryRevision) < 0) return { ok: false, error: 'invalid_inventory_revision' };
  if (typeof changeId !== 'string' || !changeId.trim() || changeId.length > 160) return { ok: false, error: 'invalid_change_id' };
  if (!Number.isSafeInteger(Number(at)) || Number(at) <= 0) return { ok: false, error: 'invalid_count_time' };
  const saleExpiresAt = expiresAt == null ? Number(at) + DEFAULT_SALE_TTL_MS : Number(expiresAt);
  if (!Number.isSafeInteger(saleExpiresAt) || saleExpiresAt <= Number(at) || saleExpiresAt - Number(at) > MAX_SALE_TTL_MS) return { ok: false, error: 'invalid_sale_expiry' };
  if (expectedRevision != null && (!int(expectedRevision) || Number(expectedRevision) < 1)) return { ok: false, error: 'invalid_expected_revision' };

  try {
    const priorByChange = await env.DB.prepare('SELECT * FROM inventory_sale_offers WHERE change_id=?').bind(changeId).first();
    if (priorByChange) {
      const same = priorByChange.menu_item_id === itemId && Number(priorByChange.quantity) === Number(quantity) && Number(priorByChange.enabled) === Number(enabled) && Number(priorByChange.inventory_revision) === Number(inventoryRevision) && Number(priorByChange.counted_at) === Number(at) && Number(priorByChange.sale_expires_at) === saleExpiresAt && (priorByChange.actor_id || null) === (actorId || null);
      return same ? { ok: true, replayed: true, revision: Number(priorByChange.revision), change_id: changeId } : { ok: false, error: 'change_id_conflict' };
    }
    const item = await env.DB.prepare('SELECT id,active,inventory_revision FROM menu_items WHERE id=?').bind(itemId).first();
    if (!item || !item.active) return { ok: false, error: 'menu_item_missing_or_inactive' };
    if (Number(item.inventory_revision || 0) !== Number(inventoryRevision)) return { ok: false, error: 'inventory_revision_changed' };
    const current = await env.DB.prepare('SELECT revision FROM inventory_sale_offers WHERE menu_item_id=?').bind(itemId).first();
    if ((current ? Number(current.revision) : null) !== (expectedRevision == null ? null : Number(expectedRevision))) return { ok: false, error: 'sale_offer_revision_changed' };
    const nextRevision = current ? Number(current.revision) + 1 : 1;
    const statement = current
      ? env.DB.prepare(`UPDATE inventory_sale_offers SET quantity=?,revision=?,counted_at=?,sale_expires_at=?,inventory_revision=?,enabled=?,change_id=?,actor_id=? WHERE menu_item_id=? AND revision=? AND EXISTS(SELECT 1 FROM menu_items WHERE id=? AND active=1 AND inventory_revision=?)`)
        .bind(quantity, nextRevision, at, saleExpiresAt, inventoryRevision, enabled, changeId, actorId, itemId, expectedRevision, itemId, inventoryRevision)
      : env.DB.prepare(`INSERT INTO inventory_sale_offers(menu_item_id,quantity,revision,counted_at,sale_expires_at,inventory_revision,enabled,change_id,actor_id) SELECT ?,?,1,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM menu_items WHERE id=? AND active=1 AND inventory_revision=?)`)
        .bind(itemId, quantity, at, saleExpiresAt, inventoryRevision, enabled, changeId, actorId, itemId, inventoryRevision);
    const saved = await statement.run();
    if (resultChanges(saved) !== 1) return { ok: false, error: 'sale_offer_revision_changed' };
    return { ok: true, replayed: false, revision: nextRevision, change_id: changeId, counted_at: at, sale_expires_at: saleExpiresAt };
  } catch (error) {
    if (/UNIQUE constraint failed: inventory_sale_offers.change_id/.test(String(error?.message))) return { ok: false, error: 'change_id_conflict' };
    return { ok: false, error: 'sale_offer_save_unavailable' };
  }
}

function explicitRevision(item) {
  if (Number.isSafeInteger(item?.sale_offer_revision) && item.sale_offer_revision > 0) return item.sale_offer_revision;
  if (Number.isSafeInteger(item?.offer_revision) && item.offer_revision > 0) return item.offer_revision;
  return null;
}

/**
 * Return D1 statements to splice into the caller's transaction as:
 *   claims, existing order INSERT, reservations.
 * The caller must batch all of them together before exposing a checkout link. A CHECK-constrained
 * claim is re-evaluated against live rows inside that transaction, so a race aborts the whole batch.
 * Explicit sale_offer_revision keeps a promotion fail-closed even if its offer row disappeared.
 */
export async function stockReservationStatements(env, { orderId, items, at = Date.now() } = {}) {
  if (!env?.DB || typeof orderId !== 'string' || !orderId || !Number.isSafeInteger(Number(at)) || !Array.isArray(items)) throw new InventorySaleError('invalid_checkout_claim');
  const merged = new Map();
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || !Number.isSafeInteger(Number(item.qty)) || Number(item.qty) < 1) throw new InventorySaleError('invalid_checkout_item');
    const prior = merged.get(item.id) || { id: item.id, qty: 0, revision: explicitRevision(item) };
    prior.qty += Number(item.qty);
    const rev = explicitRevision(item);
    if (prior.revision && rev && prior.revision !== rev) throw new InventorySaleError('sale_offer_revision_conflict');
    if (rev) prior.revision = rev;
    merged.set(item.id, prior);
  }
  if (!merged.size) return [];
  const ids = idSet([...merged.values()].map(x => x.id));
  let offers;
  try {
    const placeholders = ids.map(() => '?').join(',');
    const read = await env.DB.prepare(`SELECT * FROM inventory_sale_offers WHERE menu_item_id IN (${placeholders})`).bind(...ids).all();
    if (read?.success === false || !Array.isArray(read?.results)) throw Error('read_failed');
    offers = new Map(read.results.map(row => [row.menu_item_id, row]));
  } catch { throw new InventorySaleError('sale_offer_authority_unavailable'); }
  const claimed = [];
  for (const entry of merged.values()) {
    const offer = offers.get(entry.id);
    if (!offer && !entry.revision) continue;
    const expectedRevision = entry.revision || Number(offer.revision);
    if (offer && Number(offer.revision) !== expectedRevision) throw new InventorySaleError('sale_offer_revision_changed');
    if (!offer) throw new InventorySaleError('sale_offer_missing');
    if (!offer.enabled) throw new InventorySaleError('sale_offer_disabled');
    if (Number(offer.sale_expires_at) <= at || Number(offer.counted_at) > at) throw new InventorySaleError('sale_offer_expired_or_invalid');
    if (Number(offer.quantity) <= 0) throw new InventorySaleError('sale_offer_zero_quantity');
    const reservation = await env.DB.prepare('SELECT COALESCE(SUM(quantity),0) n FROM inventory_sale_reservations WHERE menu_item_id=? AND offer_revision=?').bind(entry.id, expectedRevision).first();
    const remaining = Number(offer.quantity) - Number(reservation?.n || 0);
    if (entry.qty > remaining) throw new InventorySaleError('sale_offer_quantity_exceeded');
    claimed.push({ ...entry, revision: expectedRevision, inventoryRevision: Number(offer.inventory_revision) });
  }
  if (!claimed.length) return [];
  const claims = [], reservations = [];
  for (const item of claimed) {
    claims.push(env.DB.prepare(`INSERT INTO inventory_sale_checkout_claims(order_id,menu_item_id,offer_revision,quantity,accepted,claimed_at)
      SELECT ?,?,?,?,CASE WHEN EXISTS(
        SELECT 1 FROM inventory_sale_offers o JOIN menu_items m ON m.id=o.menu_item_id
        WHERE o.menu_item_id=? AND o.revision=? AND o.enabled=1 AND o.counted_at<=? AND o.sale_expires_at>? AND o.sale_expires_at-o.counted_at<=? AND o.quantity>0
          AND o.inventory_revision=? AND m.active=1 AND m.inventory_revision=? AND m.availability='available'
          AND o.quantity-COALESCE((SELECT SUM(r.quantity) FROM inventory_sale_reservations r WHERE r.menu_item_id=o.menu_item_id AND r.offer_revision=o.revision),0)>=?
      ) THEN 1 ELSE 0 END,?`)
      .bind(orderId, item.id, item.revision, item.qty, item.id, item.revision, at, at, MAX_SALE_TTL_MS, item.inventoryRevision, item.inventoryRevision, item.qty, at));
    reservations.push(env.DB.prepare(`INSERT INTO inventory_sale_reservations(order_id,menu_item_id,offer_revision,quantity,reserved_at)
      SELECT order_id,menu_item_id,offer_revision,quantity,claimed_at FROM inventory_sale_checkout_claims
      WHERE order_id=? AND menu_item_id=? AND accepted=1`)
      .bind(orderId, item.id));
  }
  return [...claims, ...reservations];
}
