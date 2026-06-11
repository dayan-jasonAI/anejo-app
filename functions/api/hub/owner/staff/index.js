// /api/hub/owner/staff — owner-only staff management.
//   GET                        → roster (no credential material)
//   POST { op:'create', ... }  → invite/add a staff member (sets an initial PIN)
//   POST { op:'update', id, ...}→ edit role/team/is_lead/active
//   POST { op:'reset_pin', id, pin? } → set/reset a PIN (random if omitted), forces change
import { json, bad, id as genId, now, isEmail } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';
import { newSalt, hashPin, validPinFormat, randomPin } from '../../../../_lib/pin.js';
import { capture } from '../../../../_lib/track.js';
import { sendSms } from '../../../../_lib/twilio.js';

const ROLES = ['owner', 'kitchen', 'driver', 'vendor'];
const TEAMS = ['kitchen', 'delivery', 'training', 'front_office', 'vendors'];

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);
  const res = await env.DB
    .prepare(
      "SELECT id,name,CASE WHEN email LIKE '%@staff.anejo.local' THEN NULL ELSE email END AS email,phone,role,team,is_lead,employment_type,active," +
      "(pin_hash IS NOT NULL) AS has_pin, must_change_pin, last_active_at,locked_until,created_at " +
      "FROM staff ORDER BY active DESC, role, name"
    )
    .all();
  return json({ ok: true, staff: (res && res.results) || [] });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const op = b.op || 'create';
  const t = now();

  if (op === 'create') {
    const name = (b.name || '').trim();
    const role = ROLES.includes(b.role) ? b.role : null;
    const team = TEAMS.includes(b.team) ? b.team : null;
    const email = (b.email || '').trim().toLowerCase();
    const phone = (b.phone || '').trim();
    if (!name) return bad('Name is required.');
    if (!role) return bad('Pick a valid role.');
    if (!email && !phone) return bad('A phone or email is required to sign in.');
    if (email && !isEmail(email)) return bad('That email looks invalid.');

    // Initial PIN: owner-provided or system-generated; staff must change on first login.
    const pin = b.pin ? String(b.pin) : randomPin();
    if (!validPinFormat(pin)) return bad('PIN must be 4–8 digits.');
    const salt = newSalt();
    const hash = await hashPin(pin, salt);

    const sid = genId('stf');
    // The staff table requires a non-null, unique email. Phone-only staff are valid
    // (they sign in by phone + PIN), so synthesize a stable internal placeholder. The
    // UI hides @staff.anejo.local addresses, and login-by-phone is unaffected.
    const emailToStore = email || `${sid}@staff.anejo.local`;
    try {
      await env.DB
        .prepare(
          'INSERT INTO staff (id,email,name,phone,role,team,employment_type,is_lead,lang,active,' +
          'pin_hash,pin_salt,pin_set_at,must_change_pin,invited_by,invited_at,created_at,updated_at) ' +
          'VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10,?11,?12,1,?13,?12,?12,?12)'
        )
        .bind(sid, emailToStore, name, phone || null, role, team,
          b.employment_type || null, b.is_lead ? 1 : 0, b.lang || 'en',
          hash, salt, t, ctx.distinct_id || null)
        .run();
    } catch (e) {
      if (String(e).includes('UNIQUE')) return bad('A staff member with that email already exists.', 409);
      throw e;
    }
    // Lifecycle: user.invited (tracking plan) — channel reflects how they'll sign in.
    await capture(env, {
      event: 'user.invited',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { invited_role: role, channel: phone ? 'sms' : 'email', invited_staff_id: sid },
    });

    // Welcome SMS — ONLY when the PIN was generated server-side (never echo an
    // owner-chosen PIN over SMS) and a phone exists. Safe no-op without Twilio creds.
    if (!b.pin && phone) {
      await sendSms(env, {
        to: phone,
        body: `Welcome to Añejo HUB — sign in at https://anejocateringco.com/login with your phone + PIN ${pin}.`,
      });
    }

    // Return the plaintext PIN ONCE so the owner can relay it (it is never stored or shown again).
    return json({ ok: true, id: sid, initial_pin: pin });
  }

  if (op === 'update') {
    const sid = b.id;
    if (!sid) return bad('Missing staff id.');
    const sets = [];
    const args = [];
    if (b.role !== undefined) { if (!ROLES.includes(b.role)) return bad('Invalid role.'); sets.push('role=?'); args.push(b.role); }
    if (b.team !== undefined) { sets.push('team=?'); args.push(TEAMS.includes(b.team) ? b.team : null); }
    if (b.is_lead !== undefined) { sets.push('is_lead=?'); args.push(b.is_lead ? 1 : 0); }
    if (b.active !== undefined) { sets.push('active=?'); args.push(b.active ? 1 : 0); }
    if (b.name !== undefined && b.name.trim()) { sets.push('name=?'); args.push(b.name.trim()); }
    if (b.phone !== undefined) { sets.push('phone=?'); args.push((b.phone || '').trim() || null); }
    if (!sets.length) return bad('Nothing to update.');
    sets.push('updated_at=?'); args.push(t);
    args.push(sid);
    await env.DB.prepare(`UPDATE staff SET ${sets.join(', ')} WHERE id=?`).bind(...args).run();
    return json({ ok: true });
  }

  if (op === 'reset_pin') {
    const sid = b.id;
    if (!sid) return bad('Missing staff id.');
    const pin = b.pin ? String(b.pin) : randomPin();
    if (!validPinFormat(pin)) return bad('PIN must be 4–8 digits.');
    const salt = newSalt();
    const hash = await hashPin(pin, salt);
    await env.DB
      .prepare('UPDATE staff SET pin_hash=?1, pin_salt=?2, pin_set_at=?3, must_change_pin=1, login_fail_count=0, locked_until=NULL, updated_at=?3 WHERE id=?4')
      .bind(hash, salt, t, sid)
      .run();
    return json({ ok: true, initial_pin: pin });
  }

  return bad('Unknown operation.');
};
