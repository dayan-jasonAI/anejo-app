// The Añejo Marketing Team Lead — the strategy half of the marketing team. Files under
// functions/_lib are NOT routed.
//
// The Lead TALKS and PROPOSES; it never touches the outside world. Its whole output is words
// plus up to three machine-readable action blocks per reply, and the three allowed actions all
// write DRAFT rows the owner reviews elsewhere (a brief, an intel question, planner drafts).
// Scheduling and publishing are deliberately impossible from this file — the owner's decision
// #1/#4 — and a source-pinned test enforces that the publish/schedule machinery is never even
// imported here.
//
// Everything the Lead knows arrives through buildSpine(): brand brief, live menu, latest
// Instagram numbers, the draft queue, the week's AI spend, recent briefs. The first planner run
// taught the invented-deadline lesson — a model asked about operations it cannot see will make
// them up — so the prompt binds the Lead to the spine and gives it request_intel as the honest
// alternative to guessing.
import { budgetGate, recordSpend, weekSpend, WEEKLY_LIMIT_MICRO } from './ai_budget.js';
import { BRAND_CONTEXT } from './brand_context.js';
import { loadMenu, isAvailable, isOrderable } from './menu.js';

// Strategy is the one surface worth frontier tokens: it runs a handful of times a day, owner-
// initiated, and its output steers every cheaper call downstream. But a model id in an env var
// is a fact about the future ("model_not_found" the week a name rotates), so the caller must
// survive it — see the fallback in leadReply.
export const FALLBACK_MODEL = 'claude-sonnet-4-6';
export const leadModel = (env) => (env && env.TEAM_LEAD_MODEL) || 'claude-opus-4-6';

// The only verbs the Lead may emit. An executor keyed off this list — rather than off "whatever
// the block says" — is what keeps a creative model from inventing a fourth verb that does
// something nobody reviewed.
export const ALLOWED_ACTIONS = ['create_brief', 'request_intel', 'draft_posts'];

async function rows(env, sql, ...args) {
  try {
    const r = await env.DB.prepare(sql).bind(...args).all();
    return (r && r.results) || [];
  } catch { return []; }
}

async function firstRow(env, sql, ...args) {
  try { return await env.DB.prepare(sql).bind(...args).first(); } catch { return null; }
}

/**
 * Everything the Lead is allowed to treat as true, assembled fresh per reply.
 * Returns { menu, metrics, drafts, budget, briefs, brand } — structured, so the API can serve
 * the summary and the prompt can render the text from ONE gathering pass that cannot drift.
 */
