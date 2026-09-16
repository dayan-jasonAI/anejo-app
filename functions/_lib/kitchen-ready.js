// The status and owner inbox receipt are one D1 transaction. A retry cannot produce
// a second receipt or push, and a failed receipt insert cannot silently mark food ready.
//
// The photo gate lives in the same UPDATE (Dayan, 2026-09-15): no current "inside" photo and
// "packed" photo, no ready. Putting it here rather than only in the endpoint means any future
// caller of markKitchenReady is gated too. See kitchen-photos.js.
import { sendPushTickle } from './push.js';

export async function markKitchenReady(env, order, timestamp) {
  const alertId = `alert_ready_${order.id}`;
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET status='ready', updated_at=? WHERE id=?
      AND status IN ('paid','prep') AND NOT EXISTS
      (SELECT 1 FROM order_bowls WHERE order_id=? AND COALESCE(prep_state,'pending') <> 'done')
      AND EXISTS (SELECT 1 FROM kitchen_photos WHERE order_id=? AND kind='contents' AND superseded_at IS NULL)
      AND EXISTS (SELECT 1 FROM kitchen_photos WHERE order_id=? AND kind='packed' AND superseded_at IS NULL)`)
      .bind(timestamp, order.id, order.id, order.id, order.id),
    // ON CONFLICT, not a plain INSERT: the alert id is derived from the order id, so the SECOND
    // time an order is marked ready the insert collided with its own earlier row and D1 threw —
    // taking the whole batch, and the transition, with it. The cook saw "could not save the status
    // and the alert" and could not hand the order off at all.
    //
    // An order reaches here twice on a perfectly normal day: an office raises its lunch count after
    // the kitchen called it ready, contract.js sends it back to prep for the extra lunches, and the
    // cook builds them and marks it ready again. That is what happened to DGP Pompano on
    // 2026-09-16 (ready 9:38, count 22 → 23 at 10:11, then every retry failed).
    //
    // Re-marking ready re-opens the same alert rather than stacking a second one: the owner needs
    // to know the order is ready NOW, even if they already acknowledged the earlier notice.
    env.DB.prepare(`INSERT INTO alerts
      (id,alert_type,severity,title,body,team,ref_type,ref_id,source,dedupe_key,status,created_at,updated_at)
      SELECT ?, 'kitchen_ready_delivery', 'warning', ?, ?, 'kitchen', 'order', ?,
        'kitchen', ?, 'open', ?, ? WHERE changes()=1
      ON CONFLICT(id) DO UPDATE SET
        status='open', title=excluded.title, body=excluded.body, updated_at=excluded.updated_at,
        acknowledged_by=NULL, acknowledged_at=NULL`)
      .bind(alertId,
        'Kitchen update — order ready for delivery / Cocina — pedido listo para entrega',
        `Order / Pedido ${order.id}. Review dispatch and assign an available driver if needed. / Revisa las rutas y asigna un conductor disponible si hace falta.`,
        order.id, `kitchen_ready:${order.id}`, timestamp, timestamp),
  ]);
  const changed = results[0]?.meta?.changes === 1;
  if (!changed) return { changed: false };
  // External delivery is separate from the durable Hub receipt. Device/provider failures
  // never erase readiness or the owner's inbox; never log endpoint URLs or customer data.
  const url = '/hub/owner/deliveries.html?order=' + encodeURIComponent(order.id) +
    (order.delivery_date ? '&date=' + encodeURIComponent(order.delivery_date) : '') + '#assign';
  let push;
  try {
    push = await sendPushTickle(env, { roles: ['owner'], notification: {
      type: 'kitchen_ready_delivery', id: alertId, refId: order.id, url,
    } });
  } catch { push = { sent: 0, failed: 1 }; }
  if (push?.failed) console.warn('kitchen_ready_push_failed', { order_id: order.id, failed: push.failed });
  return { changed: true, alert_id: alertId, push };
}
