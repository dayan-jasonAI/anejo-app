// POST /api/hub/owner/ask — ask the HUB a question about the business. Owner-only.
//
// Deliberately NOT a rewrite of AI Ops. That page is a fixed suggestion queue (restock / route /
// payroll) that works and is already a human-in-the-loop approval flow. This adds the one thing it
// could not do: an open-ended question, and a way to turn the answer into something actionable
// WITHOUT building a second approval path. A proposed action is filed into the SAME `suggestions`
// table the queue already renders, so it is accepted or dismissed exactly like every other one.
//
// Two hard rules, both of which exist because a confident wrong number about your own business is
// worse than no answer:
//
//   1. READ-ONLY. The model never sees a write path. It is handed a bounded fact sheet assembled
//      here by deterministic SQL and answers from that alone. It cannot query, and it cannot act —
//      the ONLY thing it can cause is a pending row a human then approves.
//   2. THE NUMBERS ARE NOT THE MODEL'S. Every figure in the fact sheet is computed by the SQL
//      below and returned to the caller alongside the answer, so the owner can see what the answer
//      was based on rather than taking a sentence on trust.
import { json, bad, id, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';

const MODEL = 'claude-sonnet-4-6';
const MAX_Q = 400;

// Today in ET — the business day everyone in the kitchen is talking about, not UTC.
function etToday(ms) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(ms));
  const g = (t) => (p.find((x) => x.type === t) || {}).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

// Each fact is independently guarded: one missing table degrades that line to null rather than
// blanking the whole sheet. A partial fact sheet still answers most questions; a thrown one
// answers none.
async function one(env, sql, binds = []) {
  try {
    const st = env.DB.prepare(sql);
    return await (binds.length ? st.bind(...binds) : st).first();
  } catch { return null; }
}
async function many(env, sql, binds = []) {
  try {
    const st = env.DB.prepare(sql);
    const r = await (binds.length ? st.bind(...binds) : st).all();
    return (r && r.results) || [];
  } catch { return []; }
}

async function factSheet(env, t) {
  const today = etToday(t);
  const since30 = t - 30 * 86400000;

  const [ordersToday, orders30, subs, pendingSug, accounts, sites, unbilled, tickets, runs, lowStock] = await Promise.all([
    one(env, "SELECT COUNT(*) AS n, COALESCE(SUM(total_estimate_cents),0) AS cents FROM orders WHERE delivery_date = ?", [today]),
    one(env, "SELECT COUNT(*) AS n, COALESCE(SUM(total_estimate_cents),0) AS cents FROM orders WHERE created_at >= ?", [since30]),
    one(env, "SELECT COUNT(*) AS n FROM subscriptions WHERE status = 'active'"),
    one(env, "SELECT COUNT(*) AS n FROM suggestions WHERE status = 'pending'"),
    many(env, 'SELECT id, name, status, billing_email, invoice_cadence FROM contract_accounts ORDER BY name'),
    many(env, 'SELECT account_id, name, active, delivery_days, cutoff_time, price_per_lunch_cents FROM contract_sites ORDER BY name'),
    one(env, 'SELECT COUNT(*) AS n, COALESCE(SUM(total_cents),0) AS cents FROM contract_orders WHERE invoiced = 0'),
    one(env, "SELECT COUNT(*) AS n FROM tickets WHERE status IN ('open','pending')"),
    many(env, 'SELECT automation_type, outcome, started_at FROM agent_runs ORDER BY started_at DESC LIMIT 8'),
    many(env, 'SELECT name, on_hand, par_level FROM inventory_items WHERE par_level IS NOT NULL AND on_hand < par_level LIMIT 12'),
  ]);

  return {
    today,
    orders_today: { count: (ordersToday && ordersToday.n) || 0, revenue_cents: (ordersToday && ordersToday.cents) || 0 },
    orders_last_30d: { count: (orders30 && orders30.n) || 0, revenue_cents: (orders30 && orders30.cents) || 0 },
    active_subscriptions: (subs && subs.n) || 0,
    pending_suggestions: (pendingSug && pendingSug.n) || 0,
    open_tickets: (tickets && tickets.n) || 0,
    contract_accounts: accounts,
    contract_sites: sites,
    uninvoiced_contract_work: { days: (unbilled && unbilled.n) || 0, cents: (unbilled && unbilled.cents) || 0 },
    recent_automation_runs: runs,
    below_par_inventory: lowStock,
  };
}

