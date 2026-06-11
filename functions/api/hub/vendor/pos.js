// /api/hub/vendor/pos — vendor purchase-order portal.
//   GET  → vendor: own POs (submitted|acknowledged|delivered, newest first) with items[]
//          and requester name; owner: all non-draft POs.
//   POST { id, action:'acknowledge'|'confirm_delivery', received_complete?:bool }
//        acknowledge       submitted → acknowledged; fires vendor.po_acknowledged and posts
//                          an in-app note into the PO thread if one exists.
//        confirm_delivery  → delivered; fires vendor.delivery_confirmed; an incomplete
//                          delivery raises a 'low_stock' alert for the kitchen.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { raiseAlert } from '../../../_lib/alerts.js';
import { id, now, bit } from '../../../_lib/hub.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['vendor', 'owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  const binds = [];
  let where;
  if (ctx.role === 'vendor') {
    if (!ctx.distinct_id) return json({ ok: true, items: [], count: 0 });
    where = "ro.vendor_id = ? AND ro.status IN ('submitted','acknowledged','delivered')";
    binds.push(ctx.distinct_id);
  } else {
    where = "ro.status != 'draft'";
  }

  let pos = [];
  try {
    const res = await env.DB
      .prepare(
        `SELECT ro.*, s.name AS created_by_name, v.name AS vendor_name
           FROM restock_orders ro
           LEFT JOIN staff s ON s.id = ro.created_by
           LEFT JOIN staff v ON v.id = ro.vendor_id
          WHERE ${where}
          ORDER BY ro.created_at DESC
          LIMIT 100`
      )
      .bind(...binds)
      .all();
    pos = (res && res.results) || [];
  } catch {
    pos = [];
  }

  if (pos.length) {
    const ids = pos.map((p) => p.id);
    const marks = ids.map(() => '?').join(',');
    try {
      const ir = await env.DB
        .prepare(
          `SELECT id, restock_order_id, name, qty, unit, unit_cost_cents, received_qty
             FROM restock_items WHERE restock_order_id IN (${marks}) ORDER BY created_at`
        )
        .bind(...ids)
        .all();
      const byPo = {};
      for (const it of (ir && ir.results) || []) {
        (byPo[it.restock_order_id] = byPo[it.restock_order_id] || []).push(it);
      }
      for (const p of pos) p.items = byPo[p.id] || [];
    } catch {
      for (const p of pos) p.items = [];
    }
  }

  return json({ ok: true, items: pos, count: pos.length });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['vendor', 'owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return json({ error: 'Database not configured.' }, 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const poId = (b && b.id || '').toString().trim();
  const action = (b && b.action || '').toString();
  if (!poId) return bad('Missing restock order id.');
  if (action !== 'acknowledge' && action !== 'confirm_delivery') return bad('Unsupported action.');

  const po = await env.DB.prepare('SELECT * FROM restock_orders WHERE id = ?').bind(poId).first();
  if (!po) return json({ error: 'Purchase order not found.' }, 404);
  if (ctx.role === 'vendor' && po.vendor_id !== ctx.distinct_id) {
    return json({ error: 'Forbidden for this role.' }, 403);
  }

  const ts = now();

  if (action === 'acknowledge') {
    if (po.status !== 'submitted') {
      return bad(`Cannot acknowledge a PO in status '${po.status}'.`, 409);
    }
    await env.DB
      .prepare("UPDATE restock_orders SET status = 'acknowledged', acknowledged_at = ?, updated_at = ? WHERE id = ?")
      .bind(ts, ts, poId)
      .run();

    await capture(env, {
      event: 'vendor.po_acknowledged',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { restock_order_id: poId },
    });

    // Best-effort: note the acknowledgement in the PO thread if one exists.
    // (threads.ref_type/ref_id columns arrive with migrations/0006_comms_vendor.sql.)
    try {
      const th = await env.DB
        .prepare("SELECT id FROM threads WHERE ref_type = 'restock_order' AND ref_id = ? LIMIT 1")
        .bind(poId)
        .first();
      if (th && th.id) {
        const direction = ctx.role === 'vendor' ? 'inbound' : 'outbound';
        await env.DB
          .prepare('INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, created_at) VALUES (?,?,?,?,?,?,?,0,?)')
          .bind(id('msg'), th.id, direction, 'in_app', ctx.distinct_id || null, ctx.role, 'PO acknowledged', ts)
          .run();
        await env.DB.prepare('UPDATE threads SET last_message_at = ?, updated_at = ? WHERE id = ?').bind(ts, ts, th.id).run();
        if (direction === 'inbound') {
          await capture(env, {
            event: 'message.received',
            distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
            properties: { channel: 'in_app', thread_id: th.id },
          });
        }
      }
    } catch { /* never block the ack on thread bookkeeping */ }
  } else {
    if (po.status !== 'submitted' && po.status !== 'acknowledged') {
      return bad(`Cannot confirm delivery for a PO in status '${po.status}'.`, 409);
    }
    const receivedComplete = b.received_complete === undefined ? true : !!b.received_complete;
    await env.DB
      .prepare("UPDATE restock_orders SET status = 'delivered', delivered_at = ?, received_complete = ?, updated_at = ? WHERE id = ?")
      .bind(ts, bit(receivedComplete), ts, poId)
      .run();

    await capture(env, {
      event: 'vendor.delivery_confirmed',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { restock_order_id: poId, received_complete: receivedComplete },
    });

    if (!receivedComplete) {
      await raiseAlert(env, {
        alert_type: 'low_stock',
        severity: 'warning',
        title: 'PO delivered incomplete',
        body: `Purchase order ${poId} was delivered but marked incomplete by the vendor.`,
        team: 'kitchen',
        ref_type: 'restock_order',
        ref_id: poId,
        source: 'surface',
        dedupe_key: 'po_incomplete:' + poId,
      });
    }
  }

  const updated = await env.DB.prepare('SELECT * FROM restock_orders WHERE id = ?').bind(poId).first();
  return json({ ok: true, restock_order: updated });
};
