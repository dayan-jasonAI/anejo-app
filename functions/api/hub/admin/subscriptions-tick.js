// POST /api/hub/admin/subscriptions-tick
//   Rolls the subscription fresh-prep window forward: for every active subscription,
//   ensures the next ~7 days of daily "Subscription" kitchen orders exist (one per chosen
//   window per delivery day Mon–Sat, one rotating bowl each). Idempotent — safe to run
//   many times a day (deterministic order ids + INSERT OR IGNORE).
//
// Auth: owner session OR an X-Cron-Key header matching env.CRON_KEY (constant-time).
//   Cloudflare Pages Functions have no native cron — the standalone cron Worker POSTs
//   here daily (folded into the existing 09:30 UTC slot, no new trigger).
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { captureSystem } from '../../../_lib/track.js';
import { materializeSubscriptionPrep } from '../../../_lib/suborders.js';

function ctEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
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

  const out = await materializeSubscriptionPrep(env, { horizonDays: 7 });

  try {
    await captureSystem(env, {
      event: 'automation.run',
      role: 'system',
      properties: { automation_type: 'subscription_prep', outcome: out.ok ? 'success' : 'failed', created: out.created, subs: out.subs },
    });
  } catch { /* best-effort telemetry */ }

  return json(out);
};
