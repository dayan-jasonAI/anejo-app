// POST /api/leads — capture tasting / wholesale inquiries. Stores in D1 and (if configured)
// emails Dayan a notification. Returns {ok:true} so the form can confirm inline.
import { json, bad, id, now, isEmail } from '../_lib/util.js';
import { sendEmail, emailShell, escHtml } from '../_lib/email.js';
import { sendSms } from '../_lib/twilio.js';
import { limitOr429 } from '../_lib/ratelimit.js';

// Founding Legacy Member program — first N launch-list signups get a founding number.
const FOUNDING_CAP = 100;

// Best-guess E.164 for a US number (Twilio Messaging Service prefers it). Falls back to digits.
function toE164US(p) {
  const raw = String(p == null ? '' : p).trim();
  if (raw.startsWith('+')) return raw;
  const d = raw.replace(/[^0-9]/g, '');
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return d ? '+' + d : null;
}

// Instant welcome to a new launch-list signup: branded email (all) + SMS (consented only).
// Best-effort — every failure is swallowed so it can run in waitUntil without risk. Returning
// signups (dedupe path) never reach here, so no one is messaged twice.
async function sendLaunchWelcome(env, rec, member) {
  const es = rec.source_lang === 'es';
  const first = (rec.name || '').split(/\s+/)[0] || (es ? 'Hola' : 'there');
  const founding = member && member <= FOUNDING_CAP;
  const numTxt = founding ? (es ? `Miembro Fundador de Legado #${member}` : `Founding Legacy Member #${member}`) : '';
  const resv = rec.message && /reservation/i.test(rec.message)
    ? rec.message.replace(/^Opening-day reservation:\s*/i, '')
    : '';

  // Email (best-effort)
  if (env.RESEND_API_KEY && isEmail(rec.email)) {
    try {
      const base = (env.APP_BASE_URL || 'https://anejocateringco.com').replace(/\/$/, '');
      const profileUrl = `${base}/client/dashboard`;
      const btn = (label) =>
        `<p style="margin:22px 0"><a href="${profileUrl}" style="background:#C6A85B;color:#0d2419;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;letter-spacing:.04em">${label}</a></p>`;
      const subject = founding
        ? (es ? '🌿 Eres Miembro Fundador de Legado' : "🌿 You're a Founding Legacy Member")
        : (es ? '🌿 Estás en la lista de Añejo' : "🌿 You're on the Añejo launch list");
      const lines = es
        ? [
            `<p>Hola ${escHtml(first)},</p>`,
            founding
              ? `<p>¡Bienvenido a la familia! Eres <strong>${escHtml(numTxt)}</strong> — uno de los primeros 100 en unirte a Añejo Catering Co.</p>`
              : `<p>¡Gracias por unirte! Estás en la lista de apertura de Añejo Catering Co.</p>`,
            `<p>Abrimos el <strong>miércoles 22 de julio</strong> en Palm Beach County. Recibirás tu enlace de pedido <strong>antes que nadie</strong> — y los bowls del primer día se reservan para esta lista.</p>`,
            resv ? `<p>Anotamos tus bowls para el día de apertura: <strong>${escHtml(resv)}</strong>.</p>` : '',
            btn('Ver mi perfil de cliente →'),
            `<p style="font-size:13px;color:#6b7269">Inicia sesión con este correo (${escHtml(rec.email)}) — te enviamos un enlace mágico, sin contraseña.</p>`,
            `<p>Clean Fuel. Bold Flavor. Built for Life. 🌿</p>`,
          ]
        : [
            `<p>Hi ${escHtml(first)},</p>`,
            founding
              ? `<p>Welcome to the family! You're <strong>${escHtml(numTxt)}</strong> — one of the first 100 to join Añejo Catering Co.</p>`
              : `<p>Thanks for joining! You're on the Añejo Catering Co. launch list.</p>`,
            `<p>We open <strong>Wednesday, July 22</strong> across Palm Beach County. You'll get your order link <strong>before anyone else</strong> — and the first day's bowls are held for this list.</p>`,
            resv ? `<p>We've noted your opening-day bowls: <strong>${escHtml(resv)}</strong>.</p>` : '',
            btn('View my client profile →'),
            `<p style="font-size:13px;color:#6b7269">Sign in with this email (${escHtml(rec.email)}) — we'll send a magic link, no password needed.</p>`,
            `<p>Clean Fuel. Bold Flavor. Built for Life. 🌿</p>`,
          ];
      await sendEmail(env, { to: rec.email, subject, html: emailShell(lines.join('')) });
    } catch { /* swallow — welcome is best-effort */ }
  }

  // SMS (best-effort; only to signups who gave consent AND left a number).
  // Held OFF until Twilio auth is fixed — flip env LAUNCH_WELCOME_SMS='1' to enable.
  if (env.LAUNCH_WELCOME_SMS === '1' && rec.sms_consent && rec.phone) {
    const to = toE164US(rec.phone);
    if (to) {
      const body = es
        ? `Añejo Catering Co.: ${founding ? `¡Eres Miembro Fundador de Legado #${member}! ` : '¡Estás en la lista! '}🌿 Abrimos el miér 22/7 — recibirás tu enlace de pedido antes que nadie. Responde STOP para cancelar.`
        : `Añejo Catering Co.: ${founding ? `You're Founding Legacy Member #${member}! ` : "You're on the list! "}🌿 We open Wed 7/22 — you'll get your order link before anyone else. Reply STOP to opt out.`;
      try { await sendSms(env, { to, body }); } catch { /* swallow */ }
    }
  }
}

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

export const onRequestPost = async ({ request, env, waitUntil }) => {
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
      // Instant welcome — deferred so it never delays the response. Email sends now;
      // the SMS half stays gated inside sendLaunchWelcome (LAUNCH_WELCOME_SMS) until Twilio is fixed.
      const welcome = sendLaunchWelcome(env, rec, member).catch(() => {});
      if (typeof waitUntil === 'function') waitUntil(welcome);
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
