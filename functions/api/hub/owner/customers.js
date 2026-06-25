// /api/hub/owner/customers — owner CRM view over every customer.
//   GET ?q=<search>     → unified list: clients ∪ order-only (guest checkout) customers,
//                         with trainer, latest subscription, and order aggregates
//                         (orders joined to clients by customer_email = client email).
//                         Sorted by last activity DESC. LIMIT 200.
//   GET ?email=<x>      → full profile: client row (if any), their orders (newest 50),
//                         latest subscription, latest plan summary, and the open thread id
//                         (for a Comms deep-link). Works for guests too (orders only).
// Read-only; manual orders are created via /api/hub/owner/orders. Owner-only.
import { json, bad, id, now, isEmail, normalizePhone, randToken, appBaseUrl } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { parseJson } from '../../../_lib/hub.js';
import { sendEmail, magicLinkEmail } from '../../../_lib/email.js';

const emailKey = (e) => (e == null ? '' : String(e)).trim().toLowerCase();

// Direct/owner-onboarded clients (no referring trainer) attach to a single "house" trainer.
// Mirrors getOrCreateHouseTrainer in functions/api/subscriptions/create.js.
async function getOrCreateHouseTrainer(env) {
  const existing = await env.DB.prepare("SELECT id FROM trainers WHERE affiliate_code = 'HOUSE'").first();
  if (existing) return existing.id;
  const tid = id('tr'), t = now();
  try {
    await env.DB.prepare('INSERT INTO trainers (id, email, name, affiliate_code, created_at, updated_at) VALUES (?,?,?,?,?,?)')
      .bind(tid, 'house@anejocateringco.com', 'Añejo (Direct)', 'HOUSE', t, t).run();
    return tid;
  } catch (_) {
    const again = await env.DB.prepare("SELECT id FROM trainers WHERE affiliate_code = 'HOUSE'").first();
    return again ? again.id : tid;
  }
}

// Aggregate orders by customer_email (canceled excluded from spend/counts).
async function orderAggregates(env) {
  try {
    const res = await env.DB.prepare(
      "SELECT LOWER(TRIM(customer_email)) AS email_key, MAX(customer_name) AS customer_name, " +
      'COUNT(*) AS orders_count, SUM(COALESCE(total_estimate_cents,0)) AS lifetime_spend_cents, ' +
      'MAX(created_at) AS last_order_at ' +
      "FROM orders WHERE customer_email IS NOT NULL AND TRIM(customer_email) != '' AND status != 'canceled' " +
      'GROUP BY LOWER(TRIM(customer_email))'
    ).all();
    return (res && res.results) || [];
  } catch {
    return [];
  }
}

async function listCustomers(env, q) {
  // Clients with trainer name + latest subscription (correlated subqueries keep it one pass).
  let sql =
    'SELECT c.id, c.name, c.email, c.phone, c.sms_consent, c.status, c.created_at, ' +
    't.name AS trainer_name, ' +
    '(SELECT s.status FROM subscriptions s WHERE s.client_id = c.id ORDER BY s.updated_at DESC LIMIT 1) AS subscription_status, ' +
    '(SELECT s.weekly_amount_cents FROM subscriptions s WHERE s.client_id = c.id ORDER BY s.updated_at DESC LIMIT 1) AS weekly_amount_cents ' +
    'FROM clients c LEFT JOIN trainers t ON t.id = c.trainer_id';
  const binds = [];
  if (q) {
    sql += ' WHERE (c.name LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)';
    const like = `%${q}%`;
    binds.push(like, like, like);
  }
  sql += ' LIMIT 400';

  let clients = [];
  try {
    const res = await env.DB.prepare(sql).bind(...binds).all();
    clients = (res && res.results) || [];
  } catch {
    clients = [];
  }

  const aggs = await orderAggregates(env);
  const aggByEmail = new Map(aggs.map((a) => [a.email_key, a]));

  const seen = new Set();
  const items = [];
  for (const c of clients) {
    const key = emailKey(c.email);
    const a = key ? aggByEmail.get(key) : null;
    if (key) seen.add(key);
    items.push({
      id: c.id,
      name: c.name,
      email: c.email || null,
      phone: c.phone || null,
      sms_consent: c.sms_consent ? 1 : 0,
      status: c.status || null,
      trainer_name: c.trainer_name || null,
      subscription_status: c.subscription_status || null,
      weekly_amount_cents: c.weekly_amount_cents != null ? c.weekly_amount_cents : null,
      orders_count: a ? a.orders_count : 0,
      lifetime_spend_cents: a ? (a.lifetime_spend_cents || 0) : 0,
      last_order_at: a ? a.last_order_at : null,
      last_activity: Math.max((a && a.last_order_at) || 0, c.created_at || 0),
      guest: false,
    });
  }

  // Guest checkouts: order emails with no matching client row.
  const ql = (q || '').toLowerCase();
  for (const a of aggs) {
    if (seen.has(a.email_key)) continue;
    if (ql) {
      const hay = `${a.customer_name || ''} ${a.email_key}`.toLowerCase();
      if (hay.indexOf(ql) === -1) continue;
    }
    items.push({
      id: null,
      name: a.customer_name || a.email_key,
      email: a.email_key,
      phone: null,
      sms_consent: 0,
      status: null,
      trainer_name: null,
      subscription_status: null,
      weekly_amount_cents: null,
      orders_count: a.orders_count,
      lifetime_spend_cents: a.lifetime_spend_cents || 0,
      last_order_at: a.last_order_at,
      last_activity: a.last_order_at || 0,
      guest: true,
    });
  }

  items.sort((x, y) => (y.last_activity || 0) - (x.last_activity || 0));
  return items.slice(0, 200);
}

