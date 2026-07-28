// On-demand (same-day, make-now) ordering: production caps + ordering window.
// Shared by /api/order-availability (what the storefront shows) and /api/checkout (the
// authoritative gate). The per-bowl daily cap is intentionally small at launch and tuned
// WEEKLY as our metrics/AI learn real demand — override the defaults via env without a deploy:
//   ONDEMAND_BOWL_LIMIT  (per-bowl units/day, default 10)
//   ONDEMAND_OPEN_HOUR   (ET hour ordering opens, default 10 → 10 AM)
//   ONDEMAND_CLOSE_HOUR  (ET hour ordering closes, default 19)
//   ONDEMAND_CLOSE_MIN   (ET minute past close hour, default 30 → 7:30 PM)

import { loadMenu } from './menu.js';

// Only bowls are capped (drinks + add-ons are unlimited).
//
// This constant is now the LAST-KNOWN-GOOD FALLBACK, not the list itself: a bowl the owner adds in
// the HUB used to fall outside the cap silently (unlimited same-day orders for it) until someone
// edited this array and deployed. cappedBowlIds() below reads the live menu instead; this list is
// what we cap when D1 can't be reached, which is the same rule _lib/menu.js uses for prices.
export const BOWL_IDS = ['vida', 'fuego', 'ligero', 'mar', 'coco', 'congreen', 'raiz'];

/**
 * The bowl ids today's production cap applies to: every ACTIVE bowl on the live menu.
 * Pass an already-loaded menu (checkout has one) to avoid a second read.
 *
 * Falls back to BOWL_IDS whenever the menu didn't come from D1 — loadMenu already treats "table
 * missing / D1 down / empty table" as fallback, and capping nothing at all would silently remove
 * the launch throttle rather than degrade it.
 */
export async function cappedBowlIds(env, menu) {
  const m = menu || await loadMenu(env);
  if (!m || m.source !== 'd1') return BOWL_IDS.slice();
  const ids = (m.items || []).filter((it) => it.kind === 'bowl').map((it) => it.id);
  return ids.length ? ids : BOWL_IDS.slice();
}

function clampHour(v, def) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 24 ? n : def;
}

function clampMin(v, def) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n < 60 ? n : def;
}

export function onDemandConfig(env, overrides) {
  const o = overrides || {};
  const pick = (a, b) => (a === undefined || a === null || a === '' ? b : a);
  const raw = Math.floor(Number(pick(o.bowl_limit, env && env.ONDEMAND_BOWL_LIMIT)));
  const limit = Number.isFinite(raw) && raw >= 0 ? raw : 10;
  return {
    limit,
    openHour: clampHour(pick(o.open_hour, env && env.ONDEMAND_OPEN_HOUR), 10),
    closeHour: clampHour(pick(o.close_hour, env && env.ONDEMAND_CLOSE_HOUR), 19),
    closeMinute: clampMin(pick(o.close_min, env && env.ONDEMAND_CLOSE_MIN), 30),
    // 'scheduled_only' turns same-day ordering off entirely: /order already falls back to the
    // scheduled flow whenever availability reports closed, so this reuses a proven path rather
    // than introducing a second way for the storefront to be shut.
    scheduledOnly: String(pick(o.scheduled_only, env && env.ONDEMAND_SCHEDULED_ONLY)) === '1',
  };
}

/**
 * Read owner-set overrides from D1. Returns {} on any failure so the storefront falls back to env
 * defaults rather than breaking — the same last-known-good rule the menu uses.
 */
export async function loadOrderingSettings(env) {
  if (!env || !env.DB) return {};
  try {
    const r = await env.DB.prepare(
      "SELECT key, value FROM app_settings WHERE key LIKE 'ordering.%'"
    ).all();
    const out = {};
    for (const row of (r && r.results) || []) out[String(row.key).replace('ordering.', '')] = row.value;
    return out;
  } catch { return {}; }
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
export function windowState(env, d = new Date(), overrides) {
  const { openHour, closeHour, closeMinute, scheduledOnly } = onDemandConfig(env, overrides);
  const { hour, minute, dateStr } = etParts(d);
  const nowMin = hour * 60 + minute;
  const inWindow = nowMin >= openHour * 60 && nowMin < closeHour * 60 + closeMinute;
  // Scheduled-only wins over the clock: the owner has said "no same-day", so the window is moot.
  const open = scheduledOnly ? false : inWindow;
  return { open, openHour, closeHour, closeMinute, dateStr, scheduledOnly: !!scheduledOnly };
}

// Remaining capacity per bowl for a given ET day: cap minus the bowls already committed today.
// "Committed" = paid/fulfilled orders (always), plus recent 'pending' ones. A pending order
// (payment link created, not yet paid) holds its slot only for a short window so an abandoned
// checkout doesn't block the cap forever — after that it's treated as abandoned and the slot
// frees up. Tunable via ONDEMAND_PENDING_HOLD_MIN (default 30 minutes; 0 = never hold pending).
// `menu` is optional and only saves a read — the ids are resolved from the live menu either way.
export async function remainingByBowl(env, dateStr, limit, menu) {
  const remaining = {};
  for (const id of await cappedBowlIds(env, menu)) remaining[id] = limit;
  if (!env || !env.DB) return remaining;
  const rawHold = Math.floor(Number(env.ONDEMAND_PENDING_HOLD_MIN));
  const holdMin = Number.isFinite(rawHold) && rawHold >= 0 ? rawHold : 30;
  const pendingCutoff = Date.now() - holdMin * 60 * 1000;
  const { results } = await env.DB.prepare(
    `SELECT items FROM orders
       WHERE fulfillment_mode = 'on_demand' AND delivery_date = ? AND status != 'canceled'
         AND (status != 'pending' OR created_at >= ?)`
  ).bind(dateStr, pendingCutoff).all();
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