export async function buildSpine(env) {
  // Live menu — names, prices, availability. Same rows the storefront charges from, so the Lead
  // can never argue for a campaign around a bowl that is off sale without knowing it is off sale.
  const menu = await loadMenu(env);
  const bowls = (menu.items || []).filter((it) => it.kind === 'bowl');
  const menuItems = bowls.map((b) => ({
    name: b.name || String(b.id).toUpperCase(),
    price_usd: Math.round(b.price_cents || 0) / 100,
    available: isAvailable(b) && isOrderable(b),
  }));

  // Latest account snapshot + the strongest three and weakest one posts from the newest capture
  // day. Top-3/bottom-1 is the same shape performanceBrief feeds the planner: enough signal to
  // steer, small enough that the Lead reads numbers instead of drowning in them.
  const account = await firstRow(env,
    'SELECT capture_date, followers, media_count FROM ig_account_metrics ORDER BY capture_date DESC LIMIT 1');
  const ranked = await rows(env,
    `SELECT caption, media_type, likes, comments, reach, saved FROM ig_media_metrics
      WHERE capture_date = (SELECT MAX(capture_date) FROM ig_media_metrics)
      ORDER BY COALESCE(reach, likes, 0) DESC LIMIT 25`);
  const metrics = {
    account: account || null,
    top_posts: ranked.slice(0, 3),
    bottom_post: ranked.length > 3 ? ranked[ranked.length - 1] : null,
  };

  // The approval queue as it stands — the Lead should argue about what to make NEXT, and
  // "seventeen drafts are already waiting" is the strongest argument for making nothing.
  const draftRows = await rows(env,
    "SELECT caption FROM social_posts WHERE status='draft' ORDER BY created_at DESC LIMIT 20");
  const drafts = {
    count: draftRows.length,
    titles: draftRows.map((d) => String(d.caption || '').split('\n')[0].slice(0, 80)),
  };

  // This week's spend against the $50 ceiling, via ai_budget's own accessor so "this week" is
  // decided in exactly one place. Rendered in dollars because the Lead reasons (and the owner
  // reads) in dollars — the ledger's microdollars stay in the ledger.
  const spentMicro = await weekSpend(env);
  const budget = {
    spent_usd: Math.round(spentMicro / 10000) / 100,
    limit_usd: WEEKLY_LIMIT_MICRO / 1_000_000,
    remaining_usd: Math.max(0, Math.round((WEEKLY_LIMIT_MICRO - spentMicro) / 10000) / 100),
  };

  const briefs = await rows(env,
    'SELECT id, title, objective, status, created_at FROM team_briefs ORDER BY created_at DESC LIMIT 5');

  // Ordering surfaces — fixed facts the Lead kept (correctly) refusing to invent and spending
  // request_intel on. Cheaper to state them once than to answer the same intel question weekly.
  const surfaces = {
    order_url: 'https://anejocateringco.com/order',
    links_hub: 'https://anejocateringco.com/go',
    macro_portal: 'https://anejocateringco.com/portal',
    macro_calculator: 'https://anejocateringco.com/calculator',
    ordering: 'Order online at /order — one-time boxes or weekly plans (5, 10 or 12 meals); plans pause/skip/cancel anytime. Next-day orders until 8 PM ET; the website is the authority on cutoffs.',
  };

  return { brand: BRAND_CONTEXT, menu: menuItems, metrics, drafts, budget, briefs, surfaces };
}

// The spine as prompt text. Facts the spine does not have are stated as absent, in words, so the
// model's honest move (ask via request_intel) is easier than its dishonest one (invent).
export function renderSpine(spine) {
  const menuLines = spine.menu.length
    ? spine.menu.map((m) => `- ${m.name} ($${m.price_usd.toFixed(2)})${m.available ? '' : ' — OFF SALE right now, do not build campaigns that promote it'}`).join('\n')
    : '- (menu unavailable right now)';
  const acct = spine.metrics.account;
  const postLine = (p, i) => `${i}. [${p.media_type || 'POST'}] "${String(p.caption || '').slice(0, 90)}" — ` +
    ['reach ' + (p.reach ?? '?'), (p.likes ?? '?') + ' likes', (p.saved ?? '?') + ' saves', (p.comments ?? '?') + ' comments'].join(', ');
  const metricLines = acct
    ? `Followers: ${acct.followers ?? 'unknown'} (as of ${acct.capture_date}, media count ${acct.media_count ?? 'unknown'}).\n` +
      (spine.metrics.top_posts.length
        ? 'Best recent posts:\n' + spine.metrics.top_posts.map((p, i) => postLine(p, i + 1)).join('\n') +
          (spine.metrics.bottom_post ? '\nWeakest:\n' + postLine(spine.metrics.bottom_post, spine.metrics.top_posts.length + 1) : '')
        : 'No per-post metrics captured yet.')
    : 'No Instagram metrics captured yet — do not state follower counts or post performance.';
  const draftLines = spine.drafts.count
    ? `${spine.drafts.count} post drafts already await owner approval:\n` + spine.drafts.titles.map((t) => `- ${t}`).join('\n')
    : 'The draft queue is empty.';
  const briefLines = spine.briefs.length
    ? spine.briefs.map((b) => `- [${b.status}] ${b.title}${b.objective ? ' — ' + String(b.objective).slice(0, 100) : ''}`).join('\n')
    : '(none yet)';
  return (
    '=== AÑEJO BRAND BRIEF (verbatim, the authority on voice and standards) ===\n' + spine.brand + '\n=== END BRIEF ===\n\n' +
    '=== ON THE MENU RIGHT NOW (live prices; the only items that exist) ===\n' + menuLines + '\n\n' +
    '=== INSTAGRAM PERFORMANCE ===\n' + metricLines + '\n\n' +
    '=== DRAFT QUEUE ===\n' + draftLines + '\n\n' +
    (spine.surfaces
      ? '=== ORDERING SURFACES (fixed facts — use these, do not spend intel re-asking) ===\n' +
        `Order: ${spine.surfaces.order_url} · Links hub: ${spine.surfaces.links_hub} · ` +
        `Macro portal: ${spine.surfaces.macro_portal} · Macro calculator: ${spine.surfaces.macro_calculator}\n` +
        spine.surfaces.ordering + '\n\n'
      : '') +
    `=== AI BUDGET === This week's model spend: $${spine.budget.spent_usd.toFixed(2)} of the $${spine.budget.limit_usd.toFixed(2)} weekly ceiling ` +
    `($${spine.budget.remaining_usd.toFixed(2)} left). Factor this into how much generation you propose.\n\n` +
    '=== RECENT CAMPAIGN BRIEFS ===\n' + briefLines
  );
}

