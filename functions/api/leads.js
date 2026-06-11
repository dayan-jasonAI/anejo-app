// POST /api/leads — capture tasting / wholesale inquiries. Stores in D1 and (if configured)
// emails Dayan a notification. Returns {ok:true} so the form can confirm inline.
import { json, bad, id, now, isEmail } from '../_lib/util.js';
import { sendEmail, emailShell, escHtml } from '../_lib/email.js';
import { limitOr429 } from '../_lib/ratelimit.js';

export const onRequestPost = async ({ request, env }) => {
  // Spam guard: cap form submissions per IP.
  const limited = await limitOr429(env, request, { name: 'leads', limit: 6, windowSec: 60 });
  if (limited) return limited;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const kind = b.kind === 'wholesale' ? 'wholesale' : 'tasting';
  const name = (b.name || '').trim();
  const email = (b.email || '').trim();
  if (!name) return bad('Please enter your name.');
  if (!isEmail(email)) return bad('Please enter a valid email.');

  const rec = {
    id: id('ld'), kind, name, email,
    phone: (b.phone || '').trim() || null,
    company: (b.company || '').trim() || null,
    interest: (b.interest || '').trim() || null,
    message: (b.message || '').trim() || null,
    source_lang: b.lang === 'es' ? 'es' : 'en',
    sms_consent: b.sms_consent === true || b.sms_consent === 1 ? 1 : 0,
    created_at: now(),
  };

  let stored = false;
  if (env.DB) {
    await env.DB
      .prepare(
        `INSERT INTO leads (id, kind, name, email, phone, company, interest, message, source_lang, sms_consent, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(rec.id, rec.kind, rec.name, rec.email, rec.phone, rec.company, rec.interest, rec.message, rec.source_lang, rec.sms_consent, rec.created_at)
      .run();
    stored = true;
  }

  // Notify Dayan (best-effort; never block the visitor on email).
  if (env.RESEND_API_KEY) {
    const to = env.LEADS_NOTIFY_TO || 'dayan@anejocateringco.com';
    const rows = Object.entries({
      Type: rec.kind, Name: rec.name, Email: rec.email, Phone: rec.phone,
      Company: rec.company, Interest: rec.interest, Message: rec.message,
    }).filter(([, v]) => v).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#8a8a8a">${escHtml(k)}</td><td>${escHtml(v)}</td></tr>`).join('');
    try {
      await sendEmail(env, {
        to,
        subject: `New ${rec.kind} inquiry — ${rec.name}`.slice(0, 120),
        html: emailShell(`<p>New ${rec.kind} inquiry from the website:</p><table>${rows}</table>`),
      });
    } catch { /* swallow — the lead is already stored */ }
  }

  if (!stored && !env.RESEND_API_KEY) {
    return bad('Inbox not configured yet.', 503);
  }
  return json({ ok: true });
};
