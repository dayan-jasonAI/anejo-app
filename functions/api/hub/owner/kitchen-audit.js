// GET /api/hub/owner/kitchen-audit?order_id=&limit=
//   Owner view of the PIN-gated kitchen action trail: who (PIN-matched staff) checked off a
//   bowl, unchecked it, marked an order ready, or (Phase 3) confirmed it for delivery — and when.
//   Owner-only; ops data stays inside the HUB.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const orderId = (url.searchParams.get('order_id') || '').trim();
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10) || 100));

  let rows = [];
  try {
    const res = orderId
      ? await env.DB.prepare('SELECT * FROM kitchen_audit WHERE order_id = ? ORDER BY created_at DESC LIMIT ?').bind(orderId, limit).all()
      : await env.DB.prepare('SELECT * FROM kitchen_audit ORDER BY created_at DESC LIMIT ?').bind(limit).all();
    rows = (res && res.results) || [];
  } catch { rows = []; }

  return json({ ok: true, audit: rows });
};
