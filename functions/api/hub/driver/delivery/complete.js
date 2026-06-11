// POST /api/hub/driver/delivery/complete — mark a delivery dropped off.
// Body: { order_id, route_id?, stop_id?, proof_photo?, signature?, on_time?, geo? }
// Upserts a deliveries row, advances the matching route_stop to 'done', bumps the
// order to 'fulfilled'. Photos are stored as a ref string (base64/data/url) — R2 is
// a follow-up; we do not block on binary storage.
// Fires delivery.completed.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, toJson } from '../../../../_lib/hub.js';
import { notifyOrderDelivery } from '../../../../_lib/notify.js';

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

  const ts = now();
  const proofPhoto = b.proof_photo ? String(b.proof_photo).slice(0, 200000) : null;
  const signature = b.signature ? String(b.signature).slice(0, 200000) : null;
  const onTime = b.on_time === undefined ? null : (b.on_time ? 1 : 0);
  const geo = b && typeof b.geo === 'object' ? b.geo : null;
  const routeId = (b && b.route_id) || null;

  // Reuse an existing pending delivery row for this order if present.
  const existing = await env.DB
    .prepare("SELECT * FROM deliveries WHERE order_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1")
    .bind(orderId)
    .first();

  let deliveryId;
  if (existing) {
    deliveryId = existing.id;
    await env.DB
      .prepare("UPDATE deliveries SET driver_id=?, route_id=?, status='completed', proof_photo=?, signature=?, on_time=?, geo=?, completed_at=?, updated_at=? WHERE id=?")
      .bind(staff.id, routeId || existing.route_id, proofPhoto, signature, onTime, toJson(geo), ts, ts, deliveryId)
      .run();
  } else {
    deliveryId = id('del');
    await env.DB
      .prepare('INSERT INTO deliveries (id, order_id, route_id, driver_id, status, proof_photo, signature, on_time, geo, completed_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(deliveryId, orderId, routeId, staff.id, 'completed', proofPhoto, signature, onTime, toJson(geo), ts, ts, ts)
      .run();
  }

  // Advance the route stop (by stop_id if given, else by order on the route).
  if (b.stop_id) {
    await env.DB.prepare("UPDATE route_stops SET status='done', updated_at=? WHERE id=?").bind(ts, b.stop_id).run();
  } else if (routeId) {
    await env.DB.prepare("UPDATE route_stops SET status='done', updated_at=? WHERE route_id=? AND order_id=?").bind(ts, routeId, orderId).run();
  }

  // Best-effort: mark the order fulfilled.
  await env.DB.prepare("UPDATE orders SET status='fulfilled', updated_at=? WHERE id=?").bind(ts, orderId).run().catch(() => {});

  // Text the customer that their order was delivered (consent-gated, no-op safe).
  const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first().catch(() => null);
  if (order) await notifyOrderDelivery(env, order, 'delivered');

  await capture(env, {
    event: 'delivery.completed',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: {
      order_id: orderId,
      has_proof_photo: !!proofPhoto,
      has_signature: !!signature,
      on_time: onTime === null ? undefined : !!onTime,
      platform: 'pwa',
    },
  });

  return json({ ok: true, delivery: { id: deliveryId, order_id: orderId, status: 'completed' } });
};
