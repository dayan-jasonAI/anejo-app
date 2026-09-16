// What happens between stops, on the server's clock. Files under functions/_lib are NOT routed.
//
// TWO THINGS the driver app could not do on its own:
//
//   · FINISHING A DELIVERY STARTS THE NEXT ONE. Dayan's flow: complete a drop-off, head to the next office,
//     and that office is told. It depended on the driver tapping Navigate for the next stop — and "Navigate
//     full route" hands every stop to Maps at once, so the next office was simply never told.
//     advanceToNextStop() marks the next stop on its way the moment the previous one is delivered, with the
//     ETA measured from where that delivery just happened: a real position, taken that second — never the
//     kitchen, never a guess (see stop.js on the 2026-08-04 incident).
//
//   · THE FIVE-MINUTE TEXT. The driver page reports GPS only while it is on screen, and Navigate puts Maps on
//     screen — iOS pauses the page, so a GPS-only trigger almost never fired. runApproachingSweep() runs every
//     minute on the server (piggybacked on offers-tick) and texts once when a stop's stored ETA is five
//     minutes out. It fires only inside a short window around that ETA: a sweep that missed its minute stays
//     silent rather than telling somebody "about 1 minute" twenty minutes late.
//
// Every claim is a conditional UPDATE, so two sweeps, a sweep and a GPS ping, or a double tap can never send
// the same text twice. Everything reads `atMs` — one clock for the pass.
import { etaSeconds, clockET } from './geo.js';
import { notifyOnTheWay, notifyArrivingSoon } from './notify.js';

// Dayan, 2026-09-15: "when I am five minutes away the client also gets notified."
export const APPROACHING_MIN = 5;
const LATE_GRACE_MS = 2 * 60000;

const changed = (r) => !!(r && r.meta && r.meta.changes === 1);
// A missing coordinate is not the equator: Number(null) is 0, and 0 is finite.
const num = (v) => (v === null || v === undefined || String(v).trim() === '' ? null : (Number.isFinite(Number(v)) ? Number(v) : null));
const point = (lat, lng) => {
  const a = num(lat);
  const b = num(lng);
  return a === null || b === null ? null : { lat: a, lng: b };
};

/**
 * The previous stop on `routeId` was just delivered: mark the next one on its way and tell that client.
 * `origin` is where the delivery happened. Returns { advanced, stop_id?, eta_clock? }. Never throws.
 */
export async function advanceToNextStop(env, { routeId, origin = null, atMs = Date.now() } = {}) {
  if (!env || !env.DB || !routeId) return { advanced: false };
  let next = null;
  try {
    next = await env.DB.prepare(
      `SELECT rs.id AS stop_id, rs.seq, o.* FROM route_stops rs JOIN orders o ON o.id = rs.order_id
        WHERE rs.route_id = ? AND rs.status IN ('pending', 'picked') AND rs.on_the_way_at IS NULL
        ORDER BY rs.seq ASC, rs.created_at ASC LIMIT 1`
    ).bind(routeId).first();
  } catch { return { advanced: false }; }
  if (!next) return { advanced: false };

  const claim = await env.DB.prepare(
    "UPDATE route_stops SET status = 'en_route', on_the_way_at = ?, updated_at = ? WHERE id = ? AND on_the_way_at IS NULL AND status IN ('pending', 'picked')"
  ).bind(atMs, atMs, next.stop_id).run().catch(() => null);
  if (!changed(claim)) return { advanced: false };

  let etaClock = null;
  const from = point(origin && origin.lat, origin && origin.lng);
  const to = point(next.delivery_lat, next.delivery_lng);
  if (from && to) {
    const secs = await etaSeconds(env, from, to).catch(() => null);
    if (secs != null) {
      const etaAtMs = atMs + secs * 1000;
      etaClock = clockET(etaAtMs);
      await env.DB.prepare('UPDATE route_stops SET eta_at = ?, updated_at = ? WHERE id = ?').bind(etaAtMs, atMs, next.stop_id).run().catch(() => {});
    }
  }
  await env.DB.prepare('UPDATE routes SET current_seq = ?, updated_at = ? WHERE id = ?').bind(next.seq, atMs, routeId).run().catch(() => {});
  await notifyOnTheWay(env, next, etaClock);
  return { advanced: true, stop_id: next.stop_id, eta_clock: etaClock };
}

/** Text every stop whose ETA is five minutes out, exactly once. Returns { ok, checked, sent }. */
export async function runApproachingSweep(env, { atMs = Date.now() } = {}) {
  const res = { ok: true, checked: 0, sent: 0 };
  if (!env || !env.DB) return res;
  const lead = APPROACHING_MIN * 60000;
  let rows = [];
  try {
    rows = ((await env.DB.prepare(
      `SELECT rs.id AS stop_id, rs.eta_at, o.* FROM route_stops rs
         JOIN routes r ON r.id = rs.route_id
         JOIN orders o ON o.id = rs.order_id
        WHERE rs.status = 'en_route' AND rs.arriving_at IS NULL AND rs.eta_at IS NOT NULL
          AND rs.eta_at <= ? AND rs.eta_at >= ? AND r.status NOT IN ('completed', 'canceled')
        ORDER BY rs.eta_at LIMIT 25`
    ).bind(atMs + lead, atMs - LATE_GRACE_MS).all()).results) || [];
  } catch (e) {
    return { ok: false, checked: 0, sent: 0, error: String((e && e.message) || e).slice(0, 200) };
  }
  res.checked = rows.length;
  for (const row of rows) {
    const claim = await env.DB.prepare(
      "UPDATE route_stops SET status = 'arriving', arriving_at = ?, updated_at = ? WHERE id = ? AND arriving_at IS NULL AND status = 'en_route'"
    ).bind(atMs, atMs, row.stop_id).run().catch(() => null);
    if (!changed(claim)) continue;
    const mins = Math.max(1, Math.round((row.eta_at - atMs) / 60000));
    await notifyArrivingSoon(env, row, `${mins} minute${mins === 1 ? '' : 's'}`);
    res.sent += 1;
  }
  return res;
}
