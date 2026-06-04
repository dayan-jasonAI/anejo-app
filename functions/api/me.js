// GET /api/me — current trainer profile + quick stats (used by the dashboard).
import { json } from '../_lib/util.js';
import { trainerSession } from '../_lib/guard.js';

export const onRequestGet = async ({ request, env }) => {
  const sess = await trainerSession(env, request);
  if (!sess) return json({ authenticated: false }, 200);
  if (!env.DB) return json({ authenticated: true, email: sess.email }, 200);

  const trainer = await env.DB
    .prepare('SELECT id, email, name, gym_name, gym_city, affiliate_code FROM trainers WHERE id=?')
    .bind(sess.uid)
    .first();

  const counts = await env.DB
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM clients WHERE trainer_id=?1) AS clients,
         (SELECT COUNT(*) FROM subscriptions WHERE trainer_id=?1 AND status='active') AS active_subs,
         (SELECT COALESCE(SUM(share_cents),0) FROM rev_share_events WHERE trainer_id=?1) AS share_cents_total`
    )
    .bind(sess.uid)
    .first();

  return json({ authenticated: true, trainer, stats: counts });
};
