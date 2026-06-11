// POST /api/hub/kitchen/restock/submit — submit a draft PO to a vendor.
// Body: { id }. Transitions draft → submitted, stamps submitted_at, and fires
// restock_order.submitted. Vendor hand-off (all best-effort, sandbox-safe):
//   1) find-or-create the PO thread (audience 'vendor', linked via ref_type/ref_id —
//      columns from migrations/0006_comms_vendor.sql) and post an in_app summary
//      message (fires message.sent {channel:'in_app', audience:'vendor'});
//   2) SMS-ping the vendor (no-op without Twilio creds; sms_log row status='noop').
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { sendSms, isTwilioConfigured } from '../../../../_lib/twilio.js';
import { id, now } from '../../../../_lib/hub.js';

const shortPo = (poId) => String(poId || '').replace(/^po_/, '').slice(0, 6).toUpperCase();

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const poId = (b && b.id || '').toString().trim();
  if (!poId) return bad('Missing restock order id.');

  const po = await env.DB.prepare('SELECT * FROM restock_orders WHERE id = ?').bind(poId).first();
  if (!po) return bad('Restock order not found.', 404);
  if (po.status !== 'draft') return bad(`Cannot submit a PO in status '${po.status}'.`, 409);

  const ts = now();
  await env.DB.prepare(
    "UPDATE restock_orders SET status = 'submitted', submitted_at = ?, updated_at = ? WHERE id = ?"
  ).bind(ts, ts, poId).run();

  // Vendor hand-off: PO thread + in-app summary + SMS ping. Best-effort throughout.
  let sms = { sent: false };
  if (po.vendor_id) {
    const vendor = await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(po.vendor_id).first();
    const nItems = po.line_item_count || 0;
    let threadId = null;

    try {
      // Find-or-create the PO thread (one thread per restock order).
      const existing = await env.DB
        .prepare("SELECT id FROM threads WHERE ref_type = 'restock_order' AND ref_id = ? LIMIT 1")
        .bind(poId)
        .first();
      if (existing && existing.id) {
        threadId = existing.id;
      } else {
        threadId = id('th');
        await env.DB.prepare(
          "INSERT INTO threads (id, audience, subject, created_by, staff_id, ref_type, ref_id, last_message_at, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,'open',?,?)"
        ).bind(threadId, 'vendor', 'PO ' + shortPo(poId), ctx.distinct_id || null, po.vendor_id, 'restock_order', poId, ts, ts, ts).run();
        await capture(env, {
          event: 'thread.created',
          distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
          properties: { audience: 'vendor', ref_type: 'restock_order', ref_id: poId, thread_id: threadId },
        });
      }

      // One in_app message summarizing the PO (the SMS below is just a ping).
      const total = po.total_cents != null ? ` · $${(po.total_cents / 100).toFixed(2)}` : '';
      const summary = `Purchase order ${shortPo(poId)}: ${nItems} item${nItems === 1 ? '' : 's'}${total}. Please acknowledge in the HUB.`;
      await env.DB.prepare(
        'INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, created_at) VALUES (?,?,?,?,?,?,?,0,?)'
      ).bind(id('msg'), threadId, 'outbound', 'in_app', ctx.distinct_id || null, ctx.role, summary, ts).run();
      await env.DB.prepare('UPDATE threads SET last_message_at = ?, updated_at = ? WHERE id = ?').bind(ts, ts, threadId).run();

      await capture(env, {
        event: 'message.sent',
        distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
        properties: { channel: 'in_app', audience: 'vendor', ai_drafted: false, thread_id: threadId },
      });
    } catch {
      // threads.ref_type/ref_id may predate migration 0006 — never block the submit.
      threadId = null;
    }

    // SMS ping (sandbox no-op without Twilio creds — logs to sms_log as 'noop').
    if (vendor && vendor.phone) {
      sms = await sendSms(env, {
        to: vendor.phone,
        body: `Añejo: new purchase order — ${nItems} items. Open the HUB to acknowledge.`,
        thread_id: threadId,
      });
    }
  }

  await capture(env, {
    event: 'restock_order.submitted',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: {
      restock_order_id: poId,
      vendor_id: po.vendor_id || null,
      line_item_count: po.line_item_count || 0,
      total_cents: po.total_cents || null,
      ai_suggested: !!po.ai_suggested,
    },
  });

  const updated = await env.DB.prepare('SELECT * FROM restock_orders WHERE id = ?').bind(poId).first();
  return json({ ok: true, restock_order: updated, sms_sent: !!sms.sent, twilio_configured: isTwilioConfigured(env) });
};
