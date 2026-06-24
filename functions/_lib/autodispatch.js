// Automated dispatch: runs continuously through each delivery window (lunch + dinner, never
// mixed), batching the window's unassigned orders into efficient, ROI-protecting routes and
// auto-offering them to drivers — the owner does nothing. A batch is only released when it's
// "ripe": it has at least min_stops_per_route (so a driver never runs for one bowl and the trip
// is worth the pay) OR its oldest order has waited max_wait_minutes (freshness safety valve) OR
// the window is closing. Self-gating (off by default) + idempotent (only touches orders not yet
// on a route), so it's safe to call from a minutely tick. Files under _lib are NOT routed.
import { id, now } from './util.js';
import { groupOrders } from './batch.js';
import { assignRoute, serviceWindow } from './routing.js';

const CFG_KEY = 'cfg:auto_dispatch';
const CLOSE_FLUSH_MIN = 20; // in the last N min of a window, flush whatever's left (don't strand orders)
// lead_minutes: begin batching this long before a window opens (so the pre-ordered batch can go
//   out right at open). min_stops_per_route: the ROI/driver-fairness floor — hold smaller batches.
//   max_wait_minutes: a held order never waits longer than this (freshness).
const DEFAULTS = { enabled: false, lead_minutes: 90, min_stops_per_route: 3, max_wait_minutes: 25, windows: ['lunch', 'dinner'], max_per_route: 14 };

function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
const clampInt = (v, lo, hi, fallback) => { const n = Number(v); return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : fallback; };

export async function getAutoConfig(env) {
  let kv = {};
  try { const raw = env && env.SESSIONS && await env.SESSIONS.get(CFG_KEY); if (raw) kv = JSON.parse(raw) || {}; } catch { kv = {}; }
  const windows = Array.isArray(kv.windows) && kv.windows.length ? kv.windows.filter((w) => w === 'lunch' || w === 'dinner') : DEFAULTS.windows;
  return {
    enabled: !!kv.enabled,
    lead_minutes: clampInt(kv.lead_minutes, 15, 240, DEFAULTS.lead_minutes),
    min_stops_per_route: clampInt(kv.min_stops_per_route, 1, 20, DEFAULTS.min_stops_per_route),
    max_wait_minutes: clampInt(kv.max_wait_minutes, 5, 120, DEFAULTS.max_wait_minutes),
    windows: windows.length ? windows : DEFAULTS.windows,
    max_per_route: clampInt(kv.max_per_route, 1, 50, DEFAULTS.max_per_route),
  };
}
export async function setAutoConfig(env, cfg) {
  if (!env || !env.SESSIONS) return { ok: false, error: 'Settings store unavailable.' };
  const cur = await getAutoConfig(env);
  const next = {
    enabled: cfg && cfg.enabled != null ? !!cfg.enabled : cur.enabled,
    lead_minutes: cfg && cfg.lead_minutes != null ? clampInt(cfg.lead_minutes, 15, 240, cur.lead_minutes) : cur.lead_minutes,
    min_stops_per_route: cfg && cfg.min_stops_per_route != null ? clampInt(cfg.min_stops_per_route, 1, 20, cur.min_stops_per_route) : cur.min_stops_per_route,
    max_wait_minutes: cfg && cfg.max_wait_minutes != null ? clampInt(cfg.max_wait_minutes, 5, 120, cur.max_wait_minutes) : cur.max_wait_minutes,
    windows: cfg && Array.isArray(cfg.windows) ? cfg.windows.filter((w) => w === 'lunch' || w === 'dinner') : cur.windows,
    max_per_route: cfg && cfg.max_per_route != null ? clampInt(cfg.max_per_route, 1, 50, cur.max_per_route) : cur.max_per_route,
  };
  if (!next.windows.length) next.windows = DEFAULTS.windows;
  try { await env.SESSIONS.put(CFG_KEY, JSON.stringify(next)); return { ok: true, config: next }; }
  catch { return { ok: false, error: 'Could not save auto-dispatch settings.' }; }
}

