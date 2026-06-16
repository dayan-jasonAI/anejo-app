// POST /api/addons/checkout  (PUBLIC — token-gated)
//   Body: { t: <addon_token>, items: [{ kind, qty }] }
//   Creates a Square payment link for the selected add-ons, records pending order_addons
//   rows, and returns { url } to redirect the client to checkout. The Square webhook marks
//   them paid and attaches them to that day's order. Gated by env.ADDONS_ENABLED.
import { json, bad, id, appBaseUrl } from '../../_lib/util.js';
import { addonsEnabled, addonOpen, findAddon, createAddonPaymentLink } from '../../_lib/addons.js';

function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  if (!addonsEnabled(env)) return bad('Add-ons are not available right now.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const token = (b && b.t || '').toString().trim();
  const rawItems = Array.isArray(b && b.items) ? b.items : [];
  if (!token) return bad('Missing token.');
  if (!rawItems.length) return bad('Pick at least one item.');

  const o = await env.DB.prepare(
    'SELECT id, subscription_id, delivery_date, delivery_window, customer_name FROM orders WHERE addon_token = ?'
  ).bind(token).first();
  if (!o) return bad('This add-on link is no longer valid.', 404);

  const nowMs = Date.now();
  if (!addonOpen(env, o.delivery_date, o.delivery_window, nowMs, etToday(nowMs))) {
    return bad("Today's add-on window has closed — the kitchen has started prepping.", 409);
  }

  const selections = rawItems
    .map((s) => ({ kind: String(s && s.kind || ''), qty: Math.max(1, Math.min(20, Math.floor(Number(s && s.qty) || 0))) }))
    .filter((s) => findAddon(env, s.kind) && s.qty > 0);
  if (!selections.length) return bad('Pick at least one item.');

  const base = appBaseUrl(env, request);
  const link = await createAddonPaymentLink(env, { selections, base, order: o });
  if (!link) return bad('Could not start checkout. Please try again in a moment.', 502);

  const t = Date.now();
  for (const s of selections) {
    const c = findAddon(env, s.kind);
    try {
      await env.DB.prepare(
        `INSERT INTO order_addons
           (id, order_id, subscription_id, client_id, delivery_date, delivery_window,
            kind, name, qty, amount_cents, status, square_order_id, payment_link_url, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?, 'pending_payment', ?, ?, ?, ?)`
      ).bind(
        id('adn'), o.id, o.subscription_id || null, null, o.delivery_date, o.delivery_window,
        s.kind, c.name, s.qty, c.price_cents * s.qty, link.squareOrderId || null, link.url, t, t
      ).run();
    } catch { /* one row failing shouldn't block checkout */ }
  }

  return json({ ok: true, url: link.url });
};