async function customerDetail(env, email) {
  const key = emailKey(email);

  let client = null;
  try {
    client = await env.DB.prepare(
      'SELECT c.*, t.name AS trainer_name FROM clients c LEFT JOIN trainers t ON t.id = c.trainer_id ' +
      'WHERE LOWER(TRIM(c.email)) = ? ORDER BY c.created_at ASC LIMIT 1'
    ).bind(key).first();
  } catch { client = null; }

  let orders = [];
  try {
    const res = await env.DB.prepare(
      'SELECT id, delivery_date, delivery_window, items, subtotal_cents, fee_cents, tax_pct, ' +
      'total_estimate_cents, status, square_order_id, customer_name, created_at ' +
      "FROM orders WHERE LOWER(TRIM(customer_email)) = ? ORDER BY created_at DESC LIMIT 50"
    ).bind(key).all();
    orders = ((res && res.results) || []).map((o) => ({
      ...o,
      items: parseJson(o.items, []),
      manual: !o.square_order_id,
    }));
  } catch { orders = []; }

  let subscription = null;
  let plan = null;
  let threadId = null;
  let subscriptionSchedule = [];
  if (client) {
    try {
      subscription = await env.DB.prepare(
        'SELECT id, status, weekly_amount_cents, windows, started_at, canceled_at, updated_at ' +
        'FROM subscriptions WHERE client_id = ? ORDER BY updated_at DESC LIMIT 1'
      ).bind(client.id).first();
    } catch { subscription = null; }
    // Upcoming daily fresh-prep schedule generated from the subscription (next ~3 weeks).
    if (subscription && subscription.id) {
      try {
        const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
        const sres = await env.DB.prepare(
          "SELECT delivery_date, delivery_window, items, status FROM orders " +
          "WHERE subscription_id = ? AND delivery_date >= ? " +
          "ORDER BY delivery_date ASC, CASE delivery_window WHEN 'lunch' THEN 0 ELSE 1 END LIMIT 42"
        ).bind(subscription.id, todayStr).all();
        subscriptionSchedule = ((sres && sres.results) || []).map((o) => {
          const it = parseJson(o.items, [])[0] || null;
          return { date: o.delivery_date, window: o.delivery_window, bowl: (it && it.name) || null, status: o.status };
        });
      } catch { subscriptionSchedule = []; }
    }
    try {
      plan = await env.DB.prepare(
        'SELECT id, daily_calories, meal_plan_tier, bowl_size_oz, status, created_at ' +
        'FROM plans WHERE client_id = ? ORDER BY created_at DESC LIMIT 1'
      ).bind(client.id).first();
    } catch { plan = null; }
    try {
      const thr = await env.DB.prepare(
        'SELECT id FROM threads WHERE client_id = ? ORDER BY COALESCE(last_message_at, created_at) DESC LIMIT 1'
      ).bind(client.id).first();
      threadId = (thr && thr.id) || null;
    } catch { threadId = null; }
  }

  const name = (client && client.name) || (orders[0] && orders[0].customer_name) || key;
  return {
    email: key,
    name,
    client: client ? {
      id: client.id,
      name: client.name,
      email: client.email,
      phone: client.phone || null,
      sms_consent: client.sms_consent ? 1 : 0,
      status: client.status || null,
      lang: client.lang || 'en',
      trainer_name: client.trainer_name || null,
      created_at: client.created_at,
    } : null,
    orders,
    subscription: subscription || null,
    subscription_schedule: subscriptionSchedule,
    plan: plan || null,
    thread_id: threadId,
  };
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (email) {
    if (!emailKey(email)) return bad('Missing email.');
    const detail = await customerDetail(env, email);
    return json({ ok: true, ...detail });
  }

  const q = (url.searchParams.get('q') || '').trim().slice(0, 80);
  const items = await listCustomers(env, q);
  return json({ ok: true, items, count: items.length });
};

