// Shared-tablet PIN identification: the kitchen device is signed in once; each cook enters
// THEIR own PIN to attribute an action to themselves. Given a PIN, find the active staff
// member whose PIN matches. PINs are hashed per-user (PBKDF2), so we verify against each
// candidate's hash — fine for a small team. Files under _lib are NOT routed.
import { verifyPin, validPinFormat } from './pin.js';

// Returns { id, name, role } for the staff whose PIN matches, or null. Optionally restrict to
// certain roles (e.g. ['kitchen','owner']). Never throws.
export async function matchStaffByPin(env, pin, { roles } = {}) {
  try {
    if (!env || !env.DB || !validPinFormat(pin)) return null;
    const roleList = Array.isArray(roles) ? roles.filter(Boolean) : [];
    const roleClause = roleList.length ? ` AND role IN (${roleList.map(() => '?').join(',')})` : '';
    const { results } = await env.DB.prepare(
      `SELECT id, name, role, pin_hash, pin_salt FROM staff WHERE active = 1 AND pin_hash IS NOT NULL${roleClause}`
    ).bind(...roleList).all();
    for (const s of results || []) {
      // verifyPin is constant-time per candidate; iterate all so a match anywhere succeeds.
      if (s.pin_salt && s.pin_hash && await verifyPin(pin, s.pin_salt, s.pin_hash)) {
        return { id: s.id, name: s.name || null, role: s.role || null };
      }
    }
    return null;
  } catch {
    return null;
  }
}
