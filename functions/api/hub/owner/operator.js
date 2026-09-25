import { loadAnaHeartbeat, anaHeartbeatText } from '../../../_lib/ana_heartbeat.js';
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
//   4. NO KEY ⇒ NO MODEL ANSWER. Deterministic capability/status reads remain available. It never
//      fabricates a reply — a confident wrong answer about tonight's orders is worse than
//      silence, because someone would cook to it.
//   5. It is READ-ONLY. It reports; it does not place orders, refund, message customers, or
//      mutate anything. There is no write path in this file, by construction.
import { privateIntent, privateResult, readAuditStatus } from '../../../_lib/operator_commands.js';
import { SOCIAL_AUDIT_CURRENT } from '../../../_lib/social_audit.js';
import { loadSocialHeartbeat } from '../../../_lib/social_heartbeat.js';
import { json } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { budgetGate, recordSpend } from '../../../_lib/ai_budget.js';

const MODEL = 'claude-haiku-4-5-20251001';

/** Safe single-row read: a missing table must not take down the whole context. */
async function one(env, sql, binds = []) {
  try { return await env.DB.prepare(sql).bind(...binds).first(); } catch (_) { return null; }
}
async function many(env, sql, binds = [], limit = 25) {
  try {
    const r = await env.DB.prepare(sql).bind(...binds).all();
    return r?.success === false || !Array.isArray(r?.results) ? null : r.results.slice(0, limit);
  } catch (_) { return null; }
}

