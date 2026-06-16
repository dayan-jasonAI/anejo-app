// POST /api/staff/set-pin  { current_pin?, new_pin }
// Authenticated staff changes their own PIN. If a PIN already exists, current_pin must match
// (unless must_change_pin is set, e.g. first login with an owner-issued temp PIN).
import { json, bad, now } from '../../_lib/util.js';
import { currentRole } from '../../_lib/roles.js';
import { newSalt, hashPin, verifyPin, validPinFormat } from '../../_lib/pin.js';

export const onRequestPost = async ({ request, env }) => {
  const ctx = await currentRole(env, request);
  if (!ctx || ctx.type !== 'staff') return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Server not configured.', 500);

  let body;
  try { body = await request.json(); } catch { return bad('Invalid request.'); }
  const newPin = String(body.new_pin || '');
  if (!validPinFormat(newPin)) return bad('PIN must be 6–10 digits.');

  const staff = await env.DB.prepare('SELECT * FROM staff WHERE id=?').bind(ctx.distinct_id).first();
  if (!staff) return json({ error: 'Account not found.' }, 404);

  // If they already have a PIN and aren't being forced to reset, require the current one.
  if (staff.pin_hash && !staff.must_change_pin) {
    const ok = await verifyPin(String(body.current_pin || ''), staff.pin_salt, staff.pin_hash);
    if (!ok) return json({ error: 'Current PIN is incorrect.' }, 403);
  }

  const salt = newSalt();
  const hash = await hashPin(newPin, salt);
  const t = now();
  await env.DB
    .prepare('UPDATE staff SET pin_hash=?1, pin_salt=?2, pin_set_at=?3, must_change_pin=0, login_fail_count=0, locked_until=NULL, updated_at=?3 WHERE id=?4')
    .bind(hash, salt, t, staff.id)
    .run();

  return json({ ok: true });
};
