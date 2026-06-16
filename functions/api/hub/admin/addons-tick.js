// POST /api/hub/admin/addons-tick
//   Morning-of invite: for each of TODAY's subscription delivery orders whose add-on window
//   is still open and that hasn't been invited yet, mint a public add-on token and message
//   the client (SMS + email; the client portal shows the same offer in-app) inviting them to
//   add a drink / protein shake / extra bowl to that day's drop. Idempotent (addon_offered_at).
//
// GATED: does nothing unless env.ADDONS_ENABLED === '1'. Auth: owner session OR X-Cron-Key.
// Folded into the existing daily cron slot — no new trigger.
import { json, bad, randToken, appBaseUrl } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { captureSystem } from '../../../_lib/track.js';
import { addonsEnabled, addonOpen, catalogFor } from '../../../_lib/addons.js';
import { notifyClientById } from '../../../_lib/notify.js';
import { sendEmail, emailShell, escHtml } from '../../../_lib/email.js';

function ctEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cronAuthed(request, env) {
  const k = request.headers.get('x-cron-key');
  return !!(env.CRON_KEY && k && ctEq(k, env.CRON_KEY));
}
function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  if (!cronAuthed(request, env)) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }
  if (!addonsEnabled(env)) return json({ ok: true, skipped: 'disabled', offered: 0 });

  const nowMs = Date.now();
  const today = etToday(nowMs);
  const base = appBaseUrl(env, request);
  const catalog = catalogFor(env);
  const catalogLine = catalog.map((c) => c.name.replace(/ \(.*\)/, '')).join(', ');

  let rows = [];
  try {
    const res = await env.DB.prepare(
      `SELECT o.id, o.delivery_date, o.delivery_window, o.customer_name,
              s.client_id, c.email AS client_email
         FROM orders o
         JOIN subscriptions s ON s.id = o.subscription_id
         LEFT JOIN clients c ON c.id = s.client_id
        WHERE o.subscription_id IS NOT NULL
          AND o.delivery_date = ?
          AND o.addon_offered_at IS NULL
        LIMIT 300`
    ).bind(today).all();
    rows = (res && res.results) || [];
  } catch (e) {
    return json({ ok: false, offered: 0, reason: (e && e.message) || 'query_failed' });
  }

  let offered = 0;
  for (const o of rows) {
    if (!addonOpen(env, o.delivery_date, o.delivery_window, nowMs, today)) continue; // cutoff passed
    const token = randToken(20);
    const t = Date.now();
    try {
      await env.DB.prepare('UPDATE orders SET addon_token = ?, addon_offered_at = ?, updated_at = ? WHERE id = ? AND addon_offered_at IS NULL')
        .bind(token, t, t, o.id).run();
    } catch { continue; }

    const link = `${base}/add-ons?t=${token}`;
    const win = o.delivery_window === 'dinner' ? 'dinner' : 'lunch';

    // SMS (consent-gated + no-op safe).
    try {
      await notifyClientById(env, o.client_id,
        `Añejo: Add something to today's ${win} delivery? ${catalogLine} — tap to add before we cook: ${link} Reply STOP to opt out.`);
    } catch { /* never fail the tick on a message */ }

    // Email (works today via Resend).
    if (o.client_email) {
      try {
        const html = emailShell(
          `<h2 style="margin:0 0 8px">Add to today's delivery?</h2>
           <p>Hi ${escHtml(o.customer_name || 'there')}, your ${escHtml(win)} bowl is on the way. Want to add anything before the kitchen starts?</p>
           <p style="color:#1A3D2E;font-weight:600">${escHtml(catalogLine)}</p>
           <p style="margin:18px 0"><a href="${escHtml(link)}" style="background:#1A3D2E;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Add to my delivery</a></p>
           <p style="font-size:12px;color:#777">If the button doesn't work, open: ${escHtml(link)}</p>`
        );
        await sendEmail(env, { to: o.client_email, subject: "Add something to today's Añejo delivery?", html });
      } catch { /* best-effort */ }
    }

    offered += 1;
  }

  try {
    await captureSystem(env, { event: 'automation.run', role: 'system', properties: { automation_type: 'addon_invite', outcome: 'success', offered } });
  } catch { /* best-effort */ }

  return json({ ok: true, offered, date: today });
};
