// /api/hub/owner/suggestions — human-in-the-loop review of AI automation suggestions.
//   GET  ?status=pending|accepted|dismissed|expired|all   → suggestions newest first (payload parsed)
//   POST { id, decision:'accepted'|'dismissed' }
//        dismissed → status flip + ai_suggestion.actioned {decision:'dismissed'}
//        accepted  → execute the side effect FIRST, then status flip + ai_suggestion.actioned:
//          route_optimize  → routes row (ai_optimized=1) + seq'd route_stops, route.assigned,
//                            SMS ping to the driver (safe no-op without Twilio creds).
//                            Orders that gained a route since the suggestion are skipped;
//                            if ALL are already routed → 409 and the suggestion expires.
//          restock_suggest → draft restock_orders (ai_suggested=1) + restock_items; the
//                            kitchen submits the PO from the existing restock page.
//          payroll_prep    → no side effect; accepting IS the review (rows echoed back).
// Owner-only. Stop labels carry customer name + window — never a street address.
import { json, bad, id, now } from '../../../_lib/util.js';
import { parseJson } from '../../../_lib/hub.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { sendSms } from '../../../_lib/twilio.js';

const STATUSES = ['pending', 'accepted', 'dismissed', 'expired'];

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  const status = (url.searchParams.get('status') || 'pending').toLowerCase();

  let items = [];
  try {
    const where = STATUSES.includes(status) ? 'WHERE g.status=?' : '';
    const stmt = env.DB.prepare(
      'SELECT g.id, g.suggestion_type, g.summary, g.payload, g.status, g.source_run_id, ' +
      'g.actioned_by, g.actioned_at, g.created_at, s.name AS actioned_by_name ' +
      `FROM suggestions g LEFT JOIN staff s ON s.id = g.actioned_by ${where} ` +
      'ORDER BY g.created_at DESC LIMIT 100'
    );
    const res = await (where ? stmt.bind(status) : stmt).all();
    items = ((res && res.results) || []).map((r) => ({ ...r, payload: parseJson(r.payload, null) }));
  } catch {
    items = []; // table may not be migrated yet — degrade to empty
  }
  return json({ ok: true, items, count: items.length });
};

// Accept a route_optimize suggestion → real routes/route_stops rows.
async function acceptRoute(env, ctx, sug, payload, t) {
  const driverId = (payload && payload.driver_id || '').toString();
  const routeDate = (payload && payload.route_date || '').toString();
  const orderIds = Array.isArray(payload && payload.order_ids) ? payload.order_ids.map(String).filter(Boolean) : [];
  if (!driverId || !orderIds.length) return { error: bad('This suggestion has no usable route payload.', 422) };

  const driver = await env.DB
    .prepare("SELECT id, name, phone, team FROM staff WHERE id=? AND role='driver' AND active=1")
    .bind(driverId)
    .first();
  if (!driver) return { error: bad('The proposed driver is no longer active.', 409) };

  // Skip orders that gained a route since the suggestion was made.
  const placeholders = orderIds.map(() => '?').join(',');
  const takenRes = await env.DB
    .prepare(`SELECT DISTINCT order_id FROM route_stops WHERE order_id IN (${placeholders})`)
    .bind(...orderIds)
    .all();
  const taken = new Set(((takenRes && takenRes.results) || []).map((r) => r.order_id));
  const remaining = orderIds.filter((oid) => !taken.has(oid));
  if (!remaining.length) {
    // Everything got routed by hand in the meantime — expire the suggestion.
    try {
      await env.DB.prepare("UPDATE suggestions SET status='expired', actioned_by=?, actioned_at=? WHERE id=?")
        .bind(ctx.distinct_id || null, t, sug.id).run();
    } catch { /* best-effort */ }
    return { error: bad('All proposed orders are already on a route.', 409) };
  }

  const remPh = remaining.map(() => '?').join(',');
  const ordRes = await env.DB
    .prepare(`SELECT id, customer_name, delivery_window FROM orders WHERE id IN (${remPh})`)
    .bind(...remaining)
    .all();
  const byId = new Map(((ordRes && ordRes.results) || []).map((o) => [o.id, o]));

  const routeId = id('route');
  await env.DB
    .prepare(
      'INSERT INTO routes (id, driver_id, route_date, stop_count, ai_optimized, status, created_at, updated_at) ' +
      "VALUES (?,?,?,?,1,'assigned',?,?)"
    )
    .bind(routeId, driverId, routeDate || null, remaining.length, t, t)
    .run();

  const stmt = env.DB.prepare(
    "INSERT INTO route_stops (id, route_id, order_id, seq, label, status, created_at, updated_at) VALUES (?,?,?,?,?,'pending',?,?)"
  );
  await env.DB.batch(remaining.map((oid, i) => {
    const o = byId.get(oid);
    const label = `${(o && o.customer_name) || 'Customer'} — ${(o && o.delivery_window) || 'delivery'}`;
    return stmt.bind(id('stop'), routeId, oid, i + 1, label, t, t);
  }));

  await capture(env, {
    event: 'route.assigned',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { route_id: routeId, driver_id: driverId, stop_count: remaining.length, ai_optimized: true },
  });

  // Ping the driver (safe no-op without TWILIO_* creds; still logged to sms_log).
  let sms = null;
  if (driver.phone) {
    sms = await sendSms(env, {
      to: driver.phone,
      body: `Añejo: new route — ${remaining.length} stops on ${routeDate}. Open the HUB.`,
    });
  }

  return {
    result: {
      route_id: routeId,
      driver_id: driverId,
      stop_count: remaining.length,
      skipped: orderIds.length - remaining.length,
      sms_sent: !!(sms && sms.sent),
      sms_noop: !!(sms && sms.noop),
    },
  };
}

