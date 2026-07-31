// POST /api/partner-apply — the application behind /affiliate. PUBLIC, and deliberately dumb:
// it stores an application and tells the owner. It quotes no terms, promises nothing, and grants
// nothing — approval, rates and the welcome email all stay owner-driven in the HUB partners desk.
//
// Public + writes to D1 means two gates before anything else: a rate limit (an unauthenticated
// form is a spam magnet) and server-side validation that does not trust the page's own checks.
import { json, bad, id, now } from '../_lib/util.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { raiseAlert } from '../_lib/alerts.js';
import { sendPushTickle } from '../_lib/push.js';

const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
const clean = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

// Same privacy posture as link_clicks: a salted hash for abuse triage, never the raw IP.
async function ipHash(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || '';
  if (!ip) return null;
  const salt = env.IP_HASH_SALT || 'anejo-links-v1';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + ip));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const onRequestPost = async ({ request, env }) => {
  // 5 per hour per IP: a human applies once, maybe twice after a typo. More is a script.
  const limited = await limitOr429(env, request, { name: 'partner-apply', limit: 5, windowSec: 3600 });
  if (limited) return limited;
  if (!env.DB) return bad('Please email dayan@anejocateringco.com — the form is briefly down.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid form data.'); }

  const type = b.type === 'gym_trainer' ? 'gym_trainer' : 'creator';
  const name = clean(b.name, 120);
  const email = clean(b.email, 160).toLowerCase();
  const instagram = clean(b.instagram, 80).replace(/^@/, '');
  const reason = clean(b.reason, 1000);

  if (!name) return bad('Please tell us your name.');
  if (!isEmail(email)) return bad('Please enter a valid email so we can reply.');
  if (!instagram && type === 'creator') return bad('Please include your Instagram handle — it is the first thing we look at.');
  if (!reason) return bad('Tell us briefly why you want to partner with Añejo.');

  const appId = id('papp');
  const t = now();
  try {
    await env.DB.prepare(
      `INSERT INTO partner_applications
         (id, type, name, email, phone, instagram, other_socials, area, audience_size, heard_from, reason, status, ip_hash, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,'new',?,?)`
    ).bind(
      appId, type, name, email,
      clean(b.phone, 40) || null, instagram || null, clean(b.other_socials, 300) || null,
      clean(b.area, 120) || null, clean(b.audience_size, 40) || null,
      clean(b.heard_from, 300) || null, reason, await ipHash(env, request), t
    ).run();
  } catch (e) {
    return bad('Could not save your application — please email dayan@anejocateringco.com. ' + String((e && e.message) || '').slice(0, 80), 500);
  }

  // The owner hears about every application; the applicant is promised only a review.
  try {
    await raiseAlert(env, {
      type: 'partner_application',
      severity: 'info',
      title: `Partner application: ${name}${instagram ? ' (@' + instagram + ')' : ''}`,
      body: `${type === 'gym_trainer' ? 'Gym/Trainer' : 'Creator'} · ${email}${b.area ? ' · ' + clean(b.area, 60) : ''} — review in the Partners desk.`,
      dedupe_key: `papp:${email}`,
    });
  } catch { /* the row is stored either way */ }
  try { await sendPushTickle(env, { roles: ['owner'] }); } catch { /* best-effort */ }

  return json({ ok: true, id: appId });
};
