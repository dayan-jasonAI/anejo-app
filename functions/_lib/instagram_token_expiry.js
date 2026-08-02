// Instagram long-lived token expiry — recorded, not read from Meta.
//
// Meta's Graph API has no "how many days left" field worth polling: the only way to learn a
// long-lived token's expiry is /debug_token, which is itself an API call that can fail or be
// rate-limited, and polling it on every HUB page load would mean the warning depends on the very
// token it is trying to warn about. So this module never touches the token. It stores ONE fact —
// the date the owner was told the token expires, from Meta's own dashboard at generation time —
// and does date math against it. That means the warning is only as good as what was recorded, but
// it is a fact instead of a guess, and it degrades to "unknown" instead of a false "all good"
// when nobody has recorded it yet.
//
// Storage: app_settings (0050_app_settings.sql), the same generic key/value table every other
// owner-editable setting uses (ops.*, campaign.*, social.auto_reply). No new table for one date.
import { now } from './util.js';

export const TOKEN_EXPIRY_KEY = 'social.ig_token_expires_at';

// Thresholds for the HUB warning. Instagram gives NO notice before a long-lived token dies —
// publishing, the DM inbox, and insights all go silent at once, and the failure looks identical
// to "nothing is happening" rather than "something is broken". 30 days is enough lead time to
// generate a System User token (docs/INSTAGRAM_TOKEN_SWAP.md) and test it before the old one
// dies; 7 days is "stop deferring this."
export const EXPIRY_WARN_DAYS = 30;
export const EXPIRY_URGENT_DAYS = 7;

/**
 * Read the recorded expiry. Returns { at: epoch-ms|null }. Never throws — a settings-table read
 * failure must not take down the Social page, it must just report "unknown" honestly.
 */
export async function loadTokenExpiry(env) {
  if (!env || !env.DB) return { at: null };
  try {
    const r = await env.DB.prepare('SELECT value FROM app_settings WHERE key=?').bind(TOKEN_EXPIRY_KEY).first();
    const at = r && r.value != null ? Number(r.value) : null;
    return { at: Number.isFinite(at) && at > 0 ? at : null };
  } catch {
    return { at: null };
  }
}

/**
 * Record (or clear, with atMs=null) the expiry the owner was shown when the token was generated
 * or renewed. This is metadata ABOUT the token, entered by a human reading Meta's own dashboard —
 * it never fetches, refreshes, or otherwise touches the live token itself.
 */
export async function saveTokenExpiry(env, atMs, updatedBy) {
  if (!env || !env.DB) return { ok: false };
  const value = Number.isFinite(atMs) && atMs > 0 ? String(Math.floor(atMs)) : null;
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?,?,?,?)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_by=excluded.updated_by, updated_at=excluded.updated_at`
  ).bind(TOKEN_EXPIRY_KEY, value, updatedBy || null, now()).run();
  return { ok: true, at: value ? Number(value) : null };
}

/**
 * Pure date math — no DB, no network — so it is trivial to unit-test every threshold boundary.
 * 'unknown' is a distinct state from 'ok': the two must never be presented the same way, or a
 * never-recorded expiry reads as "everything is fine" right up until it silently is not.
 */
export function tokenExpiryStatus(expiresAtMs, nowMs = Date.now()) {
  const at = Number(expiresAtMs);
  if (!Number.isFinite(at) || at <= 0) return { status: 'unknown', days_left: null };
  // Ceiling: with ~12h left this still reads as "1 day left", not "0" — rounding down would make
  // the last day of a live token look already expired.
  const daysLeft = Math.ceil((at - nowMs) / 86400000);
  if (daysLeft <= 0) return { status: 'expired', days_left: daysLeft };
  if (daysLeft <= EXPIRY_URGENT_DAYS) return { status: 'urgent', days_left: daysLeft };
  if (daysLeft <= EXPIRY_WARN_DAYS) return { status: 'warning', days_left: daysLeft };
  return { status: 'ok', days_left: daysLeft };
}
