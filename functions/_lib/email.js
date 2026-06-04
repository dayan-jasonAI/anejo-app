// Transactional email via Resend.
export async function sendEmail(env, { to, subject, html }) {
  if (!env.RESEND_API_KEY) throw new Error('Email not configured (missing RESEND_API_KEY).');
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
