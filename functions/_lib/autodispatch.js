// Automated dispatch: builds the day's routes PER DELIVERY WINDOW (a separate lunch run and
// dinner run — never mixed) shortly before each window opens, groups them per driver, optimizes,
// and auto-offers to drivers — the owner does nothing. Self-gating (off by default; each window
// builds once, in the lead-in before its departure) and idempotent (only touches orders not yet
// on a route), so it's safe to call from a minutely tick. Files under _lib are NOT routed.
import { id, now } from './util.js';
import { groupOrders } from './batch.js';
import { assignRoute, departForWindow } from './routing.js';

const CFG_KEY = 'cfg:auto_dispatch';
// lead_minutes = how long before a window opens to build + offer its route (default 90 min:
// lunch opens 11 AM → built ~9:00 AM; dinner opens 5 PM → built ~3:00 PM).
const DEFAULTS = { enabled: false, lead_minutes: 90, windows: ['lunch', 'dinner'], max_per_route: 14 };

function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function clampLead(v, fallback) { const n = Number(v); return Number.isFinite(n) && n >= 15 && n <= 240 ? Math.round(n) : fallback; }

export async function getAutoConfig(env) {
  let kv = {};
  try { const raw = env && env.SESSIONS && await env.SESSIONS.get(CFG_KEY); if (raw) kv = JSON.parse(raw) || {}; } catch { kv = {}; }
  const windows = Array.isArray(kv.windows) && kv.windows.length ? kv.windows.filter((w) => w === 'lunch' || w === 'dinner') : DEFAULTS.windows;
  return {
    enabled: !!kv.enabled,
    lead_minutes: clampLead(kv.lead_minutes, DEFAULTS.lead_minutes),
    windows: windows.length ? windows : DEFAULTS.windows,
    max_per_route: Number.isFinite(Number(kv.max_per_route)) && kv.max_per_route > 0 ? Math.min(50, Math.round(kv.max_per_route)) : DEFAULTS.max_per_route,
  };
}
export async function setAutoConfig(env, cfg) {
  if (!env || !env.SESSIONS) return { ok: false, error: 'Settings store unavailable.' };
  const cur = await getAutoConfig(env);
  const next = {
    enabled: cfg && cfg.enabled != null ? !!cfg.enabled : cur.enabled,
    lead_minutes: cfg && cfg.lead_minutes != null ? clampLead(cfg.lead_minutes, cur.lead_minutes) : cur.lead_minutes,
    windows: cfg && Array.isArray(cfg.windows) ? cfg.windows.filter((w) => w === 'lunch' || w === 'dinner') : cur.windows,
    max_per_route: cfg && Number.isFinite(Number(cfg.max_per_route)) ? Math.min(50, Math.max(1, Math.round(cfg.max_per_route))) : cur.max_per_route,
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
  let anyGated = false, totalStops = 0;

  for (const window of winList) {
    const depart = departForWindow(day, window);
    const openAt = depart - cfg.lead_minutes * 60000;
    const marker = 'adone:' + day + ':' + window;

    // Gate: build a window ONCE, in its lead-in [openAt, depart]. force ignores the gate + marker.
    if (!force) {
      if (t < openAt) { anyGated = true; continue; }   // too early for this window yet
      if (t > depart) continue;                          // its departure has already passed
      let done = false;
      try { done = !!(env.SESSIONS && await env.SESSIONS.get(marker)); } catch { done = false; }
      if (done) continue;                                // already built this window today
    }

    // Unassigned payable orders for THIS window only — never mix lunch + dinner on a route.
    let orders = [];
    try {
      const res = await env.DB.prepare(
        'SELECT o.id, o.customer_name, o.delivery_window, o.delivery_street, o.delivery_unit, o.delivery_city, ' +
        'o.delivery_state, o.delivery_zip, o.delivery_lat, o.delivery_lng ' +
        "FROM orders o WHERE o.delivery_date=? AND o.delivery_window=? AND o.status IN ('pending','paid','prep','ready') " +
        'AND NOT EXISTS (SELECT 1 FROM route_stops rs WHERE rs.order_id = o.id) ORDER BY o.created_at'
      ).bind(day, window).all();
      orders = (res && res.results) || [];
    } catch { orders = []; }
    if (!orders.length) continue;   // nothing to build for this window now (don't mark — try later)

    const G = Math.max(1, Math.min(driverCount, orders.length));
    const clusters = groupOrders(orders.map((o) => ({ id: o.id, lat: o.delivery_lat, lng: o.delivery_lng, _o: o })), G);
    let madeOne = false;
    for (const cluster of clusters) {
      const cOrders = cluster.map((c) => c._o);
      if (!cOrders.length) continue;
      try {
        const r = await assignRoute(env, { orders: cOrders.map((o) => ({ ...o })), orderIds: cOrders.map((o) => o.id), routeDate: day, driverId: null, auto: true, aiOptimized: true });
        if (r && r.ok) { routes.push({ id: r.id, window, stop_count: r.stop_count, pay_cents: r.pay_cents, miles: r.miles, offered_to: r.offered_to, offer_status: r.offer_status }); madeOne = true; }
      } catch { /* one cluster must not stop the rest */ }
    }
    if (madeOne) { built.push(window); totalStops += orders.length; }
    // Mark the window built so the minutely tick won't fragment it into more routes (force skips this).
    if (!force && madeOne) { try { if (env.SESSIONS) await env.SESSIONS.put(marker, '1', { expirationTtl: 60 * 60 * 36 }); } catch { /* best-effort */ } }
  }

  if (routes.length) {
    try {
      await env.DB.prepare(
        'INSERT INTO agent_runs (id, automation_type, task_type, outcome, actor_type, input, output, duration_ms, tokens, error, started_at, finished_at, created_at) ' +
        "VALUES (?,?,?,?,'system',?,?,?,?,?,?,?,?)"
      ).bind(
        id('run'), 'auto_dispatch', 'auto_dispatch', 'success',
        JSON.stringify({ trigger: force ? 'manual' : 'cron', date: day }),
        JSON.stringify({ routes: routes.length, stops: totalStops, windows: built }),
        0, null, null, t, now(), now()
      ).run();
    } catch { /* best-effort */ }
    return { ok: true, created: routes.length, stops: totalStops, date: day, windows: built, routes };
  }
  if (anyGated && !force) return { ok: true, created: 0, skipped: 'before_window', date: day };
  return { ok: true, created: 0, reason: 'no_orders', date: day };
}
