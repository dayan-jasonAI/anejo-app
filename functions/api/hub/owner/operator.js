// POST /api/hub/owner/operator — the Añejo Voice Operator.
//
// Part 3 of the DMD Venture standard (Client App · Website · HUB = CRM + VOICE OPERATOR ·
// Self-Training). Dayan's ruling 2026-07-20: the operator exists in DRH and must exist in all
// three businesses. Añejo had none.
//
// GROUNDING LAWS — ported deliberately from core-hub/operator-d1.mjs, do not weaken:
//   1. It answers ONLY from Añejo's real rows, read live at question time.
//   2. Owner-only, through the same requireRole gate as every other owner endpoint.
//   3. The system prompt fences it to Añejo and FORBIDS inventing orders, customers, numbers
//      or dates. If the data does not answer the question it must say so plainly.
//   4. NO KEY ⇒ NO ANSWER. Without ANTHROPIC_API_KEY it returns an honest 501. It never
//      fabricates a reply — a confident wrong answer about tonight's orders is worse than
//      silence, because someone would cook to it.
//   5. It is READ-ONLY. It reports; it does not place orders, refund, message customers, or
//      mutate anything. There is no write path in this file, by construction.
import { json } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';

const MODEL = 'claude-haiku-4-5-20251001';

/** Safe single-row read: a missing table must not take down the whole context. */
async function one(env, sql, binds = []) {
  try { return await env.DB.prepare(sql).bind(...binds).first(); } catch (_) { return null; }
}
async function many(env, sql, binds = [], limit = 25) {
  try {
    const r = await env.DB.prepare(sql).bind(...binds).all();
    return (r?.results || []).slice(0, limit);
  } catch (_) { return []; }
}

/**
 * Assemble the live context. Everything here is a real row or an honest zero.
 *
 * SCHEMA NOTES (verified against migrations before writing — my first draft guessed all three
 * wrong, which is exactly how a confident-sounding wrong answer gets shipped):
 *   • the money column is `total_estimate_cents`, NOT `total_cents`
 *   • `created_at` is an EPOCH INTEGER, not a date string — substr() on it returns garbage.
 *     `delivery_date` (TEXT 'YYYY-MM-DD') is both correct AND the more useful axis: a caterer
 *     cares what goes out today, not what was booked today.
 *   • `clients` is the TRAINER's client table (trainer_id, height_cm, goals) — the meal-prep
 *     side of the business, not catering customers. Catering customers are distinct
 *     customer_email values on orders.
 */
async function buildContext(env) {
  const today = new Date().toISOString().slice(0, 10);
  const [orders, dueToday, customers, rewards, unpaid] = await Promise.all([
    one(env, 'SELECT COUNT(*) AS n FROM orders'),
    many(env, "SELECT id, customer_name, status, total_estimate_cents, delivery_date, delivery_window FROM orders WHERE delivery_date = ? ORDER BY delivery_window", [today]),
    one(env, "SELECT COUNT(DISTINCT customer_email) AS n FROM orders WHERE customer_email IS NOT NULL AND customer_email != ''"),
    one(env, 'SELECT COUNT(DISTINCT email) AS n, COALESCE(SUM(delta),0) AS pts FROM points_ledger'),
    one(env, "SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'"),
  ]);
  const upcoming = await many(env,
    "SELECT id, customer_name, status, total_estimate_cents, delivery_date, delivery_window FROM orders WHERE delivery_date >= ? ORDER BY delivery_date LIMIT 12", [today]);

  const money = (c) => (Number(c || 0) / 100).toFixed(2);
  const line = (o) => `  - [${o.id}] ${o.customer_name || '(no name)'} · ${o.status} · $${money(o.total_estimate_cents)} · ${o.delivery_date}${o.delivery_window ? ' ' + o.delivery_window : ''}`;

  const lines = [];
  lines.push(`TODAY: ${today}`);
  lines.push(`TOTAL ORDERS ON RECORD: ${orders?.n ?? 0}`);
  lines.push(`CATERING CUSTOMERS (distinct emails on orders): ${customers?.n ?? 0}`);
  lines.push(`ORDERS AWAITING PAYMENT (status=pending): ${unpaid?.n ?? 0}`);
  lines.push(`REWARDS: ${rewards?.n ?? 0} members · ${rewards?.pts ?? 0} net points outstanding`);
  lines.push('');
  lines.push(`DELIVERING TODAY (${dueToday.length}):`);
  lines.push(dueToday.length ? dueToday.map(line).join('\n') : '  (nothing scheduled for delivery today)');
  lines.push('');
  lines.push('UPCOMING DELIVERIES:');
  lines.push(upcoming.length ? upcoming.map(line).join('\n') : '  (no upcoming deliveries on record)');

  return {
    text: lines.join('\n'),
    counts: { orders: orders?.n ?? 0, deliveringToday: dueToday.length, customers: customers?.n ?? 0, rewardsMembers: rewards?.n ?? 0, pendingPayment: unpaid?.n ?? 0 },
  };
}

