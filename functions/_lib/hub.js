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
