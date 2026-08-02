// Posting-time table — WHEN in the week a drafted feed post should default to, in ET.
//
// RESEARCH BEHIND THE DEFAULTS (food accounts, 2026): the strongest weekday window is the
// lunch-decision window, 11:00-13:00 — it lands while someone is actually deciding what to eat
// TODAY, which is the moment a food post can turn into an order. A secondary evening window,
// 17:00-19:00, catches the dinner-decision crowd the same way. Across the week, Friday
// out-performs every other day; Tuesday-Thursday are strong; weekends are the weakest days for
// FEED reach specifically (Stories behave differently, which is exactly why social_cadence.js
// tracks them separately) — and on a weekend, evening (17:00-19:00) is still the best slot of an
// otherwise weak day.
//
// This table supplies DEFAULT SLOTS, not a hard schedule: the model still proposes a subject-
// appropriate hour per post, and the planner snaps that proposal onto the nearest slot in this
// table for the post's weekday (assignSlot, below). The prompt has always TOLD the model "never
// two posts in the same hour" — nothing ever checked it, so a model repeat collided silently and
// two posts could land in the exact same minute with no owner-visible warning. assignSlot is the
// enforcement the prompt asked for and never got.
//
// OWNER-OVERRIDABLE WITHOUT A REDEPLOY, same KV pattern as social_cadence.js: cfg:social_posting_times
// in env.SESSIONS. No env-var fallback here — a 7-day table doesn't fit an env var — so the
// resolution order is simply KV override -> these defaults.
// Files under functions/_lib are NOT routed.

const KEY = 'cfg:social_posting_times';

// Hours are ET, 24-hour integers. Two slots on weekdays (core lunch + secondary dinner window);
// one slot on weekends (the evening window — the one part of a weak day that still performs).
// Keyed 0 (Sunday) - 6 (Saturday), matching Date#getUTCDay()/getDay() so no translation table is
// needed anywhere this is consumed.
export const DEFAULT_POSTING_SLOTS = {
  0: [18],       // Sunday    — weekend, weakest for feed; evening is the best hour of a weak day
  1: [12, 18],   // Monday
  2: [12, 18],   // Tuesday
  3: [12, 18],   // Wednesday
  4: [12, 18],   // Thursday
  5: [12, 18],   // Friday    — best day of the week; both slots fill first
  6: [18],       // Saturday  — weekend, weakest for feed; evening is the best hour of a weak day
};

// Same clamp the planner has always applied server-side (8 AM-7 PM) — kept as the outer bound
// even when every table slot for a day is exhausted and assignSlot has to improvise.
export const MIN_HOUR = 8;
export const MAX_HOUR = 19;

function cleanSlots(raw) {
  const out = {};
  for (let d = 0; d <= 6; d++) {
    const candidate = raw && (raw[d] ?? raw[String(d)]);
    const arr = Array.isArray(candidate) ? candidate : null;
    const hours = (arr || [])
      .map((h) => Math.round(Number(h)))
      .filter((h) => Number.isFinite(h) && h >= MIN_HOUR && h <= MAX_HOUR);
    out[d] = hours.length ? [...new Set(hours)].sort((a, b) => a - b) : DEFAULT_POSTING_SLOTS[d];
  }
  return out;
}

// Effective posting-time table: KV override -> defaults, per weekday, field-by-field (a KV
// entry that only overrides Friday leaves the other six days at their defaults).
export async function getPostingTimes(env) {
  let kv = null;
  try { const raw = env && env.SESSIONS && await env.SESSIONS.get(KEY); if (raw) kv = JSON.parse(raw); } catch { kv = null; }
  return cleanSlots(kv);
}

export async function setPostingTimes(env, table) {
  if (!env || !env.SESSIONS) return { ok: false, error: 'Settings store unavailable.' };
  const next = cleanSlots(table);
  try { await env.SESSIONS.put(KEY, JSON.stringify(next)); return { ok: true, table: next }; }
  catch { return { ok: false, error: 'Could not save posting-time settings.' }; }
}

// The ET weekday (0=Sun..6=Sat) of a plain 'YYYY-MM-DD' date string. Anchored at noon UTC, the
// same trick etWeekStartOf/isoWeekOf use elsewhere in this codebase, so a date near a DST
// transition can never roll onto the wrong side of midnight and report the wrong weekday.
export function weekdayIndexOf(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

/**
 * Assign an hour for one post on a given weekday, given the hours already taken that day.
 *
 * Snaps `requestedHour` (whatever the model proposed) to the NEAREST unused slot in `slots` for
 * that weekday. Only when every table slot for the day is already spoken for — more posts landed
 * on one day than the table has slots for — does it fall through to any other unused hour in
 * [MIN_HOUR, MAX_HOUR], still clamped, still guaranteed unique for that day. Two posts on the
 * same weekday can therefore never resolve to the same hour, which is the collision the original
 * prompt-only instruction never actually prevented.
 *
 * `usedHours` may be a Set or a plain iterable of hours already claimed for that SAME calendar
 * day (across this run and anything already on the calendar) — the caller decides scope.
 */
export function assignSlot(slots, dow, requestedHour, usedHours) {
  const daySlots = (slots && slots[dow]) || DEFAULT_POSTING_SLOTS[dow] || [12];
  const used = usedHours instanceof Set ? usedHours : new Set(usedHours || []);
  const wantRaw = Math.round(Number(requestedHour));
  const want = Number.isFinite(wantRaw) ? Math.min(MAX_HOUR, Math.max(MIN_HOUR, wantRaw)) : daySlots[0];

  const free = daySlots.filter((h) => !used.has(h));
  if (free.length) {
    free.sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
    return free[0];
  }

  // Every table slot for the day is taken. Walk outward from the requested hour so extra posts
  // still spread across the day (11, 13, 10, 14, ...) instead of stacking on whatever hour was
  // scanned last.
  for (let offset = 1; offset <= MAX_HOUR - MIN_HOUR; offset++) {
    const up = want + offset;
    const down = want - offset;
    if (up <= MAX_HOUR && !used.has(up)) return up;
    if (down >= MIN_HOUR && !used.has(down)) return down;
  }
  // Every hour 8-19 is already claimed for this day (12 posts in one day) — hand back the
  // clamped hour rather than throw. A same-hour collision at that volume is an owner-visible
  // backlog problem, not something this function can solve by inventing a 13th hour.
  return want;
}
