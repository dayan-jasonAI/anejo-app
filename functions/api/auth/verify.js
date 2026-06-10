// GET /api/auth/verify?token=...  Validates a magic link, creates the trainer on first
// sign-in, sets a session cookie, and redirects into the app.
import { id, now, affiliateCode, appBaseUrl } from '../../_lib/util.js';
import { createSession, sessionCookie, isSecureRequest } from '../../_lib/session.js';

const redirect = (url, headers = {}) =>
  new Response(null, { status: 302, headers: { Location: url, ...headers } });

export const onRequestGet = async ({ request, env }) => {
  const base = appBaseUrl(env, request);
  const secure = isSecureRequest(request);
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return redirect(`${base}/portal?error=missing_token`);
  if (!env.DB) return redirect(`${base}/portal?error=server`);

  const row = await env.DB
    .prepare('SELECT token, user_email, user_type, expires_at, used_at FROM auth_tokens WHERE token=?')
    .bind(token)
    .first();
  if (!row || row.used_at || row.expires_at < now()) {
    return redirect(`${base}/portal?error=invalid_or_expired`);
  }
  await env.DB.prepare('UPDATE auth_tokens SET used_at=? WHERE token=?').bind(now(), token).run();

  if (row.user_type === 'trainer') {
    let trainer = await env.DB.prepare('SELECT id FROM trainers WHERE email=?').bind(row.user_email).first();
    if (!trainer) {
      const tid = id('tr');
      let extra = {};
      if (env.SESSIONS) {
        const stash = await env.SESSIONS.get(`signup:${token}`);
        if (stash) { try { extra = JSON.parse(stash); } catch { /* ignore */ } await env.SESSIONS.delete(`signup:${token}`); }
      }
      await env.DB
        .prepare('INSERT INTO trainers (id, email, name, gym_name, gym_city, phone, affiliate_code, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)')
        .bind(tid, row.user_email, extra.name || null, extra.gym_name || null, extra.gym_city || null, extra.phone || null, affiliateCode(), now(), now())
        .run();
      trainer = { id: tid };
    }
    const sess = await createSession(env, { uid: trainer.id, type: 'trainer', email: row.user_email });
    return redirect(`${base}/trainer/dashboard`, { 'Set-Cookie': sessionCookie(sess, undefined, secure) });
  }

  if (row.user_type === 'staff') {
    // Staff are seeded by the owner (we do NOT auto-create them). The magic link only
    // activates an existing, active staff row and drops them into the HUB shell.
    const staff = await env.DB
      .prepare('SELECT id, role, team, active, is_lead FROM staff WHERE email=?')
      .bind(row.user_email)
      .first();
    if (!staff || !staff.active) {
      return redirect(`${base}/portal?error=no_staff_account`);
    }
    await env.DB
      .prepare('UPDATE staff SET activated_at=COALESCE(activated_at,?1), last_active_at=?1, updated_at=?1 WHERE id=?2')
      .bind(now(), staff.id)
      .run();
    const sess = await createSession(env, {
      type: 'staff',
      uid: staff.id,
      role: staff.role,
      team: staff.team,
      email: row.user_email,
      is_lead: !!staff.is_lead,
    });
    return redirect(`${base}/hub/`, { 'Set-Cookie': sessionCookie(sess, undefined, secure) });
  }

  // client flow (full member auth lands with the client dashboard)
  const sess = await createSession(env, { type: 'client', email: row.user_email });
  return redirect(`${base}/client/dashboard`, { 'Set-Cookie': sessionCookie(sess, undefined, secure) });
};
