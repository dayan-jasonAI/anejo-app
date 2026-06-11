// POST /api/auth/pin-login  { identifier, pin }
// Verifies a staff PIN, with per-account lockout + per-IP rate limiting, and on success
// creates a staff session and returns { ok, redirect:'/hub/' } (Set-Cookie attached).
import { json, bad, now } from '../../_lib/util.js';
import { limitOr429 } from '../../_lib/ratelimit.js';
import { createSession, sessionCookie, isSecureRequest } from '../../_lib/session.js';
import { normalizeIdentifier, findStaff } from '../../_lib/login.js';
import { verifyPin } from '../../_lib/pin.js';
import { capture } from '../../_lib/track.js';

const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000; // 15 min lockout after MAX_FAILS

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'pin-login', limit: 15, windowSec: 60 });
  if (limited) return limited;
  if (!env.DB) return bad('Server not configured.', 500);

  let body;
  try { body = await request.json(); } catch { return bad('Invalid request.'); }
  const ident = normalizeIdentifier(body.identifier);
  const pin = String(body.pin || '');
  if (ident.kind === 'unknown' || !pin) return bad('Enter your identifier and PIN.');

  const staff = await findStaff(env, ident);
  // Uniform failure response (don't leak which part was wrong).
  const fail = (msg, code = 401) => json({ ok: false, error: msg }, code);

  if (!staff || !staff.active) return fail('Incorrect login or PIN.');

  const t = now();
  if (staff.locked_until && staff.locked_until > t) {
    const mins = Math.ceil((staff.locked_until - t) / 60000);
    return json({ ok: false, error: `Too many attempts. Try again in ${mins} min.` }, 423);
  }
  if (!staff.pin_hash) return fail('No PIN set yet. Ask the owner to set your PIN.');

  const okPin = await verifyPin(pin, staff.pin_salt, staff.pin_hash);
  if (!okPin) {
    const fails = (staff.login_fail_count || 0) + 1;
    const lockUntil = fails >= MAX_FAILS ? t + LOCK_MS : null;
    await env.DB
      .prepare('UPDATE staff SET login_fail_count=?1, locked_until=?2, updated_at=?3 WHERE id=?4')
      .bind(fails, lockUntil, t, staff.id)
      .run();
    return fail('Incorrect login or PIN.');
  }

  // Success — reset counters, stamp activity, mint session.
  const firstActivation = !staff.activated_at;
  await env.DB
    .prepare('UPDATE staff SET login_fail_count=0, locked_until=NULL, activated_at=COALESCE(activated_at,?1), last_active_at=?1, updated_at=?1 WHERE id=?2')
    .bind(t, staff.id)
    .run();

  // Lifecycle: first-ever successful login → user.activated (tracking plan).
  if (firstActivation) {
    await capture(env, {
      event: 'user.activated',
      distinct_id: staff.id,
      role: staff.role,
      team: staff.team,
      properties: {
        days_since_invite: staff.invited_at ? Math.round((t - staff.invited_at) / 86400000) : null,
        platform: 'pwa',
      },
    });
  }

  const sess = await createSession(env, {
    type: 'staff',
    uid: staff.id,
    role: staff.role,
    team: staff.team,
    email: staff.email,
    is_lead: !!staff.is_lead,
  });

  await capture(env, {
    event: 'user.signed_in',
    distinct_id: staff.id,
    role: staff.role,
    team: staff.team,
    properties: { method: 'pin', platform: 'pwa' },
  });

  return json(
    { ok: true, redirect: '/hub/', must_change_pin: !!staff.must_change_pin },
    200,
    { 'Set-Cookie': sessionCookie(sess, undefined, isSecureRequest(request)) }
  );
};
