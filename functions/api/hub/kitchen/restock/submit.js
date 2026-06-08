// POST /api/hub/kitchen/restock/submit — submit a draft PO to a vendor.
// Body: { id }. Transitions draft → submitted, stamps submitted_at, optionally SMS the
// vendor (sandbox no-op without Twilio creds), and fires restock_order.submitted.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { sendSms, isTwilioConfigured } from '../../../../_lib/twilio.js';
import { now } from '../../../../_lib/hub.js';

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

  // Best-effort vendor notification (no-ops in sandbox without Twilio creds).
  let sms = { sent: false };
  if (po.vendor_id) {
    const vendor = await env.DB.prepare('SELECT * FROM staff WHERE id = ?').bind(po.vendor_id).first();
    if (vendor && vendor.phone) {
      sms = await sendSms(env, {
        to: vendor.phone,
        body: `Añejo Catering: new restock order ${poId} (${po.line_item_count} items) submitted. Reply to acknowledge.`,
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
