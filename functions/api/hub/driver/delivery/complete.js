// POST /api/hub/driver/delivery/complete — mark a delivery dropped off.
// Body: { order_id, route_id?, stop_id?, proof_photo?, signature?, on_time?, geo? }
// Upserts a deliveries row, advances the matching route_stop to 'done', bumps the
// order to 'fulfilled'. Proof/signature photos are stored to R2 via putMedia when the
// MEDIA binding is present (inline ref fallback otherwise); storage never blocks the drop-off.
// Fires delivery.completed.
import { json, bad, appBaseUrl } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, toJson } from '../../../../_lib/hub.js';
import { notifyDelivered } from '../../../../_lib/notify.js';
import { putMedia } from '../../../../_lib/media.js';

export const onRequestPost = async ({ request, env, waitUntil }) => {
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
  // Store proof media in R2 when the binding exists (short /api/hub/media/ URL in the row);
  // otherwise keep the existing inline ref behavior (capped string). putMedia never throws.
  let proofPhoto = b.proof_photo ? String(b.proof_photo) : null;
  let signature = b.signature ? String(b.signature) : null;
  let proofStored = false;
  let signatureStored = false;
  if (proofPhoto && proofPhoto.startsWith('data:')) {
    const put = await putMedia(env, { kind: 'proof', dataUrl: proofPhoto });
    if (put.stored) { proofPhoto = put.url; proofStored = true; }
  }
  if (signature && signature.startsWith('data:')) {
    const put = await putMedia(env, { kind: 'proof', dataUrl: signature });
    if (put.stored) { signature = put.url; signatureStored = true; }
  }
  if (proofPhoto) proofPhoto = proofPhoto.slice(0, 200000);
  if (signature) signature = signature.slice(0, 200000);
  const onTime = b.on_time === undefined ? null : (b.on_time ? 1 : 0);
  const geo = b && typeof b.geo === 'object' ? b.geo : null;
  const routeId = (b && b.route_id) || null;

  // Per-delivery public token → drives the proof-photo URL (MMS media) and the feedback page.
  const token = id('pod');
  const base = appBaseUrl(env, request);
  const photoUrl = proofStored ? `${base}/api/proof/${token}` : null;   // only when actually in R2
  const feedbackUrl = `${base}/feedback?t=${token}`;

  // Reuse an existing pending delivery row for this order if present.
  const existing = await env.DB
    .prepare("SELECT * FROM deliveries WHERE order_id=? AND status='pending' ORDER BY created_at DESC LIMIT 1")
    .bind(orderId)
    .first();

  let deliveryId;
  if (existing) {
    deliveryId = existing.id;
    await env.DB
      .prepare("UPDATE deliveries SET driver_id=?, route_id=?, status='completed', proof_photo=?, proof_skipped=?, public_token=?, signature=?, on_time=?, geo=?, completed_at=?, updated_at=? WHERE id=?")
      .bind(staff.id, routeId || existing.route_id, proofPhoto, proofPhoto ? 0 : 1, token, signature, onTime, toJson(geo), ts, ts, deliveryId)
      .run();
  } else {
    deliveryId = id('del');
    await env.DB
      .prepare('INSERT INTO deliveries (id, order_id, route_id, driver_id, status, proof_photo, proof_skipped, public_token, signature, on_time, geo, completed_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .bind(deliveryId, orderId, routeId, staff.id, 'completed', proofPhoto, proofPhoto ? 0 : 1, token, signature, onTime, toJson(geo), ts, ts, ts)
      .run();
  }

  // Advance the route stop (by stop_id if given, else by order on the route) + stamp delivered_at.
  let stopSeq = null;
  if (b.stop_id) {
    await env.DB.prepare("UPDATE route_stops SET status='done', delivered_at=?, updated_at=? WHERE id=?").bind(ts, ts, b.stop_id).run();
    const r = await env.DB.prepare('SELECT seq FROM route_stops WHERE id=?').bind(b.stop_id).first().catch(() => null);
    stopSeq = r && r.seq;
  } else if (routeId) {
    await env.DB.prepare("UPDATE route_stops SET status='done', delivered_at=?, updated_at=? WHERE route_id=? AND order_id=?").bind(ts, ts, routeId, orderId).run();
    const r = await env.DB.prepare('SELECT seq FROM route_stops WHERE route_id=? AND order_id=?').bind(routeId, orderId).first().catch(() => null);
    stopSeq = r && r.seq;
  }
  // Advance the route's active stop pointer so the driver app auto-loads the next stop.
  if (routeId && stopSeq != null) {
    await env.DB.prepare('UPDATE routes SET current_seq=?, stops_completed=COALESCE(stops_completed,0)+1, updated_at=? WHERE id=? AND COALESCE(current_seq,0) <= ?')
      .bind(stopSeq, ts, routeId, stopSeq).run().catch(() => {});
  }

  // Best-effort: mark the order fulfilled.
  await env.DB.prepare("UPDATE orders SET status='fulfilled', updated_at=? WHERE id=?").bind(ts, orderId).run().catch(() => {});

  // The route stop is already advanced in the DB above, so respond to the driver IMMEDIATELY
  // and run the slow third-party side effects (customer MMS/email + analytics) in the
  // background. Awaiting these before responding made the driver app "freeze" after a
  // delivery in production, where Twilio/Resend/PostHog make real network calls that can be
  // slow or fail (they no-op locally, which is why it only reproduced on prod). Each is
  // independently guarded so one failing never affects the other or the response.
  const sideEffects = (async () => {
    try {
      const order = await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first().catch(() => null);
      if (order) await notifyDelivered(env, order, { photoUrl, feedbackUrl });
    } catch { /* customer notice is best-effort */ }
    try {
      await capture(env, {
        event: 'delivery.completed',
        distinct_id: ctx.distinct_id,
        role: ctx.role,
        team: ctx.team,
        properties: {
          order_id: orderId,
          has_proof_photo: !!proofPhoto,
          has_signature: !!signature,
          media_stored: proofStored || signatureStored,
          on_time: onTime === null ? undefined : !!onTime,
          platform: 'pwa',
        },
      });
    } catch { /* analytics is best-effort */ }
  })();
  // Prefer waitUntil so the background work survives after we respond; fall back to awaiting.
  if (typeof waitUntil === 'function') waitUntil(sideEffects); else await sideEffects;

  return json({ ok: true, delivery: { id: deliveryId, order_id: orderId, status: 'completed' } });
};