/**
 * Assemble the live context. Failed reads stay unavailable; only successful aggregate reads establish zero.
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
export function operatorBusinessDate(at = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(at));
  const date = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${date.year}-${date.month}-${date.day}`;
}

export async function buildContext(env, at = Date.now()) {
  const today = operatorBusinessDate(at);
  const [orders, dueToday, customers, rewards, unpaid, dueCount] = await Promise.all([
    one(env, 'SELECT COUNT(*) AS n FROM orders'),
    many(env, "SELECT id, customer_name, status, total_estimate_cents, delivery_date, delivery_window FROM orders WHERE delivery_date = ? ORDER BY delivery_window LIMIT 25", [today]),
    one(env, "SELECT COUNT(DISTINCT customer_email) AS n FROM orders WHERE customer_email IS NOT NULL AND customer_email != ''"),
    one(env, 'SELECT COUNT(DISTINCT email) AS n, COALESCE(SUM(delta),0) AS pts FROM points_ledger'),
    one(env, "SELECT COUNT(*) AS n FROM orders WHERE status = 'pending'"),
    one(env, 'SELECT COUNT(*) AS n FROM orders WHERE delivery_date = ?', [today]),
  ]);
  const upcoming = await many(env,
    "SELECT id, customer_name, status, total_estimate_cents, delivery_date, delivery_window FROM orders WHERE delivery_date >= ? ORDER BY delivery_date LIMIT 12", [today]);

  const money = (c) => (Number(c || 0) / 100).toFixed(2);
  const line = (o) => `  - [${o.id}] ${o.customer_name || '(no name)'} · ${o.status} · $${money(o.total_estimate_cents)} · ${o.delivery_date}${o.delivery_window ? ' ' + o.delivery_window : ''}`;

  const lines = [];
  lines.push(`TODAY: ${today} (America/New_York)`);
  lines.push(`TOTAL ORDERS ON RECORD: ${orders?.n ?? 'unavailable'}`);
  lines.push(`CATERING CUSTOMERS (distinct emails on orders): ${customers?.n ?? 'unavailable'}`);
  lines.push(`ORDERS AWAITING PAYMENT (status=pending): ${unpaid?.n ?? 'unavailable'}`);
  lines.push(`REWARDS: ${rewards?.n ?? 'unavailable'} members · ${rewards?.pts ?? 'unavailable'} net points outstanding`);
  lines.push('');
  lines.push(`DELIVERING TODAY (${dueCount?.n ?? 'unavailable'} total; showing up to 25):`);
  lines.push(dueToday === null ? '  (delivery query unavailable)' : dueToday.length ? dueToday.map(line).join('\n') : '  (nothing scheduled for delivery today)');
  lines.push('');
  lines.push('UPCOMING DELIVERIES (showing up to 12):');
  lines.push(upcoming === null ? '  (upcoming delivery query unavailable)' : upcoming.length ? upcoming.map(line).join('\n') : '  (no upcoming deliveries on record)');

  return {
    text: lines.join('\n'),
    business_date: today, time_zone: 'America/New_York', observed_at: new Date(at).toISOString(),
    unavailable: Object.entries({ orders, dueToday, customers, rewards, unpaid, dueCount, upcoming }).filter(([, value]) => value === null).map(([key]) => key),
    counts: { orders: orders?.n ?? null, deliveringToday: dueCount?.n ?? null, customers: customers?.n ?? null, rewardsMembers: rewards?.n ?? null, pendingPayment: unpaid?.n ?? null },
  };
}

// This reports implemented scope, never provider health or permission to act.
export function operatorCapabilities() {
  return {
    mode: 'read_only', mutations: false,
    deterministic_commands: ['capabilities', 'marketing status', 'open photos', 'open create & schedule', 'show drafts', 'show audit status', 'draft campaign brief: topic', 'show saved campaign ideas'],
    model_questions: ['orders', 'deliveries', 'rewards'],
    unavailable_actions: ['publish posts', 'send customer replies', 'change orders', 'refunds', 'Google review replies'],
  };
}

export async function marketingStatus(env) {
  const observedAt = Date.now();
  const queue = await many(env, 'SELECT status, COUNT(*) AS n FROM social_posts GROUP BY status');
  let autoReply = null;
  try {
    const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key='social.auto_reply'").first();
    autoReply = ['dm', 'comment', 'both'].includes(row?.value) ? row.value : 'off';
  } catch { /* unreadable is unknown, not off */ }
  const heartbeat = await loadSocialHeartbeat(env, observedAt);
  const timestamp = value => Number.isFinite(value) && value > 0 && value <= 8640000000000000 ? new Date(value).toISOString() : null;
  const scheduler = {
    observed_state: heartbeat.status === 'running' ? 'started_not_completed' : heartbeat.status,
    source: ['cron','owner'].includes(heartbeat.source) ? heartbeat.source : 'unknown',
    started_at: timestamp(heartbeat.started_at), completed_at: timestamp(heartbeat.completed_at),
    last_success_at: timestamp(heartbeat.last_success_at),
    error: heartbeat.error || null, reason: heartbeat.reason || null,
    counts: heartbeat.counts || null,
  };
  return { observed_at: new Date(observedAt).toISOString(), queue, ana_auto_reply_setting: autoReply,
    scheduler, ana_inbox: await loadAnaHeartbeat(env, observedAt), execution_health: 'unverified', google_review_replies: 'not_integrated' };
}

