// /api/hub/kitchen/inventory — kitchen inventory with par levels.
//   GET  → active items (name, unit, on_hand, par_level, vendor name, below_par),
//          below-par first then name. ?all=1 also includes archived items.
//          Also returns active vendors (staff role='vendor') for the vendor select.
//   POST { action:'upsert', id?, name, unit?, on_hand?, par_level?, vendor_id? }
//        { action:'count', id, on_hand }                — quick stock count
//        { action:'archive'|'restore', id }             — soft flag, never delete
// After any count/upsert, raises a deduped low_stock alert when on_hand < par_level.
// Kitchen + owner. Fires inventory.counted / inventory.updated.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { id, now } from '../../../_lib/hub.js';
import { capture } from '../../../_lib/track.js';
import { raiseAlert } from '../../../_lib/alerts.js';

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

  let items = [];
  try {
    const res = await env.DB
      .prepare(
        'SELECT i.id, i.name, i.unit, i.on_hand, i.par_level, i.vendor_id, i.active, i.updated_at, ' +
        'v.name AS vendor_name, ' +
        '(CASE WHEN i.par_level > 0 AND i.on_hand < i.par_level THEN 1 ELSE 0 END) AS below_par ' +
        'FROM inventory_items i LEFT JOIN staff v ON v.id = i.vendor_id ' +
        (includeAll ? '' : 'WHERE i.active=1 ') +
        'ORDER BY below_par DESC, i.active DESC, i.name'
      )
      .all();
    items = ((res && res.results) || []).map((r) => ({ ...r, below_par: !!r.below_par, active: !!r.active }));
  } catch { items = []; }

  let vendors = [];
  try {
    const res = await env.DB
      .prepare("SELECT id, name FROM staff WHERE role='vendor' AND active=1 ORDER BY name")
      .all();
    vendors = (res && res.results) || [];
  } catch { vendors = []; }

  return json({ ok: true, items, vendors, below_par_count: items.filter((i) => i.below_par && i.active).length });
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

  // ---- quick stock count ----
  if (action === 'count') {
    const itemId = (b && b.id || '').toString().trim();
    const onHand = Number(b && b.on_hand);
    if (!itemId) return bad('Missing item id.');
    if (!Number.isFinite(onHand) || onHand < 0) return bad('On-hand must be a number ≥ 0.');

    const item = await env.DB.prepare('SELECT * FROM inventory_items WHERE id=?').bind(itemId).first();
    if (!item) return bad('Item not found.', 404);

    await env.DB
      .prepare('UPDATE inventory_items SET on_hand=?, updated_by=?, updated_at=? WHERE id=?')
      .bind(onHand, by, t, itemId)
      .run();

    await capture(env, {
      event: 'inventory.counted',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { item_id: itemId, on_hand: onHand, par_level: item.par_level },
    });

    await checkLowStock(env, { ...item, on_hand: onHand });
    return json({ ok: true, id: itemId, on_hand: onHand, below_par: Number(item.par_level) > 0 && onHand < Number(item.par_level) });
  }

  // ---- archive / restore (soft flag — never delete) ----
  if (action === 'archive' || action === 'restore') {
    const itemId = (b && b.id || '').toString().trim();
    if (!itemId) return bad('Missing item id.');
    const item = await env.DB.prepare('SELECT id FROM inventory_items WHERE id=?').bind(itemId).first();
    if (!item) return bad('Item not found.', 404);

    await env.DB
      .prepare('UPDATE inventory_items SET active=?, updated_by=?, updated_at=? WHERE id=?')
      .bind(action === 'archive' ? 0 : 1, by, t, itemId)
      .run();

    await capture(env, {
      event: 'inventory.updated',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { item_id: itemId, action },
    });
    return json({ ok: true, id: itemId, active: action !== 'archive' });
  }

  // ---- upsert (create or edit) ----
  if (action !== 'upsert') return bad('Unknown action.');

  const itemId = (b && b.id || '').toString().trim() || null;
  const name = (b && b.name || '').toString().trim().slice(0, 80);
  const unit = (b && b.unit || '').toString().trim().slice(0, 16) || null;
  const onHand = b && b.on_hand != null && b.on_hand !== '' ? Number(b.on_hand) : null;
  const parLevel = b && b.par_level != null && b.par_level !== '' ? Number(b.par_level) : null;
  const vendorId = (b && b.vendor_id || '').toString().trim() || null;
  if (!name) return bad('Item name is required.');
  if (onHand != null && (!Number.isFinite(onHand) || onHand < 0)) return bad('On-hand must be a number ≥ 0.');
  if (parLevel != null && (!Number.isFinite(parLevel) || parLevel < 0)) return bad('Par level must be a number ≥ 0.');

  if (vendorId) {
    const v = await env.DB.prepare("SELECT id FROM staff WHERE id=? AND role='vendor'").bind(vendorId).first();
    if (!v) return bad('Vendor not found.', 404);
  }

  let saved;
  if (itemId) {
    const item = await env.DB.prepare('SELECT * FROM inventory_items WHERE id=?').bind(itemId).first();
    if (!item) return bad('Item not found.', 404);
    saved = {
      ...item,
      name,
      unit: unit != null ? unit : item.unit,
      on_hand: onHand != null ? onHand : item.on_hand,
      par_level: parLevel != null ? parLevel : item.par_level,
      vendor_id: vendorId || item.vendor_id,
    };
    await env.DB
      .prepare('UPDATE inventory_items SET name=?, unit=?, on_hand=?, par_level=?, vendor_id=?, updated_by=?, updated_at=? WHERE id=?')
      .bind(saved.name, saved.unit, saved.on_hand, saved.par_level, saved.vendor_id, by, t, itemId)
      .run();
  } else {
    saved = {
      id: id('inv'),
      name,
      unit,
      on_hand: onHand != null ? onHand : 0,
      par_level: parLevel != null ? parLevel : 0,
      vendor_id: vendorId,
    };
    await env.DB
      .prepare('INSERT INTO inventory_items (id, name, unit, on_hand, par_level, vendor_id, active, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?,?)')
      .bind(saved.id, saved.name, saved.unit, saved.on_hand, saved.par_level, saved.vendor_id, by, t, t)
      .run();
  }

  await capture(env, {
    event: 'inventory.updated',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { item_id: saved.id, action: itemId ? 'edit' : 'create', par_level: saved.par_level },
  });

  await checkLowStock(env, saved);
  return json({
    ok: true,
    id: saved.id,
    item: saved,
    below_par: Number(saved.par_level) > 0 && Number(saved.on_hand) < Number(saved.par_level),
  });
};
