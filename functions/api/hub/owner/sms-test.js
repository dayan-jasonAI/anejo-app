// POST /api/hub/owner/sms-test  { to, body? } — owner-only Twilio end-to-end check.
// Sends a one-off test text to the number the owner enters (use your own phone). Reports whether
// Twilio is configured and what happened (sent / noop / failed), so you can confirm SMS works
// without waiting for a real order. Logged to sms_log like any other send.
import { json, bad, normalizePhone } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { sendSms, isTwilioConfigured } from '../../../_lib/twilio.js';

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const to = normalizePhone(b.to);
  if (!to) return bad('Enter a valid mobile number (E.164, e.g. +15615551234).');

  const body = (typeof b.body === 'string' && b.body.trim())
    ? b.body.trim().slice(0, 300)
    : 'Añejo HUB test — your Twilio SMS is working. Reply STOP to opt out.';

  const res = await sendSms(env, { to, body });
  return json({
    ok: !!(res && res.ok),
    sent: !!(res && res.sent),
    noop: !!(res && res.noop),
    error: (res && res.error) || null,
    provider_sid: (res && res.provider_sid) || null,
    sms_log_id: (res && res.sms_log_id) || null,
    twilio_configured: isTwilioConfigured(env),
  });
};

export const onRequest = ({ request }) => {
  if (request.method === 'POST') return;
  return json({ error: 'Method not allowed. Use POST.' }, 405);
};
