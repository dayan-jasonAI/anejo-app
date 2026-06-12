// POST /api/feedback — public, token-gated post-delivery rating ("how did we do?").
// Body: { t: <delivery public_token>, rating: 1..5, comment? }
// Smart routing: rating ≥ 4 → we surface the Google review link (env.GOOGLE_REVIEW_URL);
// rating ≤ 3 → recorded privately + raises a negative_sentiment alert so the owner can make
// it right before it becomes a public 1-star. Always stored in delivery_feedback.
import { json, bad, id, now } from '../_lib/util.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { raiseAlert } from '../_lib/alerts.js';

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'feedback', limit: 20, windowSec: 60 });
  if (limited) return limited;
  if (!env.DB) return bad('Not available.', 503);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid request.'); }
  const token = (b && b.t || '').toString().trim();
  const rating = Math.round(Number(b && b.rating));
  const comment = (b && b.comment || '').toString().trim().slice(0, 1000) || null;
  if (!token) return bad('Missing token.');
  if (!(rating >= 1 && rating <= 5)) return bad('Please choose a 1–5 rating.');

  // Resolve the delivery by its public token, with the order's customer for context.
  const row = await env.DB.prepare(
    'SELECT d.id AS delivery_id, d.order_id, o.customer_name, o.customer_email ' +
    'FROM deliveries d LEFT JOIN orders o ON o.id = d.order_id WHERE d.public_token = ? LIMIT 1'
  ).bind(token).first().catch(() => null);
  if (!row) return bad('We couldn’t find that delivery.', 404);

  const routedTo = rating >= 4 ? 'google' : 'internal';
  const t = now();

  // One feedback row per delivery — overwrite if they re-submit.
  await env.DB.prepare('DELETE FROM delivery_feedback WHERE delivery_id = ?').bind(row.delivery_id).run().catch(() => {});
  await env.DB.prepare(
    'INSERT INTO delivery_feedback (id, order_id, delivery_id, client_email, rating, comment, routed_to, created_at) VALUES (?,?,?,?,?,?,?,?)'
  ).bind(id('fb'), row.order_id, row.delivery_id, row.customer_email || null, rating, comment, routedTo, t).run();

  // Low rating → alert the owner to follow up.
  if (rating <= 3) {
    const who = (row.customer_name || '').split(' ')[0] || 'A customer';
    await raiseAlert(env, {
      alert_type: 'negative_sentiment', severity: rating <= 2 ? 'high' : 'medium',
      title: `${rating}★ delivery feedback — ${who}`,
      body: `${who} rated a delivery ${rating}/5.${comment ? ' “' + comment + '”' : ''} Reach out to make it right.`,
      ref_type: 'order', ref_id: row.order_id, dedupe_key: 'fb_' + row.delivery_id,
    }).catch(() => {});
  }

  const reviewUrl = (rating >= 4 && env.GOOGLE_REVIEW_URL) ? env.GOOGLE_REVIEW_URL : null;
  return json({ ok: true, routed_to: routedTo, review_url: reviewUrl });
};