const SYSTEM_RULES =
  'You are the Añejo Marketing Team Lead — the strategist on a small marketing team for Añejo ' +
  'Catering Co., reporting directly to the owner. Your job: PROPOSE strategy with reasoning the ' +
  'owner can argue with, write campaign briefs, and delegate drafting work to the content pipeline.\n\n' +
  'HARD RULES:\n' +
  '1. You NEVER schedule and NEVER publish anything. Approving, scheduling and publishing are the ' +
  "owner's decisions alone, made outside this chat. Do not offer to do them, do not claim to have " +
  'done them.\n' +
  '2. You only state operational facts that appear in the context above — menu, prices, metrics, ' +
  'budget, briefs. Ordering cutoffs, delivery areas, discounts, dates: if it is not in the context, ' +
  'you do not know it. Never invent one; use a request_intel action to ask instead.\n' +
  '3. Customer-facing copy you draft speaks as "Aña", the Añejo assistant persona, and follows the ' +
  'brand brief above.\n\n' +
  'ACTIONS: you may end a reply with up to THREE fenced json blocks, and only these forms:\n' +
  '```json\n{"action":"create_brief","title":"...","objective":"...","audience":"...","angle":"...",' +
  '"channels":["instagram"],"cadence":"...","success_metric":"...","assets":[]}\n```\n' +
  '```json\n{"action":"request_intel","question":"one specific question you need answered"}\n```\n' +
  '```json\n{"action":"draft_posts","brief_id":"...","count":2,"assets":[{"caption":"...","image_brief":"one sentence of art direction"}]}\n```\n' +
  'draft_posts requires assets (max 5) — one caption + image_brief per post; they land as DRAFTS ' +
  'for owner review, never on the schedule. Emit an action only when the conversation has actually ' +
  'earned it; plain discussion needs no block.\n' +
  'EXECUTION TRUTH: an action block is a REQUEST, not a result. After each of your messages a ' +
  '[system record] line states what actually executed. Never tell the owner an action ran, a draft ' +
  'exists, or a brief was filed unless that record (or the context above) confirms it — if the ' +
  'record is missing or says FAILED/DROPPED, say so plainly and re-emit if still needed.';

/**
 * Extract and validate EVERY action block from a Lead reply, capped at 3.
 *
 * The first version took only the first block and silently dropped the rest — and the Lead,
 * never told, asserted phantom state to the owner ("draft #5 is in your queue" about a draft
 * that never existed). Every block is now accounted for: valid ones execute in order, and each
 * dropped one comes back as {dropped, reason} so the Lead's next context contains the truth.
 */