// Build + auto-offer routes for the date, one window at a time. force bypasses the enabled flag,
// the per-window time gate, AND the once-per-window marker (owner's "build now"). Never throws.
export async function runAutoDispatch(env, { nowMs, force = false, date } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const cfg = await getAutoConfig(env);
  if (!cfg.enabled && !force) return { ok: true, skipped: 'disabled' };

  const t = typeof nowMs === 'number' ? nowMs : now();
  const day = date || etToday(t);
  const winList = cfg.windows.length ? cfg.windows : ['lunch', 'dinner'];

  // Driver count is shared across windows (one driver does both runs, staggered).
  let avail = 0, active = 0;
  try {
    const r = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN available=1 THEN 1 ELSE 0 END),0) av, COUNT(*) ac FROM staff WHERE role='driver' AND active=1").first();
    avail = (r && r.av) || 0; active = (r && r.ac) || 0;
  } catch { /* none */ }
  const driverCount = Math.max(1, avail || active || 1);

  const routes = [];
  const built = [];
  let anyGated = false, totalStops = 0, held = 0;

  for (const window of winList) {
    const { start, end } = serviceWindow(day, window);
    const openAt = start - cfg.lead_minutes * 60000;  // begin batching this far before the window

    // Active only from the lead-in through the end of service. force ignores the gate.
    if (!force) {
      if (t < openAt) { anyGated = true; continue; }   // window not active yet
      if (t > end) continue;                            // service window has ended
    }
    const closing = !force && t >= end - CLOSE_FLUSH_MIN * 60000; // last stretch → flush whatever's left

    // Unassigned payable orders for THIS window only — never mix lunch + dinner on a route.
    let orders = [];
    try {
      const res = await env.DB.prepare(
        'SELECT o.id, o.customer_name, o.delivery_window, o.delivery_street, o.delivery_unit, o.delivery_city, ' +
        'o.delivery_state, o.delivery_zip, o.delivery_lat, o.delivery_lng, o.created_at ' +
        "FROM orders o WHERE o.delivery_date=? AND o.delivery_window=? AND o.status IN ('pending','paid','prep','ready') " +
        'AND NOT EXISTS (SELECT 1 FROM route_stops rs WHERE rs.order_id = o.id) ORDER BY o.created_at'
      ).bind(day, window).all();
      orders = (res && res.results) || [];
    } catch { orders = []; }
    if (!orders.length) continue;

    const G = Math.max(1, Math.min(driverCount, orders.length));
    const clusters = groupOrders(orders.map((o) => ({ id: o.id, lat: o.delivery_lat, lng: o.delivery_lng, _o: o })), G);
    let madeOne = false;
    for (const cluster of clusters) {
      let cOrders = cluster.map((c) => c._o);
      if (!cOrders.length) continue;

      // Ripeness: release the batch only when it's worth dispatching — enough stops to protect
      // ROI + reward the driver, OR an order has waited too long (freshness), OR we're forcing/closing.
      // Wait clock starts when the customer's window opens (scheduled pre-orders aren't "late" before
      // their window; on-demand orders placed mid-window age from when they came in).
      const oldestWaitStart = Math.min(...cOrders.map((o) => Math.max(Number(o.created_at) || t, start)));
      const agedOut = (t - oldestWaitStart) >= cfg.max_wait_minutes * 60000;
      const ripe = force || closing || cOrders.length >= cfg.min_stops_per_route || agedOut;
      if (!ripe) { held += cOrders.length; continue; } // hold to accumulate a bigger, profitable batch

      if (cOrders.length > cfg.max_per_route) cOrders = cOrders.slice(0, cfg.max_per_route); // cap; remainder waits
      try {
        const r = await assignRoute(env, { orders: cOrders.map((o) => ({ ...o })), orderIds: cOrders.map((o) => o.id), routeDate: day, driverId: null, auto: true, aiOptimized: true });
        if (r && r.ok) { routes.push({ id: r.id, window, stop_count: r.stop_count, pay_cents: r.pay_cents, miles: r.miles, offered_to: r.offered_to, offer_status: r.offer_status }); madeOne = true; totalStops += cOrders.length; }
      } catch { /* one cluster must not stop the rest */ }
    }
    if (madeOne && built.indexOf(window) < 0) built.push(window);
  }

  if (routes.length) {
    try {
      await env.DB.prepare(
        'INSERT INTO agent_runs (id, automation_type, task_type, outcome, actor_type, input, output, duration_ms, tokens, error, started_at, finished_at, created_at) ' +
        "VALUES (?,?,?,?,'system',?,?,?,?,?,?,?,?)"
      ).bind(
        id('run'), 'auto_dispatch', 'auto_dispatch', 'success',
        JSON.stringify({ trigger: force ? 'manual' : 'cron', date: day }),
        JSON.stringify({ routes: routes.length, stops: totalStops, windows: built, held }),
        0, null, null, t, now(), now()
      ).run();
    } catch { /* best-effort */ }
    return { ok: true, created: routes.length, stops: totalStops, held, date: day, windows: built, routes };
  }
  if (held) return { ok: true, created: 0, held, reason: 'holding_for_batch', date: day };
  if (anyGated && !force) return { ok: true, created: 0, skipped: 'before_window', date: day };
  return { ok: true, created: 0, reason: 'no_orders', date: day };
}