const SYSTEM = [
  'You are the operations desk for Añejo Catering Co., answering the OWNER.',
  '',
  'You are given a JSON fact sheet read from the live database moments ago. Answer ONLY from it.',
  'If the fact sheet does not contain what was asked, say plainly which fact is missing and stop —',
  'never estimate, never infer a number that is not there, and never describe a capability you',
  'cannot see evidence of. A confident wrong number about his own business is the worst thing you',
  'can produce here.',
  '',
  'Money in the fact sheet is INTEGER CENTS. Convert to dollars when you speak.',
  'Be brief and concrete. Two or three sentences unless asked for more.',
  '',
  'If — and only if — the answer implies a specific action the owner should take, propose ONE, as',
  'a short imperative. You cannot perform it; it is filed for him to approve and carry out.',
  '',
  'Reply as JSON only: {"answer": string, "action": string|null}',
].join('\n');

async function askClaude(env, { question, facts }) {
  if (!env.ANTHROPIC_API_KEY) return { unavailable: true };
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        system: SYSTEM,
        messages: [{ role: 'user', content: `FACT SHEET:\n${JSON.stringify(facts)}\n\nQUESTION:\n${question}` }],
      }),
    });
    if (!r.ok) return { error: `Assistant returned ${r.status}.` };
    const j = await r.json();
    let text = ((j.content && j.content[0] && j.content[0].text) || '').trim();
    if (!text) return { error: 'The assistant returned nothing.' };
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    const start = text.search(/[[{]/);
    if (start > 0) text = text.slice(start);
    let data;
    // A model that ignored the JSON instruction still said something useful — keep the prose
    // rather than telling the owner it failed.
    try { data = JSON.parse(text); } catch { data = { answer: text, action: null }; }
    return {
      answer: String((data && data.answer) || '').trim(),
      action: data && data.action ? String(data.action).trim().slice(0, 300) : null,
      tokens: j.usage ? (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0) : null,
    };
  } catch (e) {
    return { error: 'Could not reach the assistant. ' + String((e && e.message) || '').slice(0, 100) };
  }
}

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const question = String((b && b.question) || '').trim().slice(0, MAX_Q);
  if (!question) return bad('Ask a question first.');

  const t = now();
  const facts = await factSheet(env, t);

  const res = await askClaude(env, { question, facts });

  // No key configured is a CONFIGURATION state, not a failure, and the fact sheet is genuinely
  // useful on its own — so return it rather than an error with nothing in it.
  if (res.unavailable) {
    return json({
      ok: true, question, answer: null, facts,
      unavailable: 'No ANTHROPIC_API_KEY is set, so the HUB cannot phrase an answer. The figures above are live.',
    });
  }
  if (res.error) return bad(res.error, 502);

  // File the proposed action into the EXISTING queue — same table, same accept/dismiss the
  // automations use. Type is distinct so the desk can label it honestly: nothing executes it, and
  // accepting is the owner recording the decision (the same shape payroll_prep already has).
  let suggestion_id = null;
  if (res.action && b.file_action !== false) {
    suggestion_id = id('sug');
    try {
      await env.DB.prepare(
        'INSERT INTO suggestions (id, suggestion_type, summary, payload, status, created_at) VALUES (?,?,?,?,?,?)'
      ).bind(
        suggestion_id, 'owner_ask', res.action,
        JSON.stringify({ question, answer: res.answer, asked_by: ctx.distinct_id || null, asked_at: t }),
        'pending', t,
      ).run();
    } catch { suggestion_id = null; }   // the answer still stands if the queue write fails
  }

  await capture(env, {
    event: 'hub.question_asked',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { chars: question.length, filed: !!suggestion_id, tokens: res.tokens || 0 },
  });

  return json({
    ok: true,
    question,
    answer: res.answer,
    action: res.action || null,
    suggestion_id,
    // Returned deliberately: the owner can check the answer against the numbers it came from.
    facts,
  });
};