const SYSTEM = `You are the Añejo Voice Operator — the owner's hands-free view of Añejo Catering Co.

You are speaking to Dayan, the owner. Answer from the ANEJO DATA block only.

HARD RULES:
- NEVER invent an order, a customer, a number, or a date. If the data below does not answer the
  question, say plainly what is missing. "I don't have that" is a correct and useful answer.
- Do not estimate, extrapolate, or fill gaps with what is typical for catering businesses.
- You see ONLY Añejo. You know nothing about DRH, Aether, or any other business.
- You are READ-ONLY. You cannot place orders, refund, message customers, or change anything.
  If asked to act, say what you would change and that the owner must do it in the hub.
- Cite record ids in [brackets] when referring to specific orders.

VOICE: you are usually being listened to, not read. Lead with the answer. Keep it short and
concrete. No preamble, no filler, no restating the question.`;

export const onRequestPost = async ({ request, env }) => {
  // Signature is requireRole(request, env, roles) and it returns EITHER the role context OR a
  // Response. My first draft had the arguments swapped and checked a `.ok` field that does not
  // exist — the same wrong-shape error class as the signup bug. Matched to how every other
  // owner endpoint calls it (see overview.js:20).
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  // No key ⇒ honest refusal. Never a fabricated operator turn.
  if (!env.ANTHROPIC_API_KEY) {
    return json({
      ok: false,
      error: 'operator_unavailable',
      detail: 'No ANTHROPIC_API_KEY bound to this project. The operator refuses rather than inventing an answer about your orders.',
    }, 501);
  }

  let body = {};
  try { body = await request.json(); } catch (_) {}
  const message = String(body.message || '').trim().slice(0, 2000);
  if (!message) return json({ ok: false, error: 'message required' }, 400);

  if (!env.DB) return json({ ok: false, error: 'no_database', detail: 'D1 is not bound; there is nothing to ground an answer in.' }, 501);

  const data = await buildContext(env);

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 900,
        system: SYSTEM,
        messages: [{ role: 'user', content: `=== ANEJO DATA (live, read just now) ===\n${data.text}\n\n=== QUESTION ===\n${message}` }],
      }),
    });
    const j = await r.json();
    const reply = (j?.content || []).map((b) => b.text || '').join('').trim();
    if (!reply) return json({ ok: false, error: 'empty_reply', detail: j?.error?.message || 'model returned nothing' }, 502);

    return json({
      ok: true,
      reply,
      // The receipt makes the grounding auditable: what it actually read to answer.
      receipt: { business: 'anejo', model: MODEL, grounding: 'Añejo D1 — orders, clients, points_ledger, read at question time', ...data.counts },
    });
  } catch (e) {
    return json({ ok: false, error: 'operator_failed', detail: String(e.message).slice(0, 200) }, 502);
  }
};
