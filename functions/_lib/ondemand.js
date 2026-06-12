// On-demand (same-day, make-now) ordering: production caps + ordering window.
// Shared by /api/order-availability (what the storefront shows) and /api/checkout (the
// authoritative gate). The per-bowl daily cap is intentionally small at launch and tuned
// WEEKLY as our metrics/AI learn real demand — override the defaults via env without a deploy:
//   ONDEMAND_BOWL_LIMIT  (per-bowl units/day, default 10)
//   ONDEMAND_OPEN_HOUR   (ET hour ordering opens, default 11 → 11 AM)
//   ONDEMAND_CLOSE_HOUR  (ET hour ordering closes, default 19 → 7 PM)

// Only bowls are capped (drinks + add-ons are unlimited). IDs mirror the checkout catalog.
export const BOWL_IDS = ['vida', 'fuego', 'ligero', 'mar', 'coco', 'congreen', 'raiz'];

function clampHour(v, def) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 24 ? n : def;
}

export function onDemandConfig(env) {
  const raw = Math.floor(Number(env && env.ONDEMAND_BOWL_LIMIT));
  const limit = Number.isFinite(raw) && raw >= 0 ? raw : 10;
  return {
    limit,
    openHour: clampHour(env && env.ONDEMAND_OPEN_HOUR, 11),
    closeHour: clampHour(env && env.ONDEMAND_CLOSE_HOUR, 19),
  };
}

// Current wall-clock in Añejo's operating timezone (America/New_York), DST-correct, so the
// 11 AM–7 PM window and "today" are evaluated in ET regardless of where the worker runs.
export function etParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
  const p = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  return { dateStr: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), minute: Number(p.minute) };
}

// Is on-demand ordering open right now? Returns the window bounds + today's ET date.
export function windowState(env, d = new Date()) {
  const { openHour, closeHour } = onDemandConfig(env);
  const { hour, dateStr } = etParts(d);
  return { open: hour >= openHour && hour < closeHour, openHour, closeHour, dateStr };
}

// Remaining capacity per bowl for a given ET day: cap minus the bowls already committed today.
// "Committed" = any non-canceled on-demand order (pending holds a slot so we never oversell).
export async function remainingByBowl(env, dateStr, limit) {
  const remaining = {};
  for (const id of BOWL_IDS) remaining[id] = limit;
  if (!env || !env.DB) return remaining;
  const { results } = await env.DB.prepare(
    `SELECT items FROM orders WHERE fulfillment_mode = 'on_demand' AND delivery_date = ? AND status != 'canceled'`
  ).bind(dateStr).all();
  for (const row of results || []) {
    let items = [];
    try { items = JSON.parse(row.items) || []; } catch { /* skip unparseable rows */ }
    for (const it of items) {
      if (remaining[it && it.id] != null) {
        remaining[it.id] = Math.max(0, remaining[it.id] - (Number(it.qty) || 0));
      }
    }
  }
  return remaining;
}
