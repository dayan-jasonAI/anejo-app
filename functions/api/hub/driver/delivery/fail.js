// POST /api/hub/driver/delivery/fail — mark a delivery as not completed.
// Body: { order_id, route_id?, stop_id?, reason, note?, geo? }
//   reason ∈ no_answer|wrong_address|refused|damaged|other
// Records the deliveries row as failed and flips the matching route_stop to 'failed'.
// Fires delivery.failed.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { raiseAlert } from '../../../../_lib/alerts.js';
import { id, now, toJson } from '../../../../_lib/hub.js';

const REASONS = ['no_answer', 'wrong_address', 'refused', 'damaged', 'other'];

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const orderId = (b && b.order_id || '').toString().trim();
  if (!orderId) return bad('Missing order_id.');
  const reason = REASONS.includes(b && b.reason) ? b.reason : null;
  if (!reason) return bad('reason must be one of: ' + REASONS.join(', '));

  const ts = now();
  const geo = b && typeof b.geo === 'object' ? b.geo : null;
  const routeId = (b && b.route_id) || null;
  const note = b.note ? String(b.note).slice(0, 2000) : null;

  const existing = await env.DB
    .prepare("SELECT * FROM deliveries WHERE order_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1")
    .bind(orderId)
    .first();

  let deliveryId;
  if (existing) {
    deliveryId = existing.id;
    await env.DB
      .prepare("UPDATE deliveries SET driver_id=?, route_id=?, status='failed', fail_reason=?, geo=?, updated_at=? WHERE id=?")
      .bind(staff.id, routeId || existing.route_id, reason, toJson(geo), ts, deliveryId)
      .run();
  } else {
    deliveryId = id('del');
    await env.DB
      .prepare('INSERT INTO deliveries (id, order_id, route_id, driver_id, status, fail_reason, geo, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(deliveryId, orderId, routeId, staff.id, 'failed', reason, toJson(geo), ts, ts)
      .run();
  }

  if (b.stop_id) {
    await env.DB.prepare("UPDATE route_stops SET status='failed', updated_at=? WHERE id=?").bind(ts, b.stop_id).run();
  } else if (routeId) {
    await env.DB.prepare("UPDATE route_stops SET status='failed', updated_at=? WHERE route_id=? AND order_id=?").bind(ts, routeId, orderId).run();
  }

  await capture(env, {
    event: 'delivery.failed',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { order_id: orderId, reason, note: note || undefined, platform: 'pwa' },
  });

  // Owner alert: a failed delivery needs eyes.
  await raiseAlert(env, {
    alert_type: 'delivery_failed',
    severity: 'warning',
    title: 'Delivery failed',
    body: `${staff.name || 'Driver'} · order ${orderId} · ${reason}`,
    team: ctx.team || 'delivery',
    ref_type: 'delivery', ref_id: deliveryId,
    source: 'surface',
    dedupe_key: `delivery_failed:${deliveryId}`,
  });

  return json({ ok: true, delivery: { id: deliveryId, order_id: orderId, status: 'failed', reason } });
};
