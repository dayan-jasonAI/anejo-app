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

  // CATERING CUSTOMERS ARE CUSTOMERS.
  //
  // Karina paid $485 for a thirty-guest event, opened "View my account" from her payment
  // confirmation, signed in with a magic link, and was told: "No plan is linked to
  // karinajuan2702@gmail.com yet. Ask your trainer to add you." She has no trainer. She never
  // wanted a meal plan. She had just paid us in full the same morning.
  //
  // The cause is that this endpoint only ever looked in `clients`, the meal-plan table, so anybody
  // who bought catering was a stranger to their own account. Her events are read by the email the
  // session has already verified — never one supplied by the caller.
  const cateringRows = await env.DB.prepare(
    `SELECT id, customer_name, event_date, serving_time, guests, total_cents, deposit_cents,
            balance_cents, deposit_status, balance_status, balance_due_date, final_count_due,
            address, theme, colors, access_token, lang, quote_json
       FROM catering_quotes
      WHERE LOWER(TRIM(customer_email)) = ? AND deposit_status != 'void'
      ORDER BY event_date DESC LIMIT 20`
  ).bind(String(sess.email).trim().toLowerCase()).all();

  const catering = ((cateringRows && cateringRows.results) || []).map((q) => {
    let lines = [];
    try { const b = JSON.parse(q.quote_json || '{}'); lines = Array.isArray(b.lines) ? b.lines : []; } catch { lines = []; }
    return {
      id: q.id, name: q.customer_name, event_date: q.event_date, serving_time: q.serving_time,
      guests: q.guests, total_cents: q.total_cents, deposit_cents: q.deposit_cents,
      balance_cents: q.balance_cents, deposit_status: q.deposit_status,
      balance_status: q.balance_status, balance_due_date: q.balance_due_date,
      final_count_due: q.final_count_due, address: q.address, theme: q.theme, colors: q.colors,
      lang: q.lang || 'en',
      // Her own quote page: the menu, the terms, the payment state — and, where one was given and
      // the balance is settled, the gift. It already exists and is already hers; the account page
      // links to it rather than rebuilding any of it.
      url: q.access_token ? `/q/${q.access_token}` : null,
      items: lines.map((l) => ({ name: l.name, name_es: l.name_es || null, qty: l.qty })),
    };
  });

  // What she has already asked for, and what she was told. A customer who asks for something and
  // is shown nothing back assumes she was not heard, and phones — which is the behaviour the
  // request form exists to replace.
  if (catering.length) {
    try {
      const ids = catering.map((c) => c.id);
      const r = await env.DB.prepare(
        `SELECT id, quote_id, kind, guests, message, items_json, status, owner_note, created_at, decided_at
           FROM catering_quote_changes
          WHERE quote_id IN (${ids.map(() => '?').join(',')})
          ORDER BY created_at DESC LIMIT 60`
      ).bind(...ids).all();
      const byQuote = new Map();
      for (const row of ((r && r.results) || [])) {
        let items = [];
        try { items = JSON.parse(row.items_json || '[]') || []; } catch { items = []; }
        if (!byQuote.has(row.quote_id)) byQuote.set(row.quote_id, []);
        byQuote.get(row.quote_id).push({
          id: row.id, kind: row.kind || 'message', guests: row.guests, message: row.message,
          items, status: row.status || 'open', owner_note: row.owner_note,
          created_at: row.created_at, decided_at: row.decided_at,
        });
      }
      for (const c of catering) c.requests = byQuote.get(c.id) || [];
    } catch {
      // The migration may not be applied yet. Her event still loads; it simply shows no history.
      for (const c of catering) c.requests = [];
    }
  }

  const client = await env.DB
    .prepare('SELECT id, name, email, phone, primary_goal, status FROM clients WHERE email = ? ORDER BY updated_at DESC LIMIT 1')
    .bind(sess.email).first();
  if (!client) return json({ authenticated: true, email: sess.email, client: null, rewards, catering });

  const plan = await env.DB
    .prepare('SELECT public_token, daily_calories, daily_protein_g, daily_carbs_g, daily_fat_g, meal_plan_tier, bowl_size_oz, per_bowl_price_cents, status FROM plans WHERE client_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(client.id).first();
  if (plan && plan.per_bowl_price_cents != null) plan.per_bowl_price_usd = plan.per_bowl_price_cents / 100;
  const sub = await env.DB
    .prepare('SELECT id, status, weekly_amount_cents, windows, tier, paused_at, skip_through FROM subscriptions WHERE client_id = ? ORDER BY started_at DESC LIMIT 1')
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

  // catering rides along for a meal-plan client too — the same person can be both.
  return json({ authenticated: true, email: sess.email, client, plan, subscription: sub || null, rewards, today_bowls: todayBowls, prefill, catering });
};
