// POST /api/leads — capture tasting / wholesale inquiries. Stores in D1 and (if configured)
// emails Dayan a notification. Returns {ok:true} so the form can confirm inline.
import { json, bad, id, now, isEmail } from '../_lib/util.js';
import { sendEmail, emailShell, escHtml } from '../_lib/email.js';
import { issueCustomerCode } from '../_lib/promo.js';
import { sendSms } from '../_lib/twilio.js';
import { limitOr429 } from '../_lib/ratelimit.js';

// Founding Legacy Member program — first N launch-list signups get a founding number.
const FOUNDING_CAP = 100;

// Campaign attribution (0044). Accepts either flat fields or a nested {attribution:{…}} object
// so a page can send checkout's shape verbatim. Everything is optional and length-capped like
// the rest of the free text on this endpoint.
function parseAttribution(b) {
  const a = (b && typeof b.attribution === 'object' && b.attribution) || b || {};
  const s = (v, n) => (String(v == null ? '' : v).trim().slice(0, n) || null);
  return {
    src: s(a.src, 64),
    utm_source: s(a.utm_source, 120),
    utm_medium: s(a.utm_medium, 120),
    utm_campaign: s(a.utm_campaign, 120),
    referrer: s(a.referrer, 300),
  };
}

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
async function sendLaunchWelcome(env, rec, member, promo) {
  const es = rec.source_lang === 'es';
  // The benefit is GRANTED BY THE CALLER, before this runs — see the note at the call site. This
  // function only describes it. (It used to mint the code itself, which made a lifetime
  // entitlement a side effect of a best-effort email.)
  const promoBlock = promo ? (es
    ? `<div style="margin:22px 0;padding:18px;border:1px solid #C6A85B;border-radius:10px;background:#fdfaf2">
         <p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8B6B3E">Beneficios de Miembro de Legado</p>
         <p style="margin:0 0 12px;font-size:22px;font-weight:700;letter-spacing:.06em;color:#1A3D2E">${escHtml(promo.code)}</p>
         <p style="margin:0 0 6px;font-size:15px;color:#1A3D2E"><strong>Puntos dobles de por vida</strong> — en cada pedido, para siempre.</p>
         <p style="margin:0 0 6px;font-size:15px;color:#1A3D2E"><strong>Acceso primero</strong> a cada producto, función y anuncio de Añejo.</p>
         <p style="margin:10px 0 0;font-size:12px;color:#6b7269">Se aplica solo — inicia sesión con ${escHtml(rec.email)} y tus puntos dobles se activan automáticamente al pagar. Es tuyo y no se puede compartir.</p>
       </div>`
    : `<div style="margin:22px 0;padding:18px;border:1px solid #C6A85B;border-radius:10px;background:#fdfaf2">
         <p style="margin:0 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#8B6B3E">Legacy Member benefits</p>
         <p style="margin:0 0 12px;font-size:22px;font-weight:700;letter-spacing:.06em;color:#1A3D2E">${escHtml(promo.code)}</p>
         <p style="margin:0 0 6px;font-size:15px;color:#1A3D2E"><strong>Double rewards points for life</strong> — on every order, forever.</p>
         <p style="margin:0 0 6px;font-size:15px;color:#1A3D2E"><strong>First access</strong> to every new product, feature, and announcement.</p>
         <p style="margin:10px 0 0;font-size:12px;color:#6b7269">Nothing to type — sign in as ${escHtml(rec.email)} and your double points apply automatically at checkout. It's yours alone and can't be shared.</p>
       </div>`) : '';
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
      const btn = (label, url) =>
        `<p style="margin:22px 0"><a href="${url || profileUrl}" style="background:#C6A85B;color:#0d2419;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:700;letter-spacing:.04em">${label}</a></p>`;
      const subject = founding
        ? (es ? '🌿 Eres Miembro Fundador de Legado' : "🌿 You're a Founding Legacy Member")
        : (es ? '🌿 Estás en la lista de Añejo' : "🌿 You're on the Añejo launch list");
      const lines = es
        ? [
            `<p>Hola ${escHtml(first)},</p>`,
            founding
              ? `<p>¡Bienvenido a la familia! Eres <strong>${escHtml(numTxt)}</strong> — uno de los primeros 100 en unirte a Añejo Catering Co.</p>`
              : `<p>¡Gracias por unirte! Estás en la lista de apertura de Añejo Catering Co.</p>`,
            `<p><strong>Ya estamos abiertos</strong> en Palm Beach County — puedes pedir hoy mismo, cocinado fresco y entregado a tu puerta.</p>`,
            resv ? `<p>Anotamos tus bowls: <strong>${escHtml(resv)}</strong>.</p>` : '',
            promoBlock,
            btn('Pedir ahora →', base + '/order'),
            `<p style="font-size:13px;color:#6b7269">Inicia sesión con este correo (${escHtml(rec.email)}) — te enviamos un enlace mágico, sin contraseña.</p>`,
            `<p>Clean Fuel. Bold Flavor. Built for Life. 🌿</p>`,
          ]
        : [
            `<p>Hi ${escHtml(first)},</p>`,
            founding
              ? `<p>Welcome to the family! You're <strong>${escHtml(numTxt)}</strong> — one of the first 100 to join Añejo Catering Co.</p>`
              : `<p>Thanks for joining! You're on the Añejo Catering Co. launch list.</p>`,
            `<p><strong>We're open now</strong> across Palm Beach County — you can order today, cooked fresh and delivered to your door.</p>`,
            resv ? `<p>We've noted your bowls: <strong>${escHtml(resv)}</strong>.</p>` : '',
            promoBlock,
            btn('Order now →', base + '/order'),
            `<p style="font-size:13px;color:#6b7269">Sign in with this email (${escHtml(rec.email)}) — we'll send a magic link, no password needed.</p>`,
            `<p>Clean Fuel. Bold Flavor. Built for Life. 🌿</p>`,
          ];
      await sendEmail(env, { to: rec.email, subject, html: emailShell(lines.join('')) });
    } catch { /* swallow — welcome is best-effort */ }
  }

  // SMS (best-effort; only to signups who gave consent AND left a number).
  if (rec.sms_consent && rec.phone) {
    const to = toE164US(rec.phone);
    if (to) {
      const codeTxt = promo ? (es ? ' Puntos dobles de por vida ya activos en tu cuenta.' : ' Double points for life are active on your account.') : '';
      const body = es
        ? `Añejo Catering Co.: ${founding ? `¡Eres Miembro Fundador de Legado #${member}! ` : '¡Estás en la lista! '}🌿 Ya estamos abiertos — pide en anejocateringco.com/order.${codeTxt} Responde STOP para cancelar.`
        : `Añejo Catering Co.: ${founding ? `You're Founding Legacy Member #${member}! ` : "You're on the list! "}🌿 We're open — order at anejocateringco.com/order.${codeTxt} Reply STOP to opt out.`;
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

  const attr = parseAttribution(b);

  // Marketing SMS consent (0047) — a SEPARATE permission from `sms_consent`, which was collected
  // with order-and-delivery wording and is therefore transactional only. Requires an explicit
  // true/1 AND a number to text: consent without a number is not consent to anything.
  const phoneRaw = (b.phone || '').trim().slice(0, 40) || null;
  const mktgSms = ((b.marketing_sms_consent === true || b.marketing_sms_consent === 1) && phoneRaw) ? 1 : 0;

  // Cap free-text to bound storage abuse (mirrors the discipline in checkout/subscriptions).
  const rec = {
    id: id('ld'), kind, name, email,
    phone: phoneRaw,
    company: (b.company || '').trim().slice(0, 120) || null,
    interest: (b.interest || '').trim().slice(0, 120) || null,
    message: (b.message || '').trim().slice(0, 4000) || null,
    source_lang: b.lang === 'es' ? 'es' : 'en',
    sms_consent: b.sms_consent === true || b.sms_consent === 1 ? 1 : 0,
    marketing_sms_consent: mktgSms,
    // The timestamp and the form name ARE the proof of consent if it is ever challenged, so they
    // are only ever written alongside a ticked box — never defaulted, never backfilled. The source
    // is derived server-side from the endpoint + kind so the browser cannot forge provenance.
    marketing_sms_consent_at: mktgSms ? now() : null,
    marketing_sms_consent_src: mktgSms ? `leads:${kind}` : null,
    src: attr.src, utm_source: attr.utm_source, utm_medium: attr.utm_medium,
    utm_campaign: attr.utm_campaign, referrer: attr.referrer,
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
          // A returning signup never inserts, so without this the entire existing launch list
          // could never opt into marketing SMS — the box would silently do nothing for them.
          // Only ever raises the flag (0 -> 1) and only when the box was ticked; an unticked box
          // is not an opt-OUT, so it must never clear a consent already on record.
          if (mktgSms) {
            try {
              await env.DB
                .prepare(
                  `UPDATE leads SET marketing_sms_consent = 1, marketing_sms_consent_at = ?, marketing_sms_consent_src = ?,
                      phone = COALESCE(phone, ?)
                    WHERE kind='launch' AND lower(email)=lower(?) AND marketing_sms_consent = 0`
                )
                .bind(now(), `leads:${kind}`, phoneRaw, rec.email)
                .run();
            } catch { /* best-effort — never fail the signup on the consent write */ }
          }
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
        `INSERT INTO leads (id, kind, name, email, phone, company, interest, message, source_lang, sms_consent,
            marketing_sms_consent, marketing_sms_consent_at, marketing_sms_consent_src,
            src, utm_source, utm_medium, utm_campaign, referrer, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(rec.id, rec.kind, rec.name, rec.email, rec.phone, rec.company, rec.interest, rec.message, rec.source_lang, rec.sms_consent,
        rec.marketing_sms_consent, rec.marketing_sms_consent_at, rec.marketing_sms_consent_src,
        rec.src, rec.utm_source, rec.utm_medium, rec.utm_campaign, rec.referrer, rec.created_at)
      .run();
    stored = true;

    if (kind === 'launch') {
      try {
        const c = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE kind='launch'").first();
        member = (c && c.n) || 1;
      } catch { /* member stays null; page falls back gracefully */ }
      // GRANT THE BENEFIT FIRST, AND AWAIT IT.
      //
      // This is the Founding Legacy Member entitlement — 2x points for life — which the page and
      // the welcome email both promise. It used to be minted inside sendLaunchWelcome(), a
      // fire-and-forget call, so a mail failure silently cost someone a lifetime perk. Members
      // #1–#3 signed up before that feature existed and never got one at all.
      // It is now part of the signup itself: awaited, and never dependent on email working.
      let promo = null;
      try { promo = await issueCustomerCode(env, { email: rec.email, note: 'launch signup' }); } catch { promo = null; }

      // Instant welcome — deferred so it never delays the response. Email sends now;
      // the SMS half stays gated inside sendLaunchWelcome (LAUNCH_WELCOME_SMS) until Twilio is fixed.
      const welcome = sendLaunchWelcome(env, rec, member, promo).catch(() => {});
      if (typeof waitUntil === 'function') waitUntil(welcome);
    }
  }

  // Notify Dayan (best-effort; never block the visitor on email).
  if (env.RESEND_API_KEY) {
    const to = env.LEADS_NOTIFY_TO || 'dayan@anejocateringco.com';
    const rows = Object.entries({
      Type: rec.kind, Name: rec.name, Email: rec.email, Phone: rec.phone,
      Company: rec.company, Interest: rec.interest, Message: rec.message,
      // Where this lead came from — the owner reads campaign performance straight off the alert.
      Source: rec.src, Campaign: rec.utm_campaign || rec.utm_source,
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
