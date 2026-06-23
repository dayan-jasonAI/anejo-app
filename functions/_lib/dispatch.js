// Route-offer auto-dispatch. A route is OFFERED to one driver at a time (push + SMS +
// in-app); a DENY or a ~2-minute timeout rolls it to the next driver; when none remain the
// route is 'unfilled' and the owner is alerted. Each driver's accept/decline/miss tally is
// kept on staff. Files under _lib are NOT routed. Best-effort; never throws on the caller.
import { id, now, parseJson, toJson } from './hub.js';
import { sendPushTickle } from './push.js';
import { sendSms } from './twilio.js';
import { raiseAlert } from './alerts.js';

export const OFFER_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes of silence → roll to next driver

function appBase(env) {
  return ((env && env.APP_BASE_URL) || 'https://anejocateringco.com').replace(/\/$/, '');
}

// "· $32.00 · ~4.2 mi · done by 12:40 PM" — the parts of the offer the driver cares about.
function offerTerms(route) {
  const parts = [];
  if (route && route.pay_cents != null) parts.push('$' + (Number(route.pay_cents) / 100).toFixed(2) + ' pay');
  if (route && route.total_miles_est != null) parts.push('~' + Number(route.total_miles_est) + ' mi');
  if (route && route.eta_complete_at) {
    try { parts.push('done by ' + new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' }).format(new Date(Number(route.eta_complete_at)))); } catch { /* skip */ }
  }
  return parts.length ? ' — ' + parts.join(' · ') : '';
}

// Find the driver's latest open thread, or create one (mirror of owner/routes.js).
async function driverThread(env, driverId, t) {
  try {
    const r = await env.DB.prepare("SELECT id FROM threads WHERE staff_id=? AND status='open' ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1").bind(driverId).first();
    if (r && r.id) return r.id;
  } catch { /* no staff_id col */ }
  const tid = id('thr');
  try {
    await env.DB.prepare("INSERT INTO threads (id, audience, subject, created_by, staff_id, status, created_at, updated_at) VALUES (?,'driver',?,?,?,'open',?,?)")
      .bind(tid, 'Delivery offer', driverId, driverId, t, t).run();
    return tid;
  } catch { /* fall back below */ }
  try {
    await env.DB.prepare("INSERT INTO threads (id, audience, subject, created_by, status, created_at, updated_at) VALUES (?,'driver',?,?,'open',?,?)")
      .bind(tid, 'Delivery offer', driverId, t, t).run();
    return tid;
  } catch { return null; }
}

// Increment a driver's reliability counter + write the per-offer audit row.
export async function recordOutcome(env, routeId, driverId, outcome) {
  try {
    await env.DB.prepare('INSERT INTO route_offers (id, route_id, driver_id, outcome, created_at) VALUES (?,?,?,?,?)')
      .bind(id('rof'), routeId, driverId || null, outcome, now()).run();
  } catch { /* audit best-effort */ }
  const col = outcome === 'accepted' ? 'offers_accepted'
    : outcome === 'declined' ? 'offers_declined'
    : outcome === 'missed' ? 'offers_missed' : null;
  if (col && driverId) {
    try { await env.DB.prepare(`UPDATE staff SET ${col} = COALESCE(${col},0)+1 WHERE id=?`).bind(driverId).run(); } catch { /* counter best-effort */ }
  }
}

// Mark `route` as offered to `driver` and notify them (push + SMS + in-app thread).
export async function sendOffer(env, route, driver) {
  const t = now();
  await env.DB.prepare("UPDATE routes SET driver_id=?, offer_status='pending', offered_at=?, updated_at=? WHERE id=?")
    .bind(driver.id, t, t, route.id).run();
  await recordOutcome(env, route.id, driver.id, 'offered');

  try { await sendPushTickle(env, { staffIds: [driver.id] }); } catch { /* push best-effort */ }

  if (driver.phone) {
    const link = `${appBase(env)}/hub/driver/route.html`;
    try {
      await sendSms(env, { to: driver.phone, body: `Añejo HUB: New delivery route — ${route.stop_count || ''} stop(s) on ${route.route_date}${offerTerms(route)}. Open the app to accept or deny: ${link}` });
    } catch { /* sms no-op safe */ }
  }

  try {
    const thr = await driverThread(env, driver.id, t);
    if (thr) {
      await env.DB.prepare("INSERT INTO messages (id, thread_id, direction, channel, sender_id, sender_role, body, ai_drafted, created_at) VALUES (?,?,'outbound','in_app',NULL,'system',?,0,?)")
        .bind(id('msg'), thr, `New delivery route offered — ${route.stop_count || ''} stop(s) on ${route.route_date}${offerTerms(route)}. Accept or deny in Route.`, t).run();
      await env.DB.prepare('UPDATE threads SET last_message_at=?, updated_at=? WHERE id=?').bind(t, t, thr).run();
    }
  } catch { /* in-app notice best-effort */ }
  return { ok: true, offered_to: driver.id };
}

// Offer the route to the next eligible driver (active drivers, those toggled "available"
// first, excluding anyone who already declined/missed). None left → 'unfilled' + owner alert.
export async function offerToNext(env, routeId) {
  const route = await env.DB.prepare('SELECT * FROM routes WHERE id=?').bind(routeId).first();
  if (!route) return { ok: false, reason: 'no_route' };
  if (route.offer_status === 'accepted') return { ok: true, already: 'accepted' };

  const declined = parseJson(route.declined_ids, []) || [];
  let candidates = [];
  try {
    const { results } = await env.DB.prepare(
      "SELECT id, name, phone FROM staff WHERE role='driver' AND active=1 ORDER BY COALESCE(available,0) DESC, COALESCE(offers_accepted,0) ASC, name ASC"
    ).all();
    candidates = results || [];
  } catch { candidates = []; }
  const next = candidates.find((d) => !declined.includes(d.id));

  if (!next) {
    const t = now();
    await env.DB.prepare("UPDATE routes SET offer_status='unfilled', updated_at=? WHERE id=?").bind(t, routeId).run();
    await recordOutcome(env, routeId, null, 'unfilled');
    try {
      await raiseAlert(env, {
        alert_type: 'delivery_failed', severity: 'high',
        title: 'Route unfilled — no driver accepted',
        body: `No available driver accepted the route for ${route.route_date} (${route.stop_count || '?'} stops). Assign one manually from Deliveries.`,
        ref_type: 'route', ref_id: routeId, dedupe_key: 'route_unfilled:' + routeId,
      });
    } catch { /* alert best-effort */ }
    return { ok: true, unfilled: true };
  }
  return sendOffer(env, route, next);
}

// A driver declined (or timed out). Record it, exclude them, roll to the next driver.
export async function declineAndReoffer(env, routeId, driverId, outcome) {
  const route = await env.DB.prepare('SELECT * FROM routes WHERE id=?').bind(routeId).first();
  if (!route) return { ok: false, reason: 'no_route' };
  const declined = parseJson(route.declined_ids, []) || [];
  if (driverId && !declined.includes(driverId)) declined.push(driverId);
  await env.DB.prepare('UPDATE routes SET declined_ids=?, updated_at=? WHERE id=?').bind(toJson(declined), now(), routeId).run();
  if (driverId) await recordOutcome(env, routeId, driverId, outcome); // 'declined' | 'missed'
  return offerToNext(env, routeId);
}
