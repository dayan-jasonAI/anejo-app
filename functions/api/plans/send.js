// POST /api/plans/send  { plan_id }
// Trainer sends a saved plan to their client: marks it sent and emails the shareable link
// (degrades gracefully to returning the link if Resend isn't configured yet).
import { json, bad, now, appBaseUrl } from '../../_lib/util.js';
import { trainerSession } from '../../_lib/guard.js';
import { sendEmail, emailShell, escHtml } from '../../_lib/email.js';

export const onRequestPost = async ({ request, env }) => {
  const sess = await trainerSession(env, request);
  if (!sess) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const planId = (b.plan_id || '').trim();
  if (!planId) return bad('Missing plan_id.');

  const row = await env.DB.prepare(
    `SELECT p.id, p.public_token, c.id AS client_id, c.email AS client_email, c.name AS client_name, c.trainer_id, c.lang
       FROM plans p JOIN clients c ON c.id = p.client_id WHERE p.id = ?`
  ).bind(planId).first();
  if (!row || row.trainer_id !== sess.uid) return bad('Plan not found.', 404);

  const t = now();
  await env.DB.prepare('UPDATE plans SET status = ?, sent_at = ?, updated_at = ? WHERE id = ?')
    .bind('sent', t, t, planId).run();
  await env.DB.prepare('UPDATE clients SET status = ?, updated_at = ? WHERE id = ?')
    .bind('plan_sent', t, row.client_id).run();

  const link = `${appBaseUrl(env, request)}/plan.html?token=${row.public_token}`;

  let emailed = false;
  if (row.client_email) {
    const es = row.lang === 'es';
    const safeName = escHtml(row.client_name || '');
    const body = es
      ? `<p>Hola ${safeName},</p><p>Tu entrenador preparó tu plan de comidas Añejo personalizado. Revísalo, acéptalo y suscríbete para empezar tus entregas semanales.</p>
         <p style="text-align:center;margin:26px 0"><a href="${link}" style="background:#C08418;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-family:Arial,sans-serif">Revisar y aceptar mi plan</a></p>`
      : `<p>Hi ${safeName},</p><p>Your trainer put together your personalized Añejo meal plan. Review it, accept, and subscribe to start your weekly deliveries.</p>
         <p style="text-align:center;margin:26px 0"><a href="${link}" style="background:#C08418;color:#fff;text-decoration:none;padding:13px 26px;border-radius:999px;font-family:Arial,sans-serif">Review &amp; accept my plan</a></p>`;
    try {
      await sendEmail(env, { to: row.client_email, subject: es ? 'Tu plan Añejo está listo' : 'Your Añejo meal plan is ready', html: emailShell(body) });
      emailed = true;
    } catch (_) { /* Resend not configured yet — trainer can share the link manually */ }
  }

  return json({ ok: true, link, emailed });
};
