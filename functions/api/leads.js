// POST /api/leads — capture tasting / wholesale inquiries. Stores in D1 and (if configured)
// emails Dayan a notification. Returns {ok:true} so the form can confirm inline.
import { json, bad, id, now, isEmail } from '../_lib/util.js';
import { sendEmail, emailShell, escHtml } from '../_lib/email.js';
import { limitOr429 } from '../_lib/ratelimit.js';

// Founding Legacy Member program — first N launch-list signups get a founding number.
const FOUNDING_CAP = 50;

// GET /api/leads — public, PII-free: how many Founding Legacy spots are claimed/left.
// Powers the live counter on /launch. Never throws; returns 0/cap if the DB is absent.
export const onRequestGet = async ({ env }) => {
  let claimed = 0;
  if (env.DB) {
    try {
      const r = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE kind='launch'").first();
      claimed = (r && r.n) || 0;
    } catch { /* fall through with 0 */ }
  }
  return json({ ok: true, claimed, cap: FOUNDING_CAP, remaining: Math.max(0, FOUNDING_CAP - claimed) });
};

export const onRequestPost = async ({ request, env }) => {
  // Spam guard: cap form submissions per IP.
  const limited = await limitOr429(env, request, { name: 'leads', limit: 6, windowSec: 60 });
  if (limited) return limited;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const kind = ['wholesale', 'sms', 'launch'].includes(b.kind) ? b.kind : 'tasting';
  const name = (b.name || '').trim().slice(0, 120);
  const email = (b.email || '').trim().slice(0, 160);
  if (!name) return bad('Please enter your name.');
  if (!isEmail(email)) return bad('Please enter a valid email.');

  // Cap free-text to bound storage abuse (mirrors the discipline in checkout/subscriptions).
  const rec = {
    id: id('ld'), kind, name, email,
    phone: (b.phone || '').trim().slice(0, 40) || null,
    company: (b.company || '').trim().slice(0, 120) || null,
    interest: (b.interest || '').trim().slice(0, 120) || null,
    message: (b.message || '').trim().slice(0, 4000) || null,
    source_lang: b.lang === 'es' ? 'es' : 'en',
    sms_consent: b.sms_consent === true || b.sms_consent === 1 ? 1 : 0,
    created_at: now(),
  };

  let stored = false;
  let member = null; // Founding Legacy Member number (launch list only)
  if (env.DB) {
    // For the launch list, dedupe by email so a refresh/re-submit keeps the SAME
    // founding number instead of inflating the counter. Returning visitors get their
    // original rank back.
    if (kind === 'launch') {
      try {
        const existing = await env.DB
          .prepare("SELECT created_at FROM leads WHERE kind='launch' AND lower(email)=lower(?) ORDER BY created_at ASC LIMIT 1")
          .bind(rec.email)
          .first();
        if (existing) {
          const rank = await env.DB
            .prepare("SELECT COUNT(*) AS n FROM leads WHERE kind='launch' AND created_at<=?")
            .bind(existing.created_at)
            .first();
          return json({ ok: true, member: (rank && rank.n) || 1, cap: FOUNDING_CAP, returning: true });
        }
      } catch { /* fall through to normal insert */ }
    }

    await env.DB
      .prepare(
        `INSERT INTO leads (id, kind, name, email, phone, company, interest, message, source_lang, sms_consent, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(rec.id, rec.kind, rec.name, rec.email, rec.phone, rec.company, rec.interest, rec.message, rec.source_lang, rec.sms_consent, rec.created_at)
      .run();
    stored = true;

    if (kind === 'launch') {
      try {
        const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE kind='launch'").first();
        member = (c && c.n) || 1;
      } catch { /* member stays null; page falls back gracefully */ }
    }
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
  return json({ ok: true, member, cap: FOUNDING_CAP });
};