export const MAX_ACTIONS_PER_REPLY = 3;
export function parseActionBlocks(text) {
  const out = [];
  const re = /```json\s*([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(String(text || ''))) !== null) {
    if (out.length >= MAX_ACTIONS_PER_REPLY) { out.push({ dropped: true, reason: `over the ${MAX_ACTIONS_PER_REPLY}-action cap` }); continue; }
    let obj;
    try { obj = JSON.parse(m[1]); } catch { out.push({ dropped: true, reason: 'unparseable JSON block' }); continue; }
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { out.push({ dropped: true, reason: 'not an action object' }); continue; }
    if (!ALLOWED_ACTIONS.includes(obj.action)) { out.push({ dropped: true, reason: `unknown action '${String(obj.action).slice(0, 30)}'` }); continue; }
    out.push(obj);
  }
  return out;
}
/** Back-compat single-block view used by older pins: the first VALID action or null. */
export function parseActionBlock(text) {
  return parseActionBlocks(text).find((a) => !a.dropped) || null;
}

// One messages call. Returns the raw Response-parsed body plus status so the caller can tell
// "model does not exist" from "network down" — they need different follow-ups.
async function callModel(env, model, { system, messages, maxTokens }) {
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
    });
    const j = await r.json().catch(() => null);
    return { status: r.status, ok: r.ok, body: j };
  } catch (e) {
    return { status: 0, ok: false, error: String((e && e.message) || e).slice(0, 200) };
  }
}

// Anthropic answers a bad model id with a not_found_error naming the model. Matched loosely on
// purpose: the exact message wording is theirs to change, the error type is the contract.
function isModelNotFound(res) {
  const e = res && res.body && res.body.error;
  return !!(e && (e.type === 'not_found_error' || /model/i.test(String(e.message || '')) && res.status === 404));
}

/**
 * One turn of the strategy conversation.
 *   history: [{role:'owner'|'lead', body}] oldest-first (prior turns; NOT the new message)
 *   message: the owner's new message
 * Returns { ok, text, action, model } or { ok:false, reason }.
 * `model` reports which model actually answered — the frontier id, or the fallback when the
 * configured id came back model_not_found.
 */
export async function leadReply(env, { history = [], message } = {}) {
  if (!env || !env.ANTHROPIC_API_KEY) return { ok: false, reason: 'no_api_key' };
  // The $50/week ceiling is HARD, and the strategy chat gets no exemption for being the
  // owner's own surface — at the limit the honest answer is the refusal, in plain words.
  const gate = await budgetGate(env);
  if (!gate.ok) return { ok: false, reason: 'budget', spent: gate.spent };

  const spine = await buildSpine(env);
  const system = SYSTEM_RULES + '\n\n' + renderSpine(spine);
  const messages = [
    ...history.slice(-20).map((m) => ({ role: m.role === 'lead' ? 'assistant' : 'user', content: String(m.body || '') })),
    { role: 'user', content: String(message || '') },
  ].filter((m) => m.content);

  let model = leadModel(env);
  let res = await callModel(env, model, { system, messages, maxTokens: 1500 });
  if (!res.ok && isModelNotFound(res)) {
    // The configured frontier id has rotated out from under us. Fall back to the known-good
    // Sonnet rather than dying — and report which model answered, so a degraded Lead is a fact
    // on the page, not a mystery in the tone.
    model = FALLBACK_MODEL;
    res = await callModel(env, model, { system, messages, maxTokens: 1500 });
  }
  if (!res.ok || !res.body) return { ok: false, reason: 'model_error', detail: (res.body && res.body.error && res.body.error.message) || res.error || `HTTP ${res.status}` };

  // Metered on the model that ANSWERED, before any parsing — an unparseable answer was still a
  // billed answer.
  await recordSpend(env, { feature: 'team_lead', model, usage: res.body.usage });

  const text = ((res.body.content && res.body.content[0] && res.body.content[0].text) || '').trim();
  if (!text) return { ok: false, reason: 'empty_response' };
  return { ok: true, text, action: parseActionBlock(text), actions: parseActionBlocks(text), model };
}
