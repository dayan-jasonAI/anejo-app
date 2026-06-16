// GET /api/client/addons — the signed-in client's OPEN add-on offers for today (in-app
// channel for the per-delivery upsell). Returns [] unless the feature is enabled and the
// add-on window is still open. Token-carrying so the portal can deep-link to /add-ons.
import { json } from '../../_lib/util.js';
import { currentUser } from '../../_lib/session.js';
import { addonsEnabled, addonOpen } from '../../_lib/addons.js';

function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export const onRequestGet = async ({ request, env }) => {
  const sess = await currentUser(env, request);
  if (!sess || sess.type !== 'client') return json({ offers: [] });
  if (!env.DB || !addonsEnabled(env)) return json({ offers: [] });

  const client = await env.DB.prepare('SELECT id FROM clients WHERE email = ? ORDER BY updated_at DESC LIMIT 1')
    .bind(sess.email).first();
  if (!client) return json({ offers: [] });

  const nowMs = Date.now();
  const today = etToday(nowMs);
  let rows = [];
  try {
    const res = await env.DB.prepare(
      `SELECT o.addon_token, o.delivery_window, o.delivery_date
         FROM orders o JOIN subscriptions s ON s.id = o.subscription_id
        WHERE s.client_id = ? AND o.delivery_date = ? AND o.addon_token IS NOT NULL`
    ).bind(client.id, today).all();
    rows = (res && res.results) || [];
  } catch { rows = []; }

  const offers = rows
    .filter((o) => addonOpen(env, o.delivery_date, o.delivery_window, nowMs, today))
    .map((o) => ({ window: o.delivery_window, link: '/add-ons?t=' + o.addon_token }));
  return json({ offers });
};
