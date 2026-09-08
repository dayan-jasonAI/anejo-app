// The status and owner inbox receipt are one D1 transaction. A retry cannot produce
// a second receipt or push, and a failed receipt insert cannot silently mark food ready.
import { sendPushTickle } from './push.js';

export async function markKitchenReady(env, order, timestamp) {
  const alertId = `alert_ready_${order.id}`;
  const results = await env.DB.batch([
    env.DB.prepare(`UPDATE orders SET status='ready', updated_at=? WHERE id=?
      AND status IN ('paid','prep') AND NOT EXISTS
      (SELECT 1 FROM order_bowls WHERE order_id=? AND COALESCE(prep_state,'pending') <> 'done')`)
      .bind(timestamp, order.id, order.id),
    env.DB.prepare(`INSERT INTO alerts
      (id,alert_type,severity,title,body,team,ref_type,ref_id,source,dedupe_key,status,created_at,updated_at)
      SELECT ?, 'kitchen_ready_delivery', 'warning', ?, ?, 'kitchen', 'order', ?,
        'kitchen', ?, 'open', ?, ? WHERE changes()=1`)
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
