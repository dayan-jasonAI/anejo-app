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
//
// That lesson has a second half, learned the same way. Binding the Lead to the spine only helps if
// the spine holds the product: asked for a bowl campaign it could only answer with a table of what
// it did not know, because the menu reached it as names and prices and the brand brief reached it
// as five of twelve sections. Honest, and useless. The spine now carries the kitchen spec (every
// ingredient and its weight, macros, tags) and the whole marketing half of the brief, so the Lead's
// honesty has something to be honest ABOUT.
import { budgetGate, recordSpend, weekSpend, WEEKLY_LIMIT_MICRO } from './ai_budget.js';
import { BRAND_CONTEXT } from './brand_context.js';
import { loadMenu, isAvailable, isOrderable } from './menu.js';
import { BOWL_BY_NAME, BOWL_LABEL, scaledBowlMacros } from './bowlspec.js';
import { trainingContext } from './training.js';

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

// Char cap on the injected brief. The compiled brief is ~15k; the Studio budgets 18k for the same
// document, so this is headroom, not a squeeze.
const BRAND_BUDGET = 20000;

/**
 * The brand brief, preferring the copy the OWNER can edit.
 *
 * Two copies exist and they are not interchangeable. `docs` rows (doc_type='brand') are live: the
 * Studio grounds on them, and an owner-approved brief change (_lib/brief.js) overwrites them. The
 * compiled BRAND_CONTEXT is a build-time snapshot of docs/brand-standards-brief.md — it ships with
 * the code and cannot move until a deploy. Reading only the snapshot is what made an approval in
 * the HUB change the Studio's brief and not the Lead's: same business, two answers.
 *
 * So: live wins, snapshot is the floor, and `source` is reported rather than hidden — if the D1 doc
 * is thinner than the brief it replaces, the owner needs to SEE 'd1' on the page to know why the
 * Lead got vaguer, instead of guessing at the model.
 *
 * No role_scope filter: this is an owner-only surface, and the owner sees every doc in the HUB.
 */
/**
 * A proposal is not a standard.
 *
 * The Studio appends kitchen proposals awaiting the owner's review into the SAME `docs` row as the
 * ratified brief, under `## Proposed Studio Brief Change`. That was harmless while the Lead read
 * the compiled snapshot; the moment live D1 won, unapproved content became brief content. One such
 * block is a price list quoting three bowls above what the storefront actually charges — the Lead
 * would have been reasoning from the owner's inbox instead of his decisions.
 *
 * Dropped at injection rather than at rest: the owner's approval flow keeps writing proposals into
 * that row, and deleting them there would be editing his document to fix our prompt. Ruling: Dayan
 * 2026-08-02.
 *
 * Level-2 headings decide. Every `## ` re-opens the question, so a proposal's own `### ` subsections
 * and body ride along with it, and the ratified section that follows comes straight back.
 */
const PROPOSAL_HEADING = /^##\s+Proposed Studio Brief Change\b/i;

