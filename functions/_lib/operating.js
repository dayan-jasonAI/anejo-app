// Operating rules the OWNER sets: where we deliver, which days, the order-by deadline, the
// lunch/dinner windows, closures, and temporary overrides.
//
// All of it used to be hardcoded — `if (dt.getDay() === 0) continue;` for "no Sunday", a literal
// "Order by 6 PM the day before" in the markup, window times written into an <option>. Changing
// how the business operates meant a developer and a deploy.
//
// One rule that is NOT a settings change but a bug fix: the service area was never enforced. The
// code said "we deliver within Palm Beach County" in a comment while checkout accepted ANY 5-digit
// ZIP — which is how an order came in from Miami. Someone in another state could pay for food that
// cannot reach them, and we would be holding their money.
//
// Defaults preserve today's behaviour exactly, so deploying this changes nothing until the owner
// sets something. The one exception is the service area, which defaults to UNRESTRICTED (as it is
// now) rather than to a guess at the right ZIP list — silently refusing a real customer is worse
// than the status quo. The HUB flags loudly that no area is set.

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const DEFAULTS = {
  delivery_days: '1,2,3,4,5,6',   // Mon–Sat, matching the current hardcoded rule
  order_by_hour: 18,              // "order by 6 PM the day before"
  lunch_start: '11:00', lunch_end: '14:00',
  dinner_start: '17:00', dinner_end: '20:00',
  service_zips: '',               // '' = unrestricted (today's real behaviour)
  closed_dates: '',               // CSV of YYYY-MM-DD
};

const int = (v, def) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : def; };
const csv = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);

/** Load owner settings from D1. Never throws — falls back to defaults like the menu does. */
export async function loadOperating(env) {
  const out = { ...DEFAULTS };
  if (!env || !env.DB) return out;
  try {
    const r = await env.DB.prepare("SELECT key, value FROM app_settings WHERE key LIKE 'ops.%'").all();
    for (const row of (r && r.results) || []) {
      const k = String(row.key).replace('ops.', '');
      if (k in out || k === 'temp_open_until' || k === 'temp_note') out[k] = row.value;
    }
  } catch { /* defaults */ }
  return out;
}

/** ET calendar parts for a Date — the business runs on Eastern regardless of server location. */
export function etDayParts(d = new Date()) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const p = {};
  for (const part of f.formatToParts(d)) p[part.type] = part.value;
  return {
    date: `${p.year}-${p.month}-${p.day}`,
    dow: DAY_NAMES.indexOf(p.weekday),
    minutes: Number(p.hour) * 60 + Number(p.minute),
  };
}

/** Which weekday numbers (0=Sun) we deliver on. */
export function deliveryDays(ops) {
  const days = csv(ops.delivery_days).map(Number).filter((n) => n >= 0 && n <= 6);
  return days.length ? days : csv(DEFAULTS.delivery_days).map(Number);
}

/** Is this YYYY-MM-DD a date the owner marked closed? */
export function isClosed(ops, dateStr) {
  return csv(ops.closed_dates).includes(dateStr);
}

/**
 * Can a customer still order for `dateStr`?
 *
 * The deadline is the ORDER-BY hour on the PREVIOUS day: to receive food on Friday you must have
 * ordered by 6 PM Thursday. Same-day is handled separately by the on-demand window.
 */
export function scheduleOpenFor(ops, dateStr, nowDate = new Date()) {
  const nowEt = etDayParts(nowDate);
  if (dateStr <= nowEt.date) return { ok: false, reason: 'past' };   // today/back is on-demand's turf

  const dow = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  if (!deliveryDays(ops).includes(dow)) return { ok: false, reason: 'no_delivery_day' };
  if (isClosed(ops, dateStr)) return { ok: false, reason: 'closed' };

  // Deadline applies only to the very next delivery day; anything further out is always open.
  const dayBefore = new Date(Date.parse(dateStr + 'T12:00:00Z') - 86400000)
    .toISOString().slice(0, 10);
  if (nowEt.date === dayBefore && nowEt.minutes >= int(ops.order_by_hour, 18) * 60) {
    return { ok: false, reason: 'past_deadline' };
  }
  return { ok: true };
}

/**
 * Is this ZIP inside the service area?
 *
 * `service_zips` accepts full ZIPs (33445) and 3-digit prefixes (334) mixed. EMPTY MEANS
 * UNRESTRICTED — the current behaviour — because defaulting to a guessed list would start
 * rejecting real customers the moment this deploys.
 */
export function zipAllowed(ops, zip) {
  const list = csv(ops.service_zips);
  if (!list.length) return { ok: true, unrestricted: true };
  const z = String(zip || '').trim();
  if (!/^\d{5}$/.test(z)) return { ok: false, unrestricted: false };
  const ok = list.some((entry) => (entry.length === 5 ? entry === z : z.startsWith(entry)));
  return { ok, unrestricted: false };
}

/**
 * A temporary override that expires on its own — "keep taking same-day orders until 9pm tonight",
 * or a flash window. Stored as an epoch-ms deadline so it cannot be left on by accident: once the
 * clock passes it, normal rules resume with no one having to remember to switch it back.
 */
export function tempOverride(ops, nowDate = new Date()) {
  const until = int(ops.temp_open_until, 0);
  const active = until > 0 && nowDate.getTime() < until;
  return { active, until: until || null, note: (ops.temp_note || '').slice(0, 120) };
}

/** Human summary for the HUB, so the owner reads rules rather than raw fields. */
export function describe(ops) {
  const days = deliveryDays(ops).map((d) => DAY_NAMES[d]);
  const zips = csv(ops.service_zips);
  return {
    days: days.join(', ') || 'none',
    order_by: `${int(ops.order_by_hour, 18) % 12 || 12} ${int(ops.order_by_hour, 18) >= 12 ? 'PM' : 'AM'} the day before`,
    lunch: `${ops.lunch_start}–${ops.lunch_end}`,
    dinner: `${ops.dinner_start}–${ops.dinner_end}`,
    area: zips.length ? `${zips.length} ZIP rule(s)` : 'Unrestricted — orders accepted from anywhere',
    closed_count: csv(ops.closed_dates).length,
  };
}
