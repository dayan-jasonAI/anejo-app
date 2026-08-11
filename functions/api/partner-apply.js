// POST /api/partner-apply — the application behind /affiliate. PUBLIC, and deliberately dumb:
// it stores an application and tells the owner. It quotes no terms, promises nothing, and grants
// nothing — approval, rates and the welcome email all stay owner-driven in the HUB partners desk.
//
// Public + writes to D1 means two gates before anything else: a rate limit (an unauthenticated
// form is a spam magnet) and server-side validation that does not trust the page's own checks.
import { json, bad, id, now, appBaseUrl } from '../_lib/util.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { raiseAlert } from '../_lib/alerts.js';
import { sendPushTickle } from '../_lib/push.js';
import { sendEmail, emailShell, escHtml } from '../_lib/email.js';
import { sendSms } from '../_lib/twilio.js';

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
      alert_type: 'partner_application',
      severity: 'info',
      title: `Partner application: ${name}${instagram ? ' (@' + instagram + ')' : ''}`,
      body: `${type === 'gym_trainer' ? 'Gym/Trainer' : 'Creator'} · ${email}${b.area ? ' · ' + clean(b.area, 60) : ''} — review in the Partners desk.`,
      dedupe_key: `papp:${email}`,
    });
  } catch { /* the row is stored either way */ }
  try { await sendPushTickle(env, { roles: ['owner'] }); } catch { /* best-effort */ }

  // Applicant hears back INSTANTLY — email always, SMS if they left a phone. Transactional
  // (they just filled out our form), on-brand, promises only a review. Best-effort, never fails the submit.
  const applicantPhone = clean(b.phone, 40);
  try {
    if (env.RESEND_API_KEY) {
      await sendEmail(env, {
        to: email,
        subject: 'We got your Añejo partner application 🌿',
        html: emailShell([
          `<p>Hi ${escHtml(name.split(/\s+/)[0] || 'there')},</p>`,
          `<p>Thanks for applying to partner with <strong>Añejo Catering Co.</strong> — we got it, and a real person (not a bot) reviews every application personally.</p>`,
          `<p>We look at your Instagram first${instagram ? ` (<strong>@${escHtml(instagram)}</strong>)` : ''}, so make sure your best food content is easy to find. If it's a fit, you'll hear back with your affiliate code, your link, and exactly how the income works.</p>`,
          `<p>Hang tight — we'll be in touch soon.</p>`,
          `<p>— The Añejo Team<br><em>Clean Fuel. Bold Flavor. Built for Life.</em></p>`,
        ].join('')),
      });
    }
  } catch { /* best-effort */ }
  try {
    if (applicantPhone) {
      await sendSms(env, { to: applicantPhone, body: `Añejo Catering Co.: got your partner application! We review every one personally and will reach out soon with next steps. Reply STOP to opt out.` });
    }
  } catch { /* best-effort */ }

  // Owner gets an email + SMS on top of the push/alert — the whole card is here, no retyping.
  try {
    const base = appBaseUrl(env, request).replace(/\/$/, '');
    const ownerTo = env.OWNER_EMAIL || 'dayan@anejocateringco.com';
    if (env.RESEND_API_KEY) {
      await sendEmail(env, {
        to: ownerTo,
        subject: `New partner application: ${name}${instagram ? ' (@' + instagram + ')' : ''}`,
        html: emailShell([
          `<p><strong>${escHtml(type === 'gym_trainer' ? 'Gym / Trainer' : 'Creator')} application</strong></p>`,
          `<p><strong>${escHtml(name)}</strong>${instagram ? ` · <a href="https://instagram.com/${escHtml(instagram)}">@${escHtml(instagram)}</a>` : ''}<br>` +
            `${escHtml(email)}${applicantPhone ? ' · ' + escHtml(applicantPhone) : ''}` +
            `${b.area ? '<br>Area: ' + escHtml(clean(b.area, 60)) : ''}${b.audience_size ? '<br>Audience: ' + escHtml(clean(b.audience_size, 40)) : ''}</p>`,
          `<p style="color:#3d4a41"><em>${escHtml(reason)}</em></p>`,
          `<p style="margin-top:20px"><a href="${base}/hub/owner/partners.html" style="background:#1A3D2E;color:#fff;text-decoration:none;padding:12px 22px;border-radius:999px">Review &amp; approve in the Partners desk →</a></p>`,
        ].join('')),
      });
    }
    if (env.OWNER_PHONE) {
      await sendSms(env, { to: env.OWNER_PHONE, body: `Añejo: new ${type === 'gym_trainer' ? 'gym/trainer' : 'creator'} application — ${name}${instagram ? ' (@' + instagram + ')' : ''}. Review + approve in the HUB Partners desk.` });
    }
  } catch { /* best-effort */ }

  return json({ ok: true, id: appId });
};
