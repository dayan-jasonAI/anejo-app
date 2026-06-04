// POST /api/auth/request-link  { email, type?, name?, gym_name?, gym_city?, lang? }
// Issues a 30-min magic-link token and emails it. Does not reveal whether the account exists.
import { json, bad, isEmail, randToken, now, appBaseUrl } from '../../_lib/util.js';
import { sendEmail, magicLinkEmail } from '../../_lib/email.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Server not configured (DB binding missing).', 500);

  let body;
  try { body = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const email = (body.email || '').trim().toLowerCase();
  const type = body.type === 'client' ? 'client' : 'trainer';
  const lang = body.lang === 'es' ? 'es' : 'en';
  if (!isEmail(email)) return bad('Please enter a valid email address.');

  const token = randToken(24);
  const expires = now() + 30 * 60 * 1000;
  await env.DB
    .prepare('INSERT INTO auth_tokens (token, user_email, user_type, expires_at) VALUES (?,?,?,?)')
    .bind(token, email, type, expires)
    .run();

  // Stash optional first-time signup details for trainer creation on verify.
  if (env.SESSIONS && (body.name || body.gym_name || body.gym_city)) {
    await env.SESSIONS.put(
      `signup:${token}`,
      JSON.stringify({ name: body.name || null, gym_name: body.gym_name || null, gym_city: body.gym_city || null }),
      { expirationTtl: 1800 }
    );
  }

  const link = `${appBaseUrl(env, request)}/api/auth/verify?token=${token}`;
  try {
    await sendEmail(env, {
      to: email,
      subject: lang === 'es' ? 'Tu enlace de acceso a Añejo' : 'Your Añejo sign-in link',
      html: magicLinkEmail(link, lang),
    });
  } catch (e) {
    return bad('Could not send the sign-in email: ' + (e.message || 'unknown'), 502);
  }

  return json({ ok: true });
};