function withoutProposals(body) {
  const kept = [];
  let skipping = false;
  for (const line of String(body).split('\n')) {
    if (/^##\s/.test(line)) skipping = PROPOSAL_HEADING.test(line);
    if (!skipping) kept.push(line);
  }
  return kept.join('\n').trim();
}

async function loadBrand(env) {
  const docs = await rows(env,
    "SELECT title, body FROM docs WHERE active = 1 AND doc_type = 'brand' ORDER BY updated_at DESC LIMIT 10");
  const parts = [];
  let used = 0;
  for (const d of docs) {
    const body = withoutProposals(d.body || '');
    if (!body || used >= BRAND_BUDGET) continue;
    const block = `### ${d.title || 'Brand & Standards Brief'}\n${body}`.slice(0, BRAND_BUDGET - used);
    parts.push(block);
    used += block.length;
  }
  return parts.length
    ? { text: parts.join('\n\n'), source: 'd1' }
    : { text: BRAND_CONTEXT, source: 'repo' };
}

/**
 * One menu row as the Lead needs to see it: what it costs, whether it sells, and — for a bowl —
 * what is actually IN it.
 *
 * bowlspec.js is the kitchen's own spec sheet and the same recipe checkout re-prices against, so
 * this is the build the customer receives, not a marketing paraphrase of it. A row with no spec is
 * reported as having none: "no ingredients" and "ingredients I was not given" lead to very
 * different captions, and only one of them is safe to write.
 */
function describeItem(row) {
  const key = String(row.id || '').toUpperCase();
  const spec = BOWL_BY_NAME[key] || null;
  const macros = spec ? scaledBowlMacros(key, 1) : null;
  return {
    name: row.name || BOWL_LABEL[key] || key,
    price_usd: Math.round(row.price_cents || 0) / 100,
    available: isAvailable(row) && isOrderable(row),
    // Menu copy is what the customer actually reads on the site; the spec blurb is the fallback
    // so a bowl is never described to the strategist in silence.
    description: String(row.description || (spec && spec.description) || '').trim(),
    macros,
    build: spec ? spec.build.map((x) => ({ item: x.item, oz: x.oz })) : null,
    tags: spec && Array.isArray(spec.tags) ? spec.tags : null,
  };
}

/**
 * Everything the Lead is allowed to treat as true, assembled fresh per reply.
 * Returns { menu, metrics, drafts, budget, briefs, brand } — structured, so the API can serve
 * the summary and the prompt can render the text from ONE gathering pass that cannot drift.
 */
export async function buildSpine(env) {
  // The brand brief — live copy if the owner has one, compiled snapshot otherwise.
  const brand = await loadBrand(env);

  // Live menu — prices, availability, and the kitchen build. Same rows the storefront charges
  // from, so the Lead can never argue for a campaign around a bowl that is off sale without
  // knowing it is off sale.
  const menu = await loadMenu(env);
  const items = menu.items || [];
  const menuItems = items.filter((it) => it.kind === 'bowl').map(describeItem);
  // Drinks and add-ons were invisible here until now — the filter above kept only bowls, so the
  // Añejo Fit line and the sauce add-on could not be promoted by a strategist who did not know
  // they existed. They carry no bowlspec (nothing to build), so they list as name/price/state.
  const otherItems = items
    .filter((it) => it.kind === 'drink' || it.kind === 'addon')
    .map((it) => ({
      name: it.name || String(it.id).toUpperCase(),
      kind: it.kind,
      price_usd: Math.round(it.price_cents || 0) / 100,
      available: isAvailable(it) && isOrderable(it),
      description: String(it.description || '').trim(),
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

  // What the owner taught the team from HUB → Train the team. Its own try/catch because a spine
  // that throws is a Lead that cannot answer at all — an untrained team is workable, a dead one
  // is not.
  let training = '';
  try { training = await trainingContext(env, { maxChars: 4000 }); } catch { training = ''; }

  return {
    brand: brand.text, brand_source: brand.source,
    menu: menuItems, other_items: otherItems,
    metrics, drafts, budget, briefs, surfaces, training,
  };
}

// The spine as prompt text. Facts the spine does not have are stated as absent, in words, so the
// model's honest move (ask via request_intel) is easier than its dishonest one (invent).
export function renderSpine(spine) {
  // Availability stays on the name line: it is the one fact that changes whether a bowl may be
  // promoted at all, and it should be unmissable above the detail.
  const bowlBlock = (m) => {
    const head = `- ${m.name} ($${m.price_usd.toFixed(2)})${m.available ? '' : ' — OFF SALE right now, do not build campaigns that promote it'}`;
    const lines = [head];
    if (m.macros) {
      lines.push(`  16 oz standard bowl — approx ${m.macros.kcal} kcal · ${m.macros.protein_g}g protein / ` +
        `${m.macros.carbs_g}g carbs / ${m.macros.fat_g}g fat · ${m.macros.fiber_g}g fiber`);
    }
    if (m.description) lines.push(`  ${m.description}`);
    if (m.build && m.build.length) {
      lines.push('  Built from: ' + m.build.map((x) => `${x.item} ${x.oz} oz`).join(' · '));
    }
    if (m.tags && m.tags.length) lines.push(`  Tags: ${m.tags.join(', ')}`);
    if (!m.macros && !m.build) {
      lines.push('  No kitchen spec on file for this one — do not state its ingredients or macros; ask with request_intel.');
    }
    return lines.join('\n');
  };
  const menuLines = spine.menu.length
    ? spine.menu.map(bowlBlock).join('\n')
    : '- (menu unavailable right now)';
  const otherLines = (spine.other_items || []).length
    ? '\n\n=== DRINKS & ADD-ONS (also on sale — promotable) ===\n' +
      spine.other_items.map((o) => `- ${o.name} ($${o.price_usd.toFixed(2)})` +
        `${o.available ? '' : ' — OFF SALE right now'}${o.description ? ` — ${o.description}` : ''}`).join('\n')
    : '';
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
  const briefHeader = spine.brand_source === 'd1'
    ? '=== AÑEJO BRAND BRIEF (live from the HUB, owner-maintained — the authority on voice and standards) ==='
    : '=== AÑEJO BRAND BRIEF (verbatim, the authority on voice and standards) ===';
  return (
    briefHeader + '\n' + spine.brand + '\n=== END BRIEF ===\n\n' +
    '=== ON THE MENU RIGHT NOW (live prices + the kitchen build; the only items that exist) ===\n' +
    'Ingredient weights are the kitchen spec for a standard 16 oz bowl. Macros are approximate — ' +
    'never present them as precise or medical.\n' + menuLines + otherLines + '\n\n' +
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
    '=== RECENT CAMPAIGN BRIEFS ===\n' + briefLines +
    // The owner's own training, last and therefore loudest. The Lead proposes strategy the owner
    // argues with — so the things he has already told it, in his own words, must outrank the
    // model's instincts rather than sit buried above the menu. Empty string until he trains it,
    // which is the honest state: an untrained team should not read as a trained one.
    (spine.training ? '\n\n' + spine.training : '')
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
  '2. You only state operational facts that appear in the context above — menu, prices, ingredients, ' +
  'macros, metrics, budget, briefs. Ordering cutoffs, delivery areas, discounts, dates: if it is not ' +
  'in the context, you do not know it. Never invent one; use a request_intel action to ask instead.\n' +
  '3. Customer-facing copy you draft speaks as "Aña", the Añejo assistant persona, and follows the ' +
  'brand brief above.\n' +
  '4. You now hold the kitchen build for each bowl. Use it to write specifically — name the real ' +
  'ingredients. Two limits: macros are approximate, never precise or medical claims; and you may ' +
  'never write an allergen SAFETY claim ("nut-free", "safe for celiac", "no dairy"). The brief\'s ' +
  'allergen rules are disclosure rules, not clearance to reassure — a bowl without an ingredient is ' +
  'not a bowl certified free of it.\n\n' +
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
