// /api/hub/kitchen/inventory — kitchen inventory with par levels.
//   GET  → active items (name, unit, on_hand, par_level, vendor name, below_par),
//          below-par first then name. ?all=1 also includes archived items.
//          Also returns active vendors (staff role='vendor') for the vendor select.
//   POST { action:'upsert', id?, name, unit?, on_hand?, par_level?, vendor_id? }
//        { action:'count', id, on_hand }                — quick stock count
//        { action:'menu_count', id, stock_count }       — how many FINISHED bowls/drinks we made
//        { action:'archive'|'restore', id }             — soft flag, never delete
// After any count/upsert, raises a deduped low_stock alert when on_hand < par_level.
// Kitchen + owner. Fires inventory.counted / inventory.updated.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { id, now } from '../../../_lib/hub.js';
import { capture } from '../../../_lib/track.js';
import { raiseAlert } from '../../../_lib/alerts.js';
import { loadMenu } from '../../../_lib/menu.js';
import { loadOrderingSettings, onDemandConfig, windowState, remainingByBowl } from '../../../_lib/ondemand.js';
import { changeInsert, commitChange, notifyInventory } from '../../../_lib/inventory_updates.js';
import { reconcileInventoryProduction } from '../../../_lib/inventory_production.js';

// TWO DIFFERENT KINDS OF STOCK LIVE ON THIS PAGE, and conflating them would be a mistake:
//   · inventory_items — INGREDIENTS. Pounds of tuna, cases of avocado. Drives par levels and
//     restock POs. Nothing here is sold directly.
//   · menu_items.stock_count — FINISHED ITEMS. "We made 6 VIDA this morning." This is what the
//     storefront actually sells against, and it is the number the kitchen knows first.
// The kitchen counts the second one on the same screen it counts the first, because that is one
// walk around the kitchen, not two. Raw inventory never directly creates sellable food.
// Only an owner-reviewed production task consumes mapped inputs and adds its recorded yield.
async function preparedStock(env) {
  try {
    const menu = await loadMenu(env);
    if (!menu || menu.source !== 'd1') return { items: [], status: 'unavailable' };
    const countRows = await env.DB.prepare('SELECT id,stock_counted_at FROM menu_items WHERE active=1').all();
    if(!countRows||countRows.success===false||!Array.isArray(countRows.results))throw Error('finished_count_read_failed');
    const counted = new Map(countRows.results.map(r=>[r.id,r.stock_counted_at]));
    const settings = await loadOrderingSettings(env);
    const { limit } = onDemandConfig(env, settings);
    const w = windowState(env, new Date(), settings);
    const remaining = await remainingByBowl(env, w.dateStr, limit, menu).catch(() => ({}));
    const items = (menu.items || []).map((it) => ({
      id: it.id,
      name: it.name,
      kind: it.kind,
      stock_counted_at: counted.get(it.id) || null,
      availability: menu.availability[it.id] || 'available',
      // What the owner (or kitchen) said we made. null = no manual count.
      stock_count: it.stock_count == null || it.stock_count === '' ? null : Math.floor(Number(it.stock_count)),
      // What is LEFT after today's orders — derived, never stored, so it cannot drift.
      remaining: remaining && remaining[it.id] != null ? remaining[it.id] : null,
      default_limit: limit,
    }));
    return { items, status: 'available' };
  } catch { return { items: [], status: 'unavailable' }; }
}

