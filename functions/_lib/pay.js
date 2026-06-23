// Driver route-pay model. A route pays: base + (per-stop × stops) + (per-mile × miles),
// floored at a route minimum. Owner-configurable WITHOUT a redeploy — settings live in KV
// (cfg:driver_pay), falling back to env vars, then to sensible defaults. Setting per-stop and
// per-mile to 0 with a base = flat-per-route; setting base/min to 0 = pure per-stop+mileage.
// Files under _lib are NOT routed.

const DEFAULTS = { base_cents: 0, per_stop_cents: 300, per_mile_cents: 70, min_cents: 2000 };
const KEY = 'cfg:driver_pay';
const FIELDS = ['base_cents', 'per_stop_cents', 'per_mile_cents', 'min_cents'];

function fromEnv(env) {
  const out = {};
  for (const f of FIELDS) {
    const v = Number(env && env['DRIVER_PAY_' + f.toUpperCase()]);
    if (Number.isFinite(v) && v >= 0) out[f] = Math.round(v);
  }
  return out;
}

function clean(obj) {
  const out = {};
  for (const f of FIELDS) {
    const v = Number(obj && obj[f]);
    out[f] = Number.isFinite(v) && v >= 0 ? Math.round(v) : DEFAULTS[f];
  }
  return out;
}

// Effective pay config: KV override → env → defaults (field-by-field).
export async function getPayConfig(env) {
  let kv = {};
  try { const raw = env && env.SESSIONS && await env.SESSIONS.get(KEY); if (raw) kv = JSON.parse(raw) || {}; } catch { kv = {}; }
  return clean({ ...DEFAULTS, ...fromEnv(env), ...kv });
}

export async function setPayConfig(env, cfg) {
  if (!env || !env.SESSIONS) return { ok: false, error: 'Settings store unavailable.' };
  const next = clean(cfg);
  try { await env.SESSIONS.put(KEY, JSON.stringify(next)); return { ok: true, config: next }; }
  catch { return { ok: false, error: 'Could not save pay settings.' }; }
}

// Compute route pay. miles may be null (no distance available) → mileage term is 0.
// Returns the total plus a breakdown for transparent display to owner + driver.
export function computeRoutePay(cfg, { stops = 0, miles = null } = {}) {
  const c = clean(cfg);
  const n = Math.max(0, Math.round(Number(stops) || 0));
  const hasMiles = miles != null && Number.isFinite(Number(miles));
  const mi = hasMiles ? Math.max(0, Number(miles)) : 0;
  const stop_cents = c.per_stop_cents * n;
  const mile_cents = Math.round(c.per_mile_cents * mi);
  const raw = c.base_cents + stop_cents + mile_cents;
  const applied_min = raw < c.min_cents;
  const total_cents = Math.max(raw, c.min_cents);
  return {
    total_cents, applied_min,
    base_cents: c.base_cents, stop_cents, mile_cents, min_cents: c.min_cents,
    stops: n, miles: hasMiles ? Math.round(mi * 10) / 10 : null,
    per_stop_cents: c.per_stop_cents, per_mile_cents: c.per_mile_cents,
  };
}

export const PAY_DEFAULTS = DEFAULTS;
