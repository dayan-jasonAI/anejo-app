// POST /api/hub/admin/offers-tick
//   Sweeps route offers that have gone unanswered past the timeout (~2 min) and rolls each
//   to the next available driver (recording a 'missed' on the silent driver). When no driver
//   remains, the route goes 'unfilled' and the owner is alerted (handled in dispatch).
//   Idempotent + cheap (usually zero pending offers). Run every minute by the cron worker.
// Auth: owner session OR X-Cron-Key (constant-time).
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { now } from '../../../_lib/hub.js';
import { declineAndReoffer, OFFER_TIMEOUT_MS } from '../../../_lib/dispatch.js';

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

  const cutoff = now() - OFFER_TIMEOUT_MS;
  let routes = [];
  try {
    const res = await env.DB.prepare(
      "SELECT id, driver_id FROM routes WHERE offer_status='pending' AND offered_at IS NOT NULL AND offered_at < ? LIMIT 50"
    ).bind(cutoff).all();
    routes = (res && res.results) || [];
  } catch (e) {
    return json({ ok: false, reason: (e && e.message) || 'query_failed' });
  }

  let rolled = 0;
  let unfilled = 0;
  for (const r of routes) {
    try {
      const out = await declineAndReoffer(env, r.id, r.driver_id, 'missed');
      if (out && out.unfilled) unfilled++;
      else if (out && out.offered_to) rolled++;
    } catch { /* one bad route must not stop the sweep */ }
  }
  return json({ ok: true, expired: routes.length, rolled, unfilled });
};
