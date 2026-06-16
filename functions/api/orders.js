// /api/orders — kitchen-facing order list. Protected by a shared key (env KITCHEN_KEY).
//   GET  (header x-kitchen-key) &status=paid → list orders
//   POST { key, id, status }                 → update an order's status (e.g., mark fulfilled)
// Locked by default: if KITCHEN_KEY is unset, access is denied. The key is accepted ONLY via the
// x-kitchen-key header (never a URL query param — query strings leak via logs/history/Referer and
// this endpoint returns customer PII). NOTE: legacy page; the role-gated /hub/kitchen supersedes it.
import { json, bad, now } from '../_lib/util.js';

function authed(env, request, key) {
  return env.KITCHEN_KEY && key === env.KITCHEN_KEY;
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const url = new URL(request.url);
  const key = request.headers.get('x-kitchen-key');
  if (!authed(env, request, key)) return bad('Unauthorized.', 401);

  const status = url.searchParams.get('status');
  const stmt = status
    ? env.DB.prepare('SELECT * FROM orders WHERE status = ? ORDER BY delivery_date, created_at DESC LIMIT 300').bind(status)
    : env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 300');
  const { results } = await stmt.all();
  return json({ orders: results || [] });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  if (!authed(env, request, b.key)) return bad('Unauthorized.', 401);
  const id = (b.id || '').trim();
  const status = ['pending', 'paid', 'fulfilled', 'canceled'].includes(b.status) ? b.status : null;
  if (!id || !status) return bad('Missing id or valid status.');
  await env.DB.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').bind(status, now(), id).run();
  return json({ ok: true });
};