export function schedulerStatusText(scheduler) {
  if (!scheduler || scheduler.observed_state === 'unknown') return 'Scheduler evidence is unavailable.';
  const source = scheduler.source === 'cron' ? 'Cron' : scheduler.source === 'owner' ? 'Owner-triggered check' : 'Unknown trigger';
  return `${source} record: ${scheduler.observed_state}; started ${scheduler.started_at || 'unknown'}, completed ${scheduler.completed_at || 'not recorded'}. Last recorded successful tick: ${scheduler.last_success_at || 'none'}. Recorded error: ${scheduler.error || 'none'}. This does not prove current execution or successful delivery of a specific post.`;

}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  return json({ ok: true, capabilities: operatorCapabilities() });
};

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

  let body = {};
  try { body = await request.json(); } catch (_) {}
  const message = String(body.message || '').trim().slice(0, 2000);
  if (!message) return json({ ok: false, error: 'message required' }, 400);

  const intent = privateIntent(message);
  const privateReply = privateResult(intent);
  if (privateReply) {
    if (intent.kind === 'audit_status') {
      privateReply.audit = await readAuditStatus(env.DB, SOCIAL_AUDIT_CURRENT);
      privateReply.receipt.observed_at = privateReply.audit.observed_at;
      privateReply.reply = privateReply.audit.available
        ? `Saved audit status observed at ${privateReply.audit.observed_at}, latest 60 posts only. A current pass is not permission to publish.`
        : 'Saved audit evidence is unavailable. No audit was run.';
    }
    return json(privateReply, privateReply.ok ? 200 : 400);
  }

  const command = message.toLowerCase().replace(/[?!.]+$/, '').trim();
  if (['help', 'capabilities', 'what can you do', 'qué puedes hacer', 'que puedes hacer'].includes(command)) {
    return json({ ok: true, reply: 'I can report orders, deliveries, rewards and marketing queue status, offer private Photos/Create/drafts navigation, read saved audit status, and preview your campaign idea with an explicit private save button. Say “show saved campaign ideas” to read them later. Saved ideas contain your words only, not generated strategy. I cannot publish, send replies, change orders or answer Google reviews. Those actions are not connected to this operator.', capabilities: operatorCapabilities(), receipt: { mode: 'deterministic', mutation: false } });
  }
  if (['marketing status', 'marketing team status', 'estado de marketing'].includes(command)) {
    const status = await marketingStatus(env);
    const queue = status.queue === null ? 'The marketing queue is unavailable.' : status.queue.length ? status.queue.map(row => `${row.n} ${row.status}`).join(', ') + '.' : 'The marketing queue is empty.';
    return json({ ok: true, reply: `Queue observed at ${status.observed_at}: ${queue} ${schedulerStatusText(status.scheduler)} ${anaHeartbeatText(status.ana_inbox)} Ana’s saved auto-reply setting is ${status.ana_auto_reply_setting ?? 'unavailable'}. This is configuration, not proof that replies or scheduled posts are running. Google review replies are not integrated.`, status, receipt: { mode: 'deterministic', mutation: false, observed_at: status.observed_at } });
  }

  // No key ⇒ honest refusal. Never a fabricated operator turn.
  if (!env.ANTHROPIC_API_KEY) {
    return json({
      ok: false,
      error: 'operator_unavailable',
      detail: 'No ANTHROPIC_API_KEY bound to this project. The operator refuses rather than inventing an answer about your orders.',
    }, 501);
  }

  if (!env.DB) return json({ ok: false, error: 'no_database', detail: 'D1 is not bound; there is nothing to ground an answer in.' }, 501);

  // Same honest-refusal doctrine as the missing key: over the weekly AI budget the operator
  // says so rather than quietly billing past the owner's own ceiling.
  const gate = await budgetGate(env);
  if (!gate.ok) {
    return json({
      ok: false,
      error: 'operator_unavailable',
      detail: gate.reason === 'budget_unavailable' ? 'The AI budget ledger is unavailable. Paid calls are paused until it can be verified.' : 'The weekly AI budget is spent. The operator refuses rather than exceeding the $50/week ceiling you set.',
    }, 503);
  }

  const data = await buildContext(env);
  if (data.unavailable.length) return json({ ok: false, error: 'context_unavailable', detail: 'Some operational records could not be read. I cannot verify the answer right now.', receipt: { ...data, text: undefined } }, 503);

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
    await recordSpend(env, { feature: 'operator', model: MODEL, usage: j?.usage });
    const reply = (j?.content || []).map((b) => b.text || '').join('').trim();
    if (!reply) return json({ ok: false, error: 'empty_reply', detail: j?.error?.message || 'model returned nothing' }, 502);

    return json({
      ok: true,
      reply,
      // The receipt makes the grounding auditable: what it actually read to answer.
      receipt: { business: 'anejo', model: MODEL, grounding: 'Añejo D1 — orders and points_ledger, read at question time', business_date: data.business_date, time_zone: data.time_zone, observed_at: data.observed_at, ...data.counts },
    });
  } catch (e) {
    return json({ ok: false, error: 'operator_failed', detail: String(e.message).slice(0, 200) }, 502);
  }
};
