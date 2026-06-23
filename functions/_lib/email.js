// Escape user-supplied values before interpolating into email HTML (prevents HTML/script
// injection in transactional emails). Use on ANY user-controlled field in an email body.
export function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ---- Suppression list (see migrations/0025; populated by /api/webhooks/resend) ----
export function normalizeEmail(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

// Is this address suppressed (hard bounce / spam complaint / unsubscribe)? Fail-OPEN on any DB
// error (returns null = "not suppressed") so an infra hiccup never blocks a legitimate email.
export async function isSuppressed(env, email) {
  if (!env || !env.DB) return null;
  const addr = normalizeEmail(email);
  if (!addr) return null;
  try {
    const row = await env.DB.prepare('SELECT email, reason FROM email_suppressions WHERE email=?').bind(addr).first();
    return row || null;
  } catch { return null; }
}

export async function addSuppression(env, email, reason, detail) {
  if (!env || !env.DB) return false;
  const addr = normalizeEmail(email);
  if (!addr) return false;
  const t = Date.now();
  try {
    await env.DB.prepare(
      `INSERT INTO email_suppressions (email, reason, detail, created_at, updated_at) VALUES (?,?,?,?,?)
       ON CONFLICT(email) DO UPDATE SET reason=excluded.reason, detail=excluded.detail, updated_at=excluded.updated_at`
    ).bind(addr, reason || 'bounced', detail == null ? null : String(detail).slice(0, 160), t, t).run();
    return true;
  } catch { return false; }
}

export async function removeSuppression(env, email) {
  if (!env || !env.DB) return false;
  const addr = normalizeEmail(email);
  if (!addr) return false;
  try { await env.DB.prepare('DELETE FROM email_suppressions WHERE email=?').bind(addr).run(); return true; }
  catch { return false; }
}

// Transactional email via Resend. Skips any address on the suppression list (bounced/complained/
// unsubscribed) to protect sender reputation — pass { bypassSuppression:true } only for a
// deliberate, owner-justified exception. Returns Resend's JSON on send, or {skipped,suppressed}.
export async function sendEmail(env, { to, subject, html, bypassSuppression } = {}) {
  if (!env.RESEND_API_KEY) throw new Error('Email not configured (missing RESEND_API_KEY).');
  const addr = normalizeEmail(to);
  if (!bypassSuppression && addr) {
    const sup = await isSuppressed(env, addr);
    if (sup) return { skipped: true, suppressed: sup.reason };  // never email a suppressed address
  }
  const from = env.EMAIL_FROM || 'Añejo Catering Co. <noreply@anejocateringco.com>';
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
  if (!r.ok) throw new Error('Email send failed: ' + (await r.text()).slice(0, 300));
  return r.json();
}

// Branded wrapper so every Añejo email looks consistent.
export function emailShell(innerHtml) {
  return `<div style="background:#0b1f0a;padding:32px 0;font-family:Georgia,serif">
  <div style="max-width:520px;margin:0 auto;background:#fffdf7;border-radius:16px;overflow:hidden">
    <div style="background:#163414;padding:22px 28px;color:#C8BC6E;font-size:22px;letter-spacing:3px">AÑEJO</div>
    <div style="padding:28px;color:#1a1a1a;font-size:15px;line-height:1.6">${innerHtml}</div>
    <div style="padding:18px 28px;color:#8a8a8a;font-size:12px;border-top:1px solid #eee">
      Añejo Catering Co. · Palm Beach County, FL
    </div>
  </div></div>`;
}

export function magicLinkEmail(link, lang = 'en') {
  const es = lang === 'es';
  const body = es
    ? `<p>Toca el botón para entrar a tu Portal de Entrenadores Añejo. El enlace caduca en 30 minutos.</p>
       <p style="text-align:center;margin:26px 0">
         <a href="${link}" style="background:#C08418;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px">Entrar</a>
       </p>
       <p style="color:#8a8a8a;font-size:13px">Si no solicitaste esto, ignora este correo.</p>`
    : `<p>Tap the button to sign in to your Añejo Trainer Portal. This link expires in 30 minutes.</p>
       <p style="text-align:center;margin:26px 0">
         <a href="${link}" style="background:#C08418;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px">Sign in</a>
       </p>
       <p style="color:#8a8a8a;font-size:13px">If you didn't request this, you can ignore this email.</p>`;
  return emailShell(body);
}
