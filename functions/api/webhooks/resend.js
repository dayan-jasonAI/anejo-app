// POST /api/webhooks/resend — Resend email events (Svix-signed). Records hard bounces, spam
// complaints, and Resend-side suppressions into email_suppressions so the pre-send guard in
// _lib/email.js never emails those addresses again (sender-reputation protection).
//
// SETUP (owner, in the Resend dashboard → Webhooks):
//   1. Add endpoint  https://anejocateringco.com/api/webhooks/resend
//   2. Subscribe to events: email.bounced, email.complained, email.suppressed
//   3. Copy the signing secret → set Pages secret RESEND_WEBHOOK_SECRET (whsec_...).
// Until the secret is set this endpoint returns 503 and nothing is recorded (the app keeps
// working; it just isn't yet learning about bounces).
import { verifySvix } from '../../_lib/svix.js';
import { addSuppression } from '../../_lib/email.js';

// Resend event → suppression reason. delivery_delayed/failed are TEMPORARY → never suppress.
const SUPPRESS = { 'email.bounced': 'bounced', 'email.complained': 'complained', 'email.suppressed': 'suppressed' };

export const onRequestPost = async ({ request, env }) => {
  if (!env.RESEND_WEBHOOK_SECRET) return new Response('webhook not configured', { status: 503 });

  const body = await request.text();   // RAW body required for signature verification
  const v = await verifySvix(env.RESEND_WEBHOOK_SECRET, request.headers, body);
  // TEMP DIAGNOSTIC (no secret/signature values logged) — remove once verified.
  console.log('RESEND_WH_DIAG ' + JSON.stringify({
    reason: v.reason,
    secretLen: (env.RESEND_WEBHOOK_SECRET || '').length,
    secretPrefix: (env.RESEND_WEBHOOK_SECRET || '').slice(0, 6),
    expPre: (v.expected || '').slice(0, 12),
    gotPre: ((v.provided || [])[0] || '').slice(0, 12),
    bodyLen: body.length,
    bodyHead: body.slice(0, 2),
  }));
  if (!v.ok) return new Response('invalid signature', { status: 401 });

  let evt;
  try { evt = JSON.parse(body); } catch { return new Response('bad json', { status: 400 }); }

  const reason = SUPPRESS[evt && evt.type];
  if (reason && env.DB) {
    const data = evt.data || {};
    // Recipient(s): Resend puts them in data.to (array|string); tolerate a couple of fallbacks.
    let recips = data.to || data.email || data.recipient || [];
    if (typeof recips === 'string') recips = [recips];
    if (!Array.isArray(recips)) recips = [];
    const detail = (data.bounce && (data.bounce.subType || data.bounce.type)) || evt.type;
    for (const addr of recips) { await addSuppression(env, addr, reason, detail); }
  }
  // Always 200 for handled/ignored event types so Resend doesn't retry-storm.
  return new Response('ok', { status: 200 });
};