// Low-stock check after a write. raiseAlert dedupes open alerts on dedupe_key itself.
async function checkLowStock(env, item) {
  if (!item) return;
  const onHand = Number(item.on_hand) || 0;
  const par = Number(item.par_level) || 0;
  // Restocked to/above par → auto-close any open low_stock alert (no stale alerts to chase).
  if (!(par > 0) || onHand >= par) {
    try {
      await env.DB.prepare("UPDATE alerts SET status='acknowledged', acknowledged_at=?, updated_at=? WHERE dedupe_key=? AND status='open'")
        .bind(Date.now(), Date.now(), `low_stock:${item.id}`).run();
    } catch { /* best-effort */ }
    return;
  }
  await raiseAlert(env, {
    alert_type: 'low_stock',
    severity: 'warning',
    title: `Low stock: ${item.name}`,
    body: `${onHand} ${item.unit || 'ea'} on hand, par ${par}`,
    team: 'kitchen',
    ref_type: 'inventory',
    ref_id: item.id,
    source: 'surface',
    dedupe_key: `low_stock:${item.id}`,
  });
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const includeAll = url.searchParams.get('all') === '1';

  let items;
  let vendors;
  let changes;
  try {
    const res = await env.DB
      .prepare(
        'SELECT i.id, i.name, i.unit, i.on_hand, i.par_level, i.vendor_id, i.unit_cost_cents, i.active, i.updated_at, i.count_quantity, i.total_weight_grams, i.photo_key, i.photo_status, i.revision, i.photo_reviewed_by, i.photo_reviewed_at, i.counted_at, i.expires_on, ' +
        'v.name AS vendor_name, v.lead_time_days AS vendor_lead_days, ' +
        '(CASE WHEN i.par_level > 0 AND i.on_hand < i.par_level THEN 1 ELSE 0 END) AS below_par ' +
        'FROM inventory_items i LEFT JOIN staff v ON v.id = i.vendor_id ' +
        (includeAll ? '' : 'WHERE i.active=1 ') +
        'ORDER BY below_par DESC, i.active DESC, i.name'
      )
      .all();
    if (!res || res.success === false || !Array.isArray(res.results)) return bad('Inventory data is temporarily unavailable.', 503);
    items = res.results.map((r) => ({ ...r, below_par: !!r.below_par, active: !!r.active }));
    const vendorRes = await env.DB
      .prepare("SELECT id, name FROM staff WHERE role='vendor' AND active=1 ORDER BY name")
      .all();
    if (!vendorRes || vendorRes.success === false || !Array.isArray(vendorRes.results)) return bad('Inventory vendors are temporarily unavailable.', 503);
    vendors = vendorRes.results;
    const changeRes = await env.DB.prepare('SELECT id,item_id,action,actor_id,before_json,after_json,created_at,push_status FROM inventory_changes ORDER BY created_at DESC LIMIT 30').all();
    if (!changeRes || changeRes.success === false || !Array.isArray(changeRes.results)) return bad('Inventory history is temporarily unavailable.', 503);
    changes = changeRes.results;
  } catch { return bad('Inventory data is temporarily unavailable.', 503); }
  const prepared = await preparedStock(env);
  return json({
    ok: true, actor_role: ctx.role, items, vendors,
    changes,
    below_par_count: items.filter((i) => i.below_par && i.active).length,
    prepared: prepared.items,
    prepared_status: prepared.status,
  });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const action = (b && b.action || '').toString().trim();
  const t = now();
  const by = (staff && staff.id) || ctx.distinct_id || null;

  const finish = async (change, response) => {
    const push_status = await notifyInventory(env, change.changeId);
    let production;
    try { production = await reconcileInventoryProduction(env, { actorId: by, changeId: change.changeId }); }
    catch (error) { production = { ok: false, error: String(error?.message || 'unavailable') }; }
    return json({ ...response, change_id: change.changeId, push_status, production_status: production?.ok ? 'reconciled' : 'unavailable', production_error: production?.ok ? null : production?.error || 'unavailable' });
  };

  if (action === 'review_photo') {
    if (ctx.role !== 'owner') return bad('Only the owner can review inventory photos.', 403);
    const itemId = String(b.id || '').trim();
    const key = String(b.photo_key || '');
    if (!itemId || !/^kitchen\/inventory\/[\w/-]+\.(jpg|png|webp)$/.test(key) || key.includes('//') || !['approve','reject'].includes(b.decision)) return bad('Invalid photo review.');
    const item = await env.DB.prepare('SELECT * FROM inventory_items WHERE id=?').bind(itemId).first();
    if (!item) return bad('Item not found.', 404);
    if (item.photo_key !== key || item.photo_status !== 'pending') return bad('That photo is no longer awaiting review.', 409);
    if (b.expected_revision != null && Number(b.expected_revision) !== Number(item.revision || 0)) return bad('Inventory item changed. Refresh before saving.', 409);
    const status = b.decision === 'approve' ? 'approved' : 'rejected';
    const after = { ...item, photo_status: status, photo_reviewed_by: by, photo_reviewed_at: t, revision: Number(item.revision || 0) + 1, last_change_id: null };
    const change = changeInsert({ itemId, action: 'review_photo', actorId: by, before: item, after, at: t });
    const committed = await commitChange(env, { sql: "UPDATE inventory_items SET photo_status=?,photo_reviewed_by=?,photo_reviewed_at=?,updated_by=?,updated_at=?,revision=revision+1,last_change_id=? WHERE id=? AND revision=? AND photo_key=? AND photo_status='pending'", args: [status,by,t,by,t,change.changeId,itemId,Number(item.revision || 0),key] }, change);
    if (!committed.ok) return bad('Photo review was not saved.', 409);
    return finish(change, { ok: true, id: itemId, photo_key: key, photo_status: status });
  }

  // ---- quick stock count ----
  if (action === 'count') {
    const itemId = (b && b.id || '').toString().trim();
    const onHand = Number(b && b.on_hand);
    if (!itemId) return bad('Missing item id.');
    if (!Number.isFinite(onHand) || onHand < 0) return bad('On-hand must be a number ≥ 0.');
    const quantity = b.count_quantity == null || b.count_quantity === '' ? undefined : Number(b.count_quantity);
    const weight = b.total_weight_grams == null || b.total_weight_grams === '' ? undefined : Number(b.total_weight_grams);
    const expiry = b.expires_on == null ? undefined : String(b.expires_on).trim();
    if (quantity !== undefined && (!Number.isSafeInteger(quantity) || quantity < 0)) return bad('Count quantity must be a whole number ≥ 0.');
    if (weight !== undefined && (!Number.isFinite(weight) || weight < 0)) return bad('Total weight must be a number ≥ 0 grams.');
    if (expiry !== undefined && expiry !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(expiry) || new Date(`${expiry}T00:00:00Z`).toISOString().slice(0,10) !== expiry)) return bad('Expiration date must be a valid YYYY-MM-DD date.');

    const item = await env.DB.prepare('SELECT * FROM inventory_items WHERE id=?').bind(itemId).first();
    if (!item) return bad('Item not found.', 404);

    if (b.expected_revision != null && Number(b.expected_revision) !== Number(item.revision || 0)) return bad('Inventory item changed. Refresh before saving.', 409);
    const after = { ...item, on_hand: onHand, count_quantity: quantity === undefined ? item.count_quantity : quantity, total_weight_grams: weight === undefined ? item.total_weight_grams : weight, expires_on: expiry === undefined ? item.expires_on : expiry || null, counted_at: t, updated_by: by, updated_at: t, revision: Number(item.revision || 0) + 1 };
    const change = changeInsert({ itemId, action, actorId: by, before: item, after, at: t });
    const committed = await commitChange(env, { sql: 'UPDATE inventory_items SET on_hand=?,count_quantity=?,total_weight_grams=?,expires_on=?,counted_at=?,updated_by=?,updated_at=?,revision=revision+1,last_change_id=? WHERE id=? AND revision=?', args: [onHand,after.count_quantity ?? null,after.total_weight_grams ?? null,after.expires_on ?? null,t,by,t,change.changeId,itemId,Number(item.revision || 0)] }, change);
    if (!committed.ok) return bad('Inventory count was not saved.', 409);

    await capture(env, {
      event: 'inventory.counted',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { item_id: itemId, on_hand: onHand, par_level: item.par_level },
    });

    await checkLowStock(env, { ...item, on_hand: onHand });
    return finish(change, { ok: true, id: itemId, on_hand: onHand, below_par: Number(item.par_level) > 0 && onHand < Number(item.par_level) });
  }

  // ---- how many finished bowls/drinks we made today ----
  if (action === 'menu_count') {
    const itemId = (b && b.id || '').toString().trim();
    if (!itemId) return bad('Missing item id.');
    const row = await env.DB.prepare('SELECT id, name, stock_count, stock_counted_at, inventory_revision, last_inventory_change_id FROM menu_items WHERE id=?').bind(itemId).first();
    if (!row) return bad('Item not found.', 404);

    const raw = b && b.stock_count;
    let next = null;
    if (raw !== '' && raw != null) {
    const n = Number(raw);
      // Blank clears the limit; 0 means none left. Never coerce one into the other.
      if (!Number.isInteger(n) || n < 0 || n > 9999) return bad('Count must be a whole number 0–9999, or blank for no limit.');
      next = n;
    }
    if (b.expected_revision != null && Number(b.expected_revision) !== Number(row.inventory_revision || 0)) return bad('Finished-item count changed. Refresh before saving.', 409);

    const change = changeInsert({ itemId, action, actorId: by, before: row, after: { ...row, stock_count: next, stock_counted_at:t, inventory_revision: Number(row.inventory_revision || 0) + 1, last_inventory_change_id: null }, at: t, table: 'menu_items', marker: 'last_inventory_change_id' });
    const committed = await commitChange(env, { sql: 'UPDATE menu_items SET stock_count=?, updated_at=?, stock_counted_at=?, inventory_revision=inventory_revision+1,last_inventory_change_id=? WHERE id=? AND inventory_revision=?', args: [next, t, t, change.changeId, itemId, Number(row.inventory_revision || 0)] }, change);
    if (!committed.ok) return bad('Menu count was not saved.', 409);
    await capture(env, {
      event: 'menu.stock_counted',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { item_id: itemId, stock_count: next, was: row.stock_count == null ? null : Number(row.stock_count) },
    });
    return finish(change, { ok: true, id: itemId, stock_count: next, prepared: await preparedStock(env) });
  }

  // ---- archive / restore (soft flag — never delete) ----
  if (action === 'archive' || action === 'restore') {
    const itemId = (b && b.id || '').toString().trim();
    if (!itemId) return bad('Missing item id.');
    const item = await env.DB.prepare('SELECT * FROM inventory_items WHERE id=?').bind(itemId).first();
    if (!item) return bad('Item not found.', 404);
    if (b.expected_revision != null && Number(b.expected_revision) !== Number(item.revision || 0)) return bad('Inventory item changed. Refresh before saving.', 409);
    const active = action === 'archive' ? 0 : 1;
    const change = changeInsert({ itemId, action, actorId: by, before: item, after: { ...item, active, updated_by: by, updated_at: t, revision: Number(item.revision || 0) + 1 }, at: t });
    const committed = await commitChange(env, { sql: 'UPDATE inventory_items SET active=?, updated_by=?, updated_at=?, revision=revision+1,last_change_id=? WHERE id=? AND revision=?', args: [active, by, t, change.changeId, itemId, Number(item.revision || 0)] }, change);
    if (!committed.ok) return bad('Inventory item was not changed.', 409);

    await capture(env, {
      event: 'inventory.updated',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { item_id: itemId, action },
    });
    return finish(change, { ok: true, id: itemId, active: action !== 'archive' });
  }

  // ---- upsert (create or edit) ----
  if (action !== 'upsert') return bad('Unknown action.');

  const itemId = (b && b.id || '').toString().trim() || null;
  const name = (b && b.name || '').toString().trim().slice(0, 80);
  const unit = (b && b.unit || '').toString().trim().slice(0, 16) || null;
  const onHand = b && b.on_hand != null && b.on_hand !== '' ? Number(b.on_hand) : null;
  const parLevel = b && b.par_level != null && b.par_level !== '' ? Number(b.par_level) : null;
  const vendorId = (b && b.vendor_id || '').toString().trim() || null;
  const countQuantity = b && b.count_quantity != null && b.count_quantity !== '' ? Number(b.count_quantity) : undefined;
  const totalWeight = b && b.total_weight_grams != null && b.total_weight_grams !== '' ? Number(b.total_weight_grams) : undefined;
  const expiresOn = b && b.expires_on != null ? String(b.expires_on).trim() : undefined;
  // Canonical per-unit price (cents) for vendor-order cost estimates (Phase 4b).
  const unitCostCents = b && b.unit_cost_cents != null && b.unit_cost_cents !== '' ? Math.max(0, Math.round(Number(b.unit_cost_cents))) : null;
  if (!name) return bad('Item name is required.');
  if (onHand != null && (!Number.isFinite(onHand) || onHand < 0)) return bad('On-hand must be a number ≥ 0.');
  if (parLevel != null && (!Number.isFinite(parLevel) || parLevel < 0)) return bad('Par level must be a number ≥ 0.');
  if (countQuantity !== undefined && (!Number.isSafeInteger(countQuantity) || countQuantity < 0)) return bad('Count quantity must be a whole number ≥ 0.');
  if (totalWeight !== undefined && (!Number.isFinite(totalWeight) || totalWeight < 0)) return bad('Total weight must be a number ≥ 0 grams.');
  if (expiresOn !== undefined && expiresOn !== '' && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn) || new Date(`${expiresOn}T00:00:00Z`).toISOString().slice(0,10) !== expiresOn)) return bad('Expiration date must be a valid YYYY-MM-DD date.');

  if (vendorId) {
    const v = await env.DB.prepare("SELECT id FROM staff WHERE id=? AND role='vendor'").bind(vendorId).first();
    if (!v) return bad('Vendor not found.', 404);
  }

  let saved, before = null;
  if (itemId) {
    const item = await env.DB.prepare('SELECT * FROM inventory_items WHERE id=?').bind(itemId).first();
    if (!item) return bad('Item not found.', 404);
    before = item;
    if (b.expected_revision != null && Number(b.expected_revision) !== Number(item.revision || 0)) return bad('Inventory item changed. Refresh before saving.', 409);
    saved = {
      ...item,
      name,
      unit: unit != null ? unit : item.unit,
      on_hand: onHand != null ? onHand : item.on_hand,
      par_level: parLevel != null ? parLevel : item.par_level,
      vendor_id: vendorId || item.vendor_id,
      unit_cost_cents: unitCostCents != null ? unitCostCents : item.unit_cost_cents,
      count_quantity: countQuantity !== undefined ? countQuantity : item.count_quantity,
      total_weight_grams: totalWeight !== undefined ? totalWeight : item.total_weight_grams,
      expires_on: expiresOn !== undefined ? (expiresOn || null) : item.expires_on,
      counted_at: (onHand != null || countQuantity !== undefined || totalWeight !== undefined) ? t : item.counted_at,
      revision: Number(item.revision || 0) + 1,
      last_change_id: null,
    };
    const change = changeInsert({ itemId, action, actorId: by, before, after: { ...saved, updated_by: by, updated_at: t }, at: t });
    const committed = await commitChange(env, { sql: 'UPDATE inventory_items SET name=?, unit=?, on_hand=?, par_level=?, vendor_id=?, unit_cost_cents=?, count_quantity=?, total_weight_grams=?, expires_on=?, counted_at=?, updated_by=?, updated_at=?, revision=revision+1,last_change_id=? WHERE id=? AND revision=?', args: [saved.name, saved.unit, saved.on_hand, saved.par_level, saved.vendor_id, saved.unit_cost_cents ?? null, saved.count_quantity ?? null, saved.total_weight_grams ?? null, saved.expires_on ?? null, saved.counted_at ?? null, by, t, change.changeId, itemId, Number(item.revision || 0)] }, change);
    if (!committed.ok) return bad('Inventory item was not saved.', 409);
    saved._change = change;
  } else {
    saved = {
      id: id('inv'),
      name,
      unit,
      on_hand: onHand != null ? onHand : 0,
      par_level: parLevel != null ? parLevel : 0,
      vendor_id: vendorId,
      unit_cost_cents: unitCostCents,
      count_quantity: countQuantity === undefined ? null : countQuantity,
      total_weight_grams: totalWeight === undefined ? null : totalWeight,
      expires_on: expiresOn || null,
      counted_at: (onHand != null || countQuantity !== undefined || totalWeight !== undefined) ? t : null,
      revision: 0,
      last_change_id: null,
    };
    const change = changeInsert({ itemId: saved.id, action, actorId: by, before: null, after: { ...saved, active: 1, updated_by: by, created_at: t, updated_at: t }, at: t });
    const committed = await commitChange(env, { sql: 'INSERT INTO inventory_items (id,name,unit,on_hand,par_level,vendor_id,unit_cost_cents,count_quantity,total_weight_grams,expires_on,counted_at,active,revision,last_change_id,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,1,0,?,?,?,?)', args: [saved.id,saved.name,saved.unit,saved.on_hand,saved.par_level,saved.vendor_id,saved.unit_cost_cents,saved.count_quantity,saved.total_weight_grams,saved.expires_on,saved.counted_at,change.changeId,by,t,t] }, change);
    if (!committed.ok) return bad('Inventory item was not created.', 409);
    saved._change = change;
  }

  await capture(env, {
    event: 'inventory.updated',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { item_id: saved.id, action: itemId ? 'edit' : 'create', par_level: saved.par_level },
  });

  await checkLowStock(env, saved);
  const change = saved._change;
  delete saved._change;
  const push_status = await notifyInventory(env, change.changeId);
  return json({
    ok: true,
    change_id: change.changeId,
    push_status,
    id: saved.id,
    item: saved,
    below_par: Number(saved.par_level) > 0 && Number(saved.on_hand) < Number(saved.par_level),
  });
};