// Accept a restock_suggest suggestion → draft PO + line items.
async function acceptRestock(env, ctx, sug, payload, t) {
  const items = Array.isArray(payload && payload.items) ? payload.items.filter((it) => it && it.name) : [];
  if (!items.length) return { error: bad('This suggestion has no usable restock items.', 422) };
  const vendorId = (payload && payload.vendor_id) || null;

  const poId = id('po');
  await env.DB
    .prepare(
      'INSERT INTO restock_orders (id, created_by, vendor_id, status, ai_suggested, line_item_count, note, created_at, updated_at) ' +
      "VALUES (?,?,?,'draft',1,?,?,?,?)"
    )
    .bind(poId, ctx.distinct_id || null, vendorId, items.length, `AI suggestion ${sug.id} — accepted by owner.`, t, t)
    .run();

  const stmt = env.DB.prepare('INSERT INTO restock_items (id, restock_order_id, name, qty, unit, created_at) VALUES (?,?,?,?,?,?)');
  await env.DB.batch(items.map((it) =>
    stmt.bind(id('ritem'), poId, String(it.name).slice(0, 80), Math.max(1, Number(it.qty) || 1), (it.unit || 'ea').toString().slice(0, 12), t)
  ));

  return { result: { restock_order_id: poId, line_item_count: items.length, vendor_id: vendorId, status: 'draft' } };
}

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const sugId = (b && b.id || '').toString().trim();
  const decision = (b && b.decision || '').toString();
  if (!sugId) return bad('Missing suggestion id.');
  if (decision !== 'accepted' && decision !== 'dismissed') return bad("Decision must be 'accepted' or 'dismissed'.");

  let sug = null;
  try {
    sug = await env.DB.prepare('SELECT * FROM suggestions WHERE id=?').bind(sugId).first();
  } catch { return bad('Suggestions table not available — run migration 0007_ai_ops.sql.', 500); }
  if (!sug) return json({ error: 'Suggestion not found.' }, 404);
  if (sug.status !== 'pending') return bad('This suggestion was already actioned.', 409);

  const t = now();
  const payload = parseJson(sug.payload, null);

  if (decision === 'dismissed') {
    await env.DB
      .prepare("UPDATE suggestions SET status='dismissed', actioned_by=?, actioned_at=? WHERE id=? AND status='pending'")
      .bind(ctx.distinct_id || null, t, sugId)
      .run();
    await capture(env, {
      event: 'ai_suggestion.actioned',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { suggestion_id: sugId, suggestion_type: sug.suggestion_type, decision: 'dismissed' },
    });
    return json({ ok: true, id: sugId, status: 'dismissed' });
  }

  // accepted → side effect first, then status flip + event.
  let outcome = { result: {} };
  if (sug.suggestion_type === 'route_optimize') {
    outcome = await acceptRoute(env, ctx, sug, payload, t);
  } else if (sug.suggestion_type === 'restock_suggest') {
    outcome = await acceptRestock(env, ctx, sug, payload, t);
  } else if (sug.suggestion_type === 'payroll_prep') {
    // Accepting IS the review — echo the rows so the UI can render/export them.
    outcome = { result: { period_start: payload && payload.period_start, period_end: payload && payload.period_end, rows: (payload && payload.rows) || [] } };
  } else {
    outcome = { result: { payload } }; // forward-compatible: accept with no side effect
  }
  if (outcome.error) return outcome.error;

  await env.DB
    .prepare("UPDATE suggestions SET status='accepted', actioned_by=?, actioned_at=? WHERE id=? AND status='pending'")
    .bind(ctx.distinct_id || null, t, sugId)
    .run();
  await capture(env, {
    event: 'ai_suggestion.actioned',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { suggestion_id: sugId, suggestion_type: sug.suggestion_type, decision: 'accepted' },
  });

  return json({ ok: true, id: sugId, status: 'accepted', ...outcome.result });
};
