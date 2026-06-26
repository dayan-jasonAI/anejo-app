// POST /api/subscriptions/manage — a signed-in CLIENT manages their own subscription.
//   { op:'pause' }   → pause billing + stop deliveries (Square pause; status='paused').
//   { op:'resume' }  → resume (Square resume; status='active'; rebuild upcoming orders).
//   { op:'skip' }    → skip the NEXT delivery week: drop that week's orders + skip its charge
//                      (Square one-cycle pause). Deliveries resume automatically the week after.
// Square calls are best-effort; the local state always reflects the member's intent so the
// portal + kitchen update immediately. Mirrors subscriptions/cancel.js auth.
import { json, bad, now } from '../../_lib/util.js';
import { currentUser } from '../../_lib/session.js';
import { square, squareConfigured } from '../../_lib/square.js';
import { materializeSubscriptionPrep } from '../../_lib/suborders.js';

function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}
const dowOf = (d) => new Date(d + 'T12:00:00Z').getUTCDay();
const dayNum = (d) => Math.floor(Date.parse(d + 'T00:00:00Z') / 86400000);
const addDays = (d, n) => new Date((dayNum(d) + n) * 86400000).toISOString().slice(0, 10);

async function squareCall(env, sub, action, body) {
  if (!sub.provider_subscription_id || !squareConfigured(env)) return { ok: true, skipped: true };
  try {
    const r = await square(env, `/v2/subscriptions/${sub.provider_subscription_id}/${action}`, { method: 'POST', body: body || {} });
    if (!r.ok) {
      const err = (r.data && r.data.errors && r.data.errors[0] && r.data.errors[0].detail) || `Square ${r.status}`;
      console.log(`subscription ${action} — Square error:`, err, '· sub', sub.id);
    }
    return { ok: !!r.ok };
  } catch (e) { console.log(`subscription ${action} — Square exception:`, e && e.message, '· sub', sub.id); return { ok: false }; }
}

export const onRequestPost = async ({ request, env }) => {
  const sess = await currentUser(env, request);
  if (!sess || sess.type !== 'client' || !sess.email) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);
  let b; try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const op = b && b.op;
  if (!['pause', 'resume', 'skip'].includes(op)) return bad('Unknown action.');

  const email = String(sess.email).trim().toLowerCase();
  const client = await env.DB.prepare('SELECT id FROM clients WHERE LOWER(TRIM(email))=? ORDER BY updated_at DESC LIMIT 1').bind(email).first();
  if (!client) return json({ error: 'No account found for your sign-in.' }, 404);
  const sub = await env.DB.prepare(
    "SELECT id, provider_subscription_id, status FROM subscriptions WHERE client_id=? AND status NOT IN ('canceled') ORDER BY updated_at DESC LIMIT 1"
  ).bind(client.id).first();
  if (!sub) return json({ error: 'You don’t have an active subscription.' }, 404);
  const t = now();
  const today = etToday(t);

  if (op === 'pause') {
    const sq = await squareCall(env, sub, 'pause', {});
    await env.DB.prepare("UPDATE subscriptions SET status='paused', paused_at=?, updated_at=? WHERE id=?").bind(t, t, sub.id).run();
    // Stop prepping: drop this/next undelivered scheduled orders while paused.
    await env.DB.prepare("DELETE FROM orders WHERE subscription_id=? AND status='paid' AND fulfillment_mode='scheduled' AND delivery_date >= ?").bind(sub.id, today).run();
    return json({ ok: true, status: 'paused', square_ok: sq.ok });
  }

  if (op === 'resume') {
    const sq = await squareCall(env, sub, 'resume', {});
    await env.DB.prepare("UPDATE subscriptions SET status='active', paused_at=NULL, skip_through=NULL, updated_at=? WHERE id=?").bind(t, sub.id).run();
    try { await materializeSubscriptionPrep(env, { subscriptionId: sub.id, horizonDays: 7 }); } catch { /* cron will catch up */ }
    return json({ ok: true, status: 'active', square_ok: sq.ok });
  }

  // op === 'skip' — skip the next delivery week (its bowls + its charge).
  let skipMonday = today;
  do { skipMonday = addDays(skipMonday, 1); } while (dowOf(skipMonday) !== 1); // first Monday AFTER today
  const skipSaturday = addDays(skipMonday, 5);
  await env.DB.prepare('UPDATE subscriptions SET skip_through=?, updated_at=? WHERE id=?').bind(skipSaturday, t, sub.id).run();
  // Remove that week's already-materialized (undelivered) orders so the kitchen won't prep them.
  await env.DB.prepare(
    "DELETE FROM orders WHERE subscription_id=? AND status='paid' AND fulfillment_mode='scheduled' AND delivery_date BETWEEN ? AND ?"
  ).bind(sub.id, skipMonday, skipSaturday).run();
  // Skip the charge for that cycle (best-effort; Square auto-resumes after one cycle).
  const sq = await squareCall(env, sub, 'pause', { pause_cycle_duration: 1 });
  return json({ ok: true, status: 'active', skipped_week: skipMonday, resumes: addDays(skipSaturday, 2), square_ok: sq.ok });
};
