// Automated dispatch: at a configured time each day, group the day's unassigned payable orders
// into efficient routes (one per driver), build + optimize each, and auto-offer to drivers — the
// owner does nothing. Self-gating (off by default; runs only at/after the set time) and idempotent
// (only ever touches orders not already on a route), so it's safe to call from a minutely tick.
// Files under _lib are NOT routed.
import { id, now } from './util.js';
import { groupOrders } from './batch.js';
import { assignRoute } from './routing.js';

const CFG_KEY = 'cfg:auto_dispatch';
const DEFAULTS = { enabled: false, time_et: '09:05', windows: ['lunch', 'dinner'], max_per_route: 14 };

function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
function etMinutes(ms) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms));
  const g = (t) => Number((p.find((x) => x.type === t) || {}).value);
  return (g('hour') % 24) * 60 + g('minute');
}
function hhmmToMin(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '09:05')); return m ? Math.min(23, +m[1]) * 60 + Math.min(59, +m[2]) : 545; }

export async function getAutoConfig(env) {
  let kv = {};
  try { const raw = env && env.SESSIONS && await env.SESSIONS.get(CFG_KEY); if (raw) kv = JSON.parse(raw) || {}; } catch { kv = {}; }
  const windows = Array.isArray(kv.windows) && kv.windows.length ? kv.windows.filter((w) => w === 'lunch' || w === 'dinner') : DEFAULTS.windows;
  return {
    enabled: !!kv.enabled,
    time_et: /^\d{1,2}:\d{2}$/.test(kv.time_et) ? kv.time_et : DEFAULTS.time_et,
    windows: windows.length ? windows : DEFAULTS.windows,
    max_per_route: Number.isFinite(Number(kv.max_per_route)) && kv.max_per_route > 0 ? Math.min(50, Math.round(kv.max_per_route)) : DEFAULTS.max_per_route,
  };
}
export async function setAutoConfig(env, cfg) {
  if (!env || !env.SESSIONS) return { ok: false, error: 'Settings store unavailable.' };
  const cur = await getAutoConfig(env);
  const next = {
    enabled: cfg && cfg.enabled != null ? !!cfg.enabled : cur.enabled,
    time_et: cfg && /^\d{1,2}:\d{2}$/.test(cfg.time_et) ? cfg.time_et : cur.time_et,
    windows: cfg && Array.isArray(cfg.windows) ? cfg.windows.filter((w) => w === 'lunch' || w === 'dinner') : cur.windows,
    max_per_route: cfg && Number.isFinite(Number(cfg.max_per_route)) ? Math.min(50, Math.max(1, Math.round(cfg.max_per_route))) : cur.max_per_route,
  };
  if (!next.windows.length) next.windows = DEFAULTS.windows;
  try { await env.SESSIONS.put(CFG_KEY, JSON.stringify(next)); return { ok: true, config: next }; }
  catch { return { ok: false, error: 'Could not save auto-dispatch settings.' }; }
}

// Build + auto-offer routes for the date. force bypasses the enabled flag + time gate (owner's
// "build now" button). Returns a summary; never throws on the caller.
export async function runAutoDispatch(env, { nowMs, force = false, date } = {}) {
  if (!env || !env.DB) return { ok: false, error: 'Service unavailable.' };
  const cfg = await getAutoConfig(env);
  if (!cfg.enabled && !force) return { ok: true, skipped: 'disabled' };

  const t = typeof nowMs === 'number' ? nowMs : now();
  const day = date || etToday(t);
  if (!force && etMinutes(t) < hhmmToMin(cfg.time_et)) return { ok: true, skipped: 'before_time', time_et: cfg.time_et };

  // Unassigned payable orders for the date, in the configured windows.
  const winList = cfg.windows.length ? cfg.windows : ['lunch', 'dinner'];
  const winPlaceholders = winList.map(() => '?').join(',');
  let orders = [];
  try {
    const res = await env.DB.prepare(
      'SELECT o.id, o.customer_name, o.delivery_window, o.delivery_street, o.delivery_unit, o.delivery_city, ' +
      'o.delivery_state, o.delivery_zip, o.delivery_lat, o.delivery_lng ' +
      "FROM orders o WHERE o.delivery_date=? AND o.status IN ('pending','paid','prep','ready') " +
      `AND o.delivery_window IN (${winPlaceholders}) ` +
      'AND NOT EXISTS (SELECT 1 FROM route_stops rs WHERE rs.order_id = o.id) ORDER BY o.delivery_window, o.created_at'
    ).bind(day, ...winList).all();
    orders = (res && res.results) || [];
  } catch { orders = []; }
  if (!orders.length) return { ok: true, created: 0, reason: 'no_orders', date: day };

  // Group count = available drivers (fall back to active drivers, min 1).
  let avail = 0, active = 0;
  try {
    const r = await env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN available=1 THEN 1 ELSE 0 END),0) av, COUNT(*) ac FROM staff WHERE role='driver' AND active=1").first();
    avail = (r && r.av) || 0; active = (r && r.ac) || 0;
  } catch { /* none */ }
  const G = Math.max(1, Math.min(avail || active || 1, orders.length));

  const clusters = groupOrders(orders.map((o) => ({ id: o.id, lat: o.delivery_lat, lng: o.delivery_lng, _o: o })), G);

  const routes = [];
  for (const cluster of clusters) {
    const cOrders = cluster.map((c) => c._o);
    if (!cOrders.length) continue;
    try {
      const r = await assignRoute(env, { orders: cOrders.map((o) => ({ ...o })), orderIds: cOrders.map((o) => o.id), routeDate: day, driverId: null, auto: true, aiOptimized: true });
      if (r && r.ok) routes.push({ id: r.id, stop_count: r.stop_count, pay_cents: r.pay_cents, miles: r.miles, offered_to: r.offered_to, offer_status: r.offer_status });
    } catch { /* one cluster must not stop the rest */ }
  }

  // Log to agent_runs so it appears in AI Ops → Recent runs (best-effort).
  try {
    await env.DB.prepare(
      'INSERT INTO agent_runs (id, automation_type, task_type, outcome, actor_type, input, output, duration_ms, tokens, error, started_at, finished_at, created_at) ' +
      "VALUES (?,?,?,?,'system',?,?,?,?,?,?,?,?)"
    ).bind(
      id('run'), 'auto_dispatch', 'auto_dispatch', routes.length ? 'success' : 'failed',
      JSON.stringify({ trigger: force ? 'manual' : 'cron', date: day }),
      JSON.stringify({ routes: routes.length, stops: orders.length }),
      0, null, null, t, now(), now()
    ).run();
  } catch { /* best-effort */ }

  return { ok: true, created: routes.length, stops: orders.length, date: day, routes };
}