// POST { action:'onboard', email, name, phone?, sms_consent? }
//   Convert a guest (order-only) customer into a managed client under the house trainer,
//   so the owner can attach plans/subscriptions. Existing guest orders back-link by email.
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const action = (b && b.action) || '';

  // Owner-initiated portal sign-in link: emails a returning CLIENT a 30-min magic link.
  // Guarded so we never email a login link to a non-client (guest/unknown) address.
  if (action === 'send_login_link') {
    const target = emailKey(b.email);
    if (!isEmail(target)) return bad('A valid email is required.');
    let cl = null;
    try { cl = await env.DB.prepare('SELECT id, lang FROM clients WHERE LOWER(TRIM(email)) = ? LIMIT 1').bind(target).first(); }
    catch { cl = null; }
    if (!cl) return bad('Not a portal client yet — onboard them first, then send a link.', 409);
    const lang = cl.lang === 'es' ? 'es' : 'en';
    const token = randToken(24);
    try {
      await env.DB.prepare('INSERT INTO auth_tokens (token, user_email, user_type, expires_at) VALUES (?,?,?,?)')
        .bind(token, target, 'client', now() + 30 * 60 * 1000).run();
    } catch { return bad('Could not create the sign-in link.', 500); }
    const link = `${appBaseUrl(env, request)}/api/auth/verify?token=${token}`;
    try {
      await sendEmail(env, {
        to: target,
        subject: lang === 'es' ? 'Tu enlace de acceso a Añejo' : 'Your Añejo sign-in link',
        html: magicLinkEmail(link, lang),
      });
    } catch (e) { return bad('Could not send the email: ' + (e.message || 'unknown'), 502); }
    return json({ ok: true, sent_to: target });
  }

  if (action !== 'onboard') return bad('Unknown action.');

  const email = emailKey(b.email);
  const name = (b.name == null ? '' : String(b.name)).trim().slice(0, 120);
  if (!isEmail(email)) return bad('A valid email is required.');
  if (!name) return bad('A name is required.');
  const phone = normalizePhone(b.phone);
  const smsConsent = b.sms_consent === true || b.sms_consent === 1 ? 1 : 0;

  // Idempotency: if a client already exists for this email, return it (do not duplicate).
  let existing = null;
  try {
    existing = await env.DB.prepare('SELECT id FROM clients WHERE LOWER(TRIM(email)) = ? LIMIT 1')
      .bind(email).first();
  } catch { existing = null; }
  if (existing) return json({ ok: true, already: true, client_id: existing.id });

  const houseId = await getOrCreateHouseTrainer(env);
  const cid = id('cl'), t0 = now();
  try {
    await env.DB.prepare(
      'INSERT INTO clients (id, trainer_id, email, name, phone, sms_consent, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(cid, houseId, email, name, phone, smsConsent, 'pending', t0, t0).run();
  } catch (_) {
    // Race: another insert landed first — return the existing row instead of erroring.
    const again = await env.DB.prepare('SELECT id FROM clients WHERE LOWER(TRIM(email)) = ? LIMIT 1')
      .bind(email).first();
    if (again) return json({ ok: true, already: true, client_id: again.id });
    return bad('Could not onboard this customer. Please try again.', 500);
  }

  return json({ ok: true, client_id: cid });
};
