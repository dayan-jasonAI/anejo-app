// GET /api/addons/offer?t=<token>  (PUBLIC — token-gated, no session)
// Returns the add-on offer context for a subscription delivery: the day/window, the
// catalog with prices, and whether the offer is still open (before the kitchen cutoff).
import { json, bad } from '../../_lib/util.js';
import { addonsEnabled, addonOpen, catalogFor } from '../../_lib/addons.js';

function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const token = (new URL(request.url).searchParams.get('t') || '').trim();
  if (!token) return bad('Missing token.');

  const o = await env.DB.prepare(
    'SELECT delivery_date, delivery_window, customer_name FROM orders WHERE addon_token = ?'
  ).bind(token).first();
  if (!o) return json({ ok: false, error: 'This add-on link is no longer valid.' }, 404);

  const nowMs = Date.now();
  const open = addonsEnabled(env) && addonOpen(env, o.delivery_date, o.delivery_window, nowMs, etToday(nowMs));
  const catalog = catalogFor(env).map((c) => ({ kind: c.kind, name: c.name, price_cents: c.price_cents, blurb: c.blurb }));

  return json({
    ok: true,
    open,
    order: { name: o.customer_name || null, delivery_date: o.delivery_date, delivery_window: o.delivery_window },
    catalog,
  });
};
