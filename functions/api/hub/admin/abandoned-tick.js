// POST /api/hub/admin/abandoned-tick
//   1) Relabels stale unpaid checkouts 'abandoned' (the existing sweep — until now it only ever
//      ran when the owner happened to open the order-history page, so a quiet day left the list
//      wrong until somebody looked).
//   2) Sends each abandoned checkout its ONE recovery message.
//
// Auth: owner session OR an X-Cron-Key header matching env.CRON_KEY (constant-time), the same
// shape every other admin tick uses.
//
// Runs hourly, not every minute: the recovery message deliberately waits hours, so a
// minute-resolution tick would buy nothing and cost 1,440 no-op queries a day.
import { json, bad, appBaseUrl } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { captureSystem } from '../../../_lib/track.js';
import { sweepAbandoned, recoverAbandoned, recoveryEnabled } from '../../../_lib/abandoned.js';
import { sendSms } from '../../../_lib/twilio.js';
import { sendEmail } from '../../../_lib/email.js';

function ctEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cronAuthed(request, env) {
  const k = request.headers.get('x-cron-key');
  return !!(env.CRON_KEY && k && ctEq(k, env.CRON_KEY));
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  if (!cronAuthed(request, env)) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
  }

  const swept = await sweepAbandoned(env);

  // The senders are injected rather than imported inside the recovery module, so the module's
  // at-most-once and consent rules can be tested without a Twilio or Resend credential existing.
  const recovered = await recoverAbandoned(env, {
    baseUrl: appBaseUrl(env, request),
    send: {
      sms: (opts) => sendSms(env, opts),
      email: (opts) => sendEmail(env, opts),
    },
  });

  try {
    await captureSystem(env, {
      event: 'automation.run',
      role: 'system',
      properties: {
        automation_type: 'abandoned_recovery',
        outcome: 'success',
        swept,
        checked: recovered.checked,
        sent: recovered.sent,
        enabled: recoveryEnabled(env),
      },
    });
  } catch { /* best-effort telemetry */ }

  return json({ ok: true, swept, ...recovered });
};
