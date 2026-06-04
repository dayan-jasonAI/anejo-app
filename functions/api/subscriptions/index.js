// GET /api/subscriptions — the signed-in trainer's subscriptions, rev-share ledger, and payout totals.
import { json, bad } from '../../_lib/util.js';
import { trainerSession } from '../../_lib/guard.js';

export const onRequestGet = async ({ request, env }) => {
  const sess = await trainerSession(env, request);
  if (!sess) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);

  const subs = (await env.DB.prepare(
    `SELECT s.id, s.status, s.weekly_amount_cents, s.trainer_share_pct, s.started_at, c.name AS client_name
       FROM subscriptions s LEFT JOIN clients c ON c.id = s.client_id
      WHERE s.trainer_id = ? ORDER BY s.started_at DESC`
  ).bind(sess.uid).all()).results || [];

  const events = (await env.DB.prepare(
    `SELECT id, subscription_id, amount_cents, share_cents, occurred_at, payout_status
       FROM rev_share_events WHERE trainer_id = ? ORDER BY occurred_at DESC LIMIT 50`
  ).bind(sess.uid).all()).results || [];

  const totals = await env.DB.prepare(
    `SELECT COALESCE(SUM(share_cents),0) AS total,
            COALESCE(SUM(CASE WHEN payout_status='pending' THEN share_cents ELSE 0 END),0) AS pending,
            COALESCE(SUM(CASE WHEN payout_status='paid'    THEN share_cents ELSE 0 END),0) AS paid
       FROM rev_share_events WHERE trainer_id = ?`
  ).bind(sess.uid).first();

  return json({ subscriptions: subs, events, totals });
};
