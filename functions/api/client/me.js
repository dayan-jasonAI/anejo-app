// GET /api/client/me — the signed-in client's profile, latest plan, and subscription.
import { json } from '../../_lib/util.js';
import { currentUser } from '../../_lib/session.js';

export const onRequestGet = async ({ request, env }) => {
  const sess = await currentUser(env, request);
  if (!sess || sess.type !== 'client') return json({ authenticated: false }, 200);
  if (!env.DB) return json({ authenticated: true, email: sess.email }, 200);

  const client = await env.DB
    .prepare('SELECT id, name, email, primary_goal, status FROM clients WHERE email = ? ORDER BY updated_at DESC LIMIT 1')
    .bind(sess.email).first();
  if (!client) return json({ authenticated: true, email: sess.email, client: null });

  const plan = await env.DB
    .prepare('SELECT public_token, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, meal_plan_tier, status FROM plans WHERE client_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(client.id).first();
  const sub = await env.DB
    .prepare('SELECT status, weekly_amount_cents FROM subscriptions WHERE client_id = ? ORDER BY started_at DESC LIMIT 1')
    .bind(client.id).first();

  return json({ authenticated: true, email: sess.email, client, plan, subscription: sub || null });
};
