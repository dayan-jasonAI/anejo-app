// GET /api/client/me — the signed-in client's profile, latest plan, and subscription.
import { json } from '../../_lib/util.js';
import { currentUser } from '../../_lib/session.js';
import { rewardsSummary } from '../../_lib/rewards.js';
import { bowlImage } from '../../_lib/bowlspec.js';

export const onRequestGet = async ({ request, env }) => {
  const sess = await currentUser(env, request);
  if (!sess || sess.type !== 'client') return json({ authenticated: false }, 200);
  if (!env.DB) return json({ authenticated: true, email: sess.email }, 200);

  const rewards = await rewardsSummary(env, sess.email);

  const client = await env.DB
    .prepare('SELECT id, name, email, phone, primary_goal, status FROM clients WHERE email = ? ORDER BY updated_at DESC LIMIT 1')
    .bind(sess.email).first();
  if (!client) return json({ authenticated: true, email: sess.email, client: null, rewards });

  const plan = await env.DB
    .prepare('SELECT public_token, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, meal_plan_tier, bowl_size_oz, per_bowl_price_cents, status FROM plans WHERE client_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(client.id).first();
  if (plan && plan.per_bowl_price_cents != null) plan.per_bowl_price_usd = plan.per_bowl_price_cents / 100;
  const sub = await env.DB
    .prepare('SELECT id, status, weekly_amount_cents FROM subscriptions WHERE client_id = ? ORDER BY started_at DESC LIMIT 1')
    .bind(client.id).first();

  // "Your bowl today" — today's scheduled delivery/deliveries (lunch/dinner) with a bowl image.
  let todayBowls = [];
  try {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    let rows = [];
    if (sub && sub.id) {
      rows = ((await env.DB.prepare(
        "SELECT delivery_window, items FROM orders WHERE subscription_id=? AND delivery_date=? AND status NOT IN ('canceled') " +
        "ORDER BY CASE delivery_window WHEN 'lunch' THEN 0 ELSE 1 END"
      ).bind(sub.id, today).all()).results) || [];
    }
    if (!rows.length) {
      rows = ((await env.DB.prepare(
        "SELECT delivery_window, items FROM orders WHERE LOWER(TRIM(customer_email))=? AND delivery_date=? AND status NOT IN ('canceled') " +
        "ORDER BY CASE delivery_window WHEN 'lunch' THEN 0 ELSE 1 END"
      ).bind(String(sess.email).trim().toLowerCase(), today).all()).results) || [];
    }
    todayBowls = rows.map((r) => {
      let bowl = null;
      try { const it = JSON.parse(r.items)[0]; bowl = it && it.name ? it.name : null; } catch { bowl = null; }
      const base = (bowl || '').replace(/\s*bowl\s*$/i, '').trim().toUpperCase().replace('RAÍZ', 'RAIZ');
      return { window: r.delivery_window, bowl, image: bowlImage(base) || null };
    }).filter((x) => x.bowl);
  } catch { todayBowls = []; }

  // Prefill for /order — name/phone from profile, delivery address from the most recent order
  // so returning clients don't retype everything.
  let prefill = null;
  try {
    const last = await env.DB.prepare(
      "SELECT customer_name, customer_phone, delivery_street, delivery_unit, delivery_city, delivery_state, delivery_zip, delivery_notes " +
      "FROM orders WHERE LOWER(TRIM(customer_email))=? AND delivery_street IS NOT NULL AND TRIM(delivery_street)<>'' ORDER BY created_at DESC LIMIT 1"
    ).bind(String(sess.email).trim().toLowerCase()).first();
    prefill = {
      name: client.name || (last && last.customer_name) || null,
      phone: client.phone || (last && last.customer_phone) || null,
      address: last ? {
        street: last.delivery_street || null, unit: last.delivery_unit || null,
        city: last.delivery_city || null, state: last.delivery_state || null,
        zip: last.delivery_zip || null, notes: last.delivery_notes || null,
      } : null,
    };
  } catch { prefill = null; }

  return json({ authenticated: true, email: sess.email, client, plan, subscription: sub || null, rewards, today_bowls: todayBowls, prefill });
};
