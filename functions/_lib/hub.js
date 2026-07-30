// Tiny shared helpers for the HUB surfaces. Files under functions/_lib are not routed.
// Complements util.js (which already has now(), id(), json(), bad(), randToken()).
import { id, now } from './util.js';

export { id, now };

// crypto.randomUUID-based id when you want a UUID rather than the short util.id().
export function uuid(prefix) {
  const u = (crypto.randomUUID && crypto.randomUUID()) || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return prefix ? `${prefix}_${u}` : u;
}

// Today's date in YYYY-MM-DD. Optional IANA tz (defaults to America/New_York for PBC ops).
/**
 * The epoch-ms bounds of one ET CALENDAR DAY.
 *
 * `today()` below returns an ET date string, but a day's worth of records has to be selected with
 * timestamps — and `new Date('2026-07-30T00:00:00')` has NO ZONE, so on a Worker (which runs in
 * UTC) it silently means midnight UTC. That is 8 PM the PREVIOUS evening in ET, so an evening
 * shift lands outside its own day and the previous evening's work lands inside it. Everywhere
 * else in this codebase writes the `Z` explicitly; the end-of-day report did not, which is how a
 * driver's whole shift went missing from their own report.
 *
 * Resolved through Intl so EDT/EST is handled without a hardcoded offset. The offset is applied
 * twice because the first guess can land on the far side of a DST switch.
 */
function etOffsetMs(atMs) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const part of f.formatToParts(new Date(atMs))) p[part.type] = part.value;
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - atMs;
}

export function etMidnightMs(dateStr) {
  const utcGuess = Date.parse(`${dateStr}T00:00:00Z`);
  if (!Number.isFinite(utcGuess)) return NaN;
  let ms = utcGuess - etOffsetMs(utcGuess);
  ms = utcGuess - etOffsetMs(ms);
  return ms;
}

/** [start, end) in epoch ms for the given ET date. */
export function etDayBounds(dateStr) {
  const start = etMidnightMs(dateStr);
  const end = etMidnightMs(addEtDays(dateStr, 1));
  return { start, end };
}

/** Shift an ET date string by whole days without tripping over DST. */
export function addEtDays(dateStr, n) {
  const d = new Date(Date.parse(`${dateStr}T12:00:00Z`) + n * 86400000);
  return d.toISOString().slice(0, 10);
}

/** The ET calendar date a timestamp falls on. */
export function etDateOf(ms) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date(ms));
  } catch { return new Date(ms).toISOString().slice(0, 10); }
}

export function today(tz = 'America/New_York') {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// Parse a JSON column safely; returns fallback on null/garbage.
export function parseJson(v, fallback = null) {
  if (v == null) return fallback;
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return fallback; }
}

// Stringify for a JSON-in-TEXT column; null stays null.
export function toJson(v) {
  return v == null ? null : JSON.stringify(v);
}

// Boolean → SQLite integer (0/1).
export const bit = (v) => (v ? 1 : 0);

// First row or null, swallowing "no DB" gracefully for callers that pre-check env.DB.
export async function firstRow(stmt) {
  const r = await stmt.first();
  return r || null;
}
