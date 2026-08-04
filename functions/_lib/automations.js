// Añejo HUB — AI automation engine. Each automation is a pure-ish function that reads
// ops data and produces an outcome; the runner wraps it with timing, agent_runs logging,
// and tracking-plan events (automation.run + agent_task.completed). Best-effort + guarded.
// Phase 3: route_optimize / restock_suggest / payroll_prep write `suggestions` rows
// (human-in-the-loop, actioned via /api/hub/owner/suggestions); ticket_triage and
// sentiment_scan act directly (triage updates + alerts). ALL AI calls are optional and
// degrade to deterministic fallbacks without env.ANTHROPIC_API_KEY.
// Files under functions/_lib are NOT routed.
import { id, now, today, toJson, parseJson, etMidnightMs, addEtDays, etDateOf } from './hub.js';
import { randToken } from './util.js';
import { loadMenu, isAvailable, isOrderable } from './menu.js';
import { loadOperating } from './operating.js';
import { BRAND_BRIEF } from './brand_brief.js';
import { loadBrand } from './brand_source.js';
import { performanceBrief, attributionBrief, reactionBrief } from './instagram_insights.js';
import { stampPostProvenance } from './post_provenance.js';
import { retrieve, formatPassages } from './knowledge.js';
import { getCadenceConfig } from './social_cadence.js';
import { getPostingTimes, assignSlot, weekdayIndexOf } from './posting_times.js';
import { trainingContext } from './training.js';

// §3 of the brief — the three product lines. Fed to the planner SEPARATELY from the voice
// excerpts because of Dayan's decision #6: the standing objective is that people know EVERYTHING
// Añejo sells — bowls, the Macro Portal, meal plans, catering. Excerpts that stop at voice keep
// the planner writing bowl posts forever, which is exactly the rut the account was already in.
function productLines() {
  const start = BRAND_BRIEF.indexOf('## 3. Our three product lines');
  if (start === -1) return '';
  const rest = BRAND_BRIEF.slice(start);
  const end = rest.search(/^## 4\./m);
  return (end === -1 ? rest : rest.slice(0, end)).trim();
}

// The planner's role, in the Team Lead's voice (team_lead.js SYSTEM_RULES) — specific and
// checkable, not motivational filler. Before this, the planner's ENTIRE role framing was one
// clause: "You write Instagram posts for Añejo Catering Co." No persona, no audience, no
// objective, no idea of what actually works for a food account on this platform. A model given
// no role plays the most generic one available to it — cheerful stock-caption Instagram,
// optimizing for looking good rather than for someone ordering a bowl.
const PLANNER_ROLE =
  'You are the content writer on the Añejo Marketing Team, executing the Team Lead\'s campaign ' +
  'direction (below, when there is any) against the brand\'s own standards. You write Instagram ' +
  'posts for Añejo Catering Co., a made-to-order bowl kitchen and caterer serving Palm Beach ' +
  'County.\n\n' +
  'AUDIENCE: people nearby, deciding what to eat today or who to call for their next event — not ' +
  'a general food-content audience scattered across the country. Every post should read like it ' +
  'was written for someone who could have a bowl in their hands within the hour.\n\n' +
  'OBJECTIVE: orders in Palm Beach County, not vanity metrics. A post that gets likes but sends ' +
  'no one to order has failed, no matter how it performs on reach. Write toward the action, not ' +
  'toward the scroll.\n\n' +
  'PLATFORM REALITY THIS ACCOUNT MUST RESPECT (food content, Instagram, 2026):\n' +
  '- THE COVER FRAME IS THE SALE. Whatever shows first — the top image of a carousel, the ' +
  'opening frame of a Reel, the single photo of a static post — must show the FOOD ITSELF, ' +
  'plated and lit like something to order right now. A cover that opens on a logo, a quote card, ' +
  'or a person with no food in frame loses the scroll before the caption is ever read.\n' +
  '- Carousels and Reels reach further than one static photo. When the subject can be shown as a ' +
  'short sequence (the build, the sauce going on, the box closing) or a multi-image story ' +
  '(ingredient, plated bowl, the person eating it), prefer that format over a single static ' +
  'frame — say so in the image_brief.\n' +
  '- Saves and shares matter more than likes. A like costs nothing and proves nothing; a save ' +
  'means "I intend to order this" and a share means "I am recommending this to someone else." ' +
  'Pick subjects and write captions that earn a save or a share, not just a scroll-past like.\n' +
  '- Every caption gives a reason to act NOW, not "someday": today\'s cutoff, "on the menu this ' +
  'week," a bowl that\'s back, same-day delivery still open. A caption with no reason to act ' +
  'today is one the reader can defer forever — which means never.\n\n';

// Monday-anchored ET week containing `dateStr`. The cadence fix below needs "this week's"
// boundary decided the same way every time it is asked, or the top-up count and the seed query
// could disagree about which posts belong to the week being planned.
function etWeekStartOf(dateStr) {
  const dow = weekdayIndexOf(dateStr);
  const back = dow === 0 ? 6 : dow - 1; // Sunday is 6 days after its own Monday
  return addEtDays(dateStr, -back);
}

// Inverse of `etMidnightMs(date) + hour*3600000` — how scheduled_at is built a few lines below.
// Decoding it this way (rather than re-deriving the ET hour from the raw timestamp with its own
// Intl call) guarantees round-tripping: whatever encoded a slot is exactly what decodes it.
function etHourOfSchedule(ms) {
  if (!Number.isFinite(ms)) return null;
  const d = etDateOf(ms);
  return Math.round((ms - etMidnightMs(d)) / 3600000);
}

/**
 * Context the planner has been blind to. Each source is independent and degrades SILENTLY to
 * nothing on any failure — a missing table (pre-migration), an empty one, or no Vectorize/AI
 * binding must never break the weekly run; it should just leave the planner exactly as informed
 * as it was before this function existed.
 *
 * Returns { text, intelIds }: `text` is the prompt section (unchanged shape from before this
 * comment), `intelIds` is the Set of market_intel.id values that were ACTUALLY shown to the
 * model this run. The planner is about to be asked to name which intel id (if any) shaped a
 * post's angle — intelIds is how the caller checks that answer against the truth instead of
 * trusting whatever id string the model hands back. A hallucinated id must never reach
 * post_provenance as if it were a real citation.
 */
async function plannerExtraContext(env) {
  const parts = [];
  const intelIds = new Set();

  // The Lead's own campaign direction (team_lead.js writes these via create_brief). Same
  // business, same week — and until now the planner that is supposed to EXECUTE a brief never
  // read one. Archived briefs are excluded: they are closed business, not this week's direction.
  try {
    const briefs = await rows(env,
      "SELECT title, objective, audience, angle, status FROM team_briefs WHERE status != 'archived' ORDER BY created_at DESC LIMIT 3");
    if (briefs.length) {
      parts.push('=== CAMPAIGN DIRECTION FROM THE TEAM LEAD (follow this over a generic pick) ===\n' +
        briefs.map((b) => `- [${b.status}] ${b.title}` +
          (b.objective ? ` — objective: ${b.objective}` : '') +
          (b.audience ? `; audience: ${b.audience}` : '') +
          (b.angle ? `; angle: ${b.angle}` : '')).join('\n'));
    }
  } catch { /* pre-0069 schema, or no briefs filed yet — planner runs exactly as before this wiring */ }

  // Web research the Intel Bench already paid for (functions/_lib/intel.js writes market_intel).
  // Until this wiring, a finding like "Añejo is the priciest meal-plan subscription in this
  // market" reached this prompt as inert paragraph text the planner was free to skim past — the
  // owner's actual complaint. Each row now carries its id so the planner can NAME which finding
  // it built a post around (see the intel_id field in the output schema below), and
  // post_provenance.intel_id (0081) makes that citation checkable later, the same way brief_id
  // already makes a campaign brief's effect checkable.
  //
  // THE BOUNDARY, stated where the model cannot miss it: intel is a reason to talk about VALUE
  // (ingredient quality, macro precision, portioning, time saved), never a source of FACTS about
  // anyone but Añejo. A pricing signal earns a post about what the price buys — it does not earn
  // a competitor's name, a competitor's price, or a claim of being better/cheaper/healthier than
  // anyone. Nothing here overrides the Golden Rule or the claim rules above; if this section and
  // the brand brief ever conflict, the brand brief wins.
  try {
    const intel = await rows(env, 'SELECT id, kind, title, body FROM market_intel ORDER BY created_at DESC LIMIT 2');
    if (intel.length) {
      for (const r of intel) if (r && r.id) intelIds.add(r.id);
      parts.push(
        '=== RECENT MARKET INTEL — read for DIRECTION, never for FACTS to state ===\n' +
        'Use a finding below only to choose what ANGLE to write about Añejo itself (value, quality, ' +
        'portioning, macros, time saved). You may NEVER: state a competitor\'s price or name, say or ' +
        'imply Añejo is cheaper/better/healthier than anyone, or present this research as something ' +
        'Añejo is claiming about itself. If a finding is not clearly usable within those limits, ' +
        'ignore it — writing nothing about it is always safe; overreaching is not.\n\n' +
        intel.map((r) => `[id: ${r.id}] [${r.kind}] ${r.title}\n${String(r.body || '').slice(0, 600)}`).join('\n\n'));
    }
  } catch { /* pre-0070 schema, or nothing researched yet */ }

  // The owner's uploaded knowledge base (manuals, SOPs, brand material), via the SAME retrieval
  // path Creative Studio uses (functions/_lib/knowledge.js retrieve) — until now the only
  // consumer. A fixed content-planning query so retrieval has something to match even when no
  // specific post idea has been picked yet.
  try {
    const passages = await retrieve(env, 'Instagram content ideas, food photography, and promotions for Añejo Catering', { topK: 4 });
    if (passages.length) {
      const { text } = formatPassages(passages, 2500);
      if (text) parts.push('=== FROM AÑEJO\'S OWN KNOWLEDGE BASE (nothing outside this is a citable fact) ===\n' + text);
    }
  } catch { /* no VECTORIZE/AI binding, or nothing indexed yet */ }

  // What the OWNER taught the team from the HUB — his rules and the notes on the reference
  // photos he flagged good or bad (HUB → Train the team, functions/_lib/training.js). This goes
  // LAST on purpose: it is the most specific and most recent instruction in the whole prompt, it
  // came from the person whose business this is, and a model weighs the end of a long system
  // prompt more heavily than its middle. Before this existed, teaching the team anything meant
  // editing a markdown file on a laptop, running a build script and redeploying — which is
  // exactly why the team kept producing work the owner had already told someone he disliked.
  try {
    const training = await trainingContext(env, { maxChars: 4000 });
    if (training) parts.push(training);
  } catch { /* pre-0075 schema — planner runs exactly as it did before this wiring */ }

  // What actually WORKED, by cause — which rules and formats the reach followed, not just which
  // captions scored well. performanceBrief() above says "these three posts did best"; this says
  // "posts written under this rule reached more, across N of them". It returns '' until there is
  // enough data to say anything honest, and that silence is the feature: a ranking built on two
  // posts would teach the planner, and the owner, to chase noise.
  try {
    const attribution = await attributionBrief(env);
    if (attribution) parts.push(attribution);
  } catch { /* pre-0076 schema, or nothing published under a recorded cause yet */ }

  // WHAT TO DO ABOUT IT (0079). attributionBrief above says what CORRELATED with more reach;
  // this is a direct, imperative instruction to change format/category/angle when the account's
  // last three posts underperformed its own baseline — or an equally direct "not enough data"
  // note when the history is too thin to justify changing anything, so the planner never mistakes
  // silence for permission to guess. See instagram_insights.js:reactionBrief for the reasoning.
  try {
    const reaction = await reactionBrief(env);
    if (reaction) parts.push(reaction);
  } catch { /* pre-0064 schema, or nothing published yet */ }

  return { text: parts.join('\n\n'), intelIds };
}
import { captureSystem } from './track.js';
import { raiseAlert } from './alerts.js';
import { sendPushTickle } from './push.js';
import { budgetGate, recordSpend } from './ai_budget.js';
import { auditDraft } from './governance.js';
import { TRUST_CATEGORIES, captionHash, autoPublishCategories } from './trust_ledger.js';
import { ensureFoodPhoto } from './food_photo.js';

const MODEL = 'claude-sonnet-4-6';
export const IMPLEMENTED = ['daily_summary', 'eod_chase', 'route_optimize', 'restock_suggest', 'ticket_triage', 'sentiment_scan', 'payroll_prep', 'social_plan'];

// Char cap on the brand brief injected into the planner's prompt — same ceiling the Team Lead
// carries (brand_source.js), so the planner never sees LESS of the owner's live brief than the
// Lead does. Before brand_source.js existed the planner had no cap at all: it always embedded
// the FULL compiled snapshot (~15.3k chars), so 20000 is headroom, not a squeeze.
const PLANNER_BRAND_BUDGET = 20000;
export const PLANNED = [];

async function scalar(env, sql, ...args) {
  try {
    const r = await env.DB.prepare(sql).bind(...args).first();
    if (!r) return 0;
    const k = Object.keys(r)[0];
    return Number(r[k]) || 0;
  } catch { return 0; }
}

async function rows(env, sql, ...args) {
  try {
    const r = await env.DB.prepare(sql).bind(...args).all();
    return (r && r.results) || [];
  } catch { return []; }
}

// Small Claude call that must return JSON. Fully guarded: returns null on any failure
// (no key, network error, non-JSON answer) so callers always fall back deterministically.
async function askClaudeJson(env, { system, user, maxTokens = 400, feature = 'automation' }) {
  if (!env || !env.ANTHROPIC_API_KEY) return null;
  // The $50/week ceiling is HARD: at the limit this refuses exactly like the no-key path,
  // so every caller's deterministic fallback runs and nothing bills into next week.
  if (!(await budgetGate(env)).ok) return null;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    // Metered HERE, not after the parse: an unparseable answer was still a billed answer,
    // and skipping it would undercount the very calls that wasted money.
    await recordSpend(env, { feature, model: MODEL, usage: j.usage });
    let text = (j.content && j.content[0] && j.content[0].text || '').trim();
    if (!text) return null;
    // Tolerate code fences / leading prose around the JSON.
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();
    const start = text.search(/[[{]/);
    if (start > 0) text = text.slice(start);
    const data = JSON.parse(text);
    const tokens = j.usage ? (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0) : null;
    return { data, tokens };
  } catch { return null; }
}

// Cheap stable hash for dedupe keys (not cryptographic).
function tinyHash(s) {
  let h = 5381;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// The "date scope" of a suggestion payload — used to dedupe re-runs of the same automation
// for the same period without blocking suggestions for other days/periods.
function payloadScope(payload) {
  if (!payload || typeof payload !== 'object') return null;
  return payload.route_date || payload.period_end || payload.date || null;
}

// Insert a pending `suggestions` row. Dedupe: if an identical-type PENDING suggestion
// already exists with the same payload date scope, skip (return it instead).
// Best-effort: never throws (table may not be migrated yet).
async function makeSuggestion(env, { type, summary, payload, runId }) {
  if (!env || !env.DB || !type) return { ok: false };
  try {
    const scope = payloadScope(payload);
    const pending = await rows(env, "SELECT id, payload FROM suggestions WHERE suggestion_type=? AND status='pending' ORDER BY created_at DESC LIMIT 20", type);
    for (const p of pending) {
      const existingScope = payloadScope(parseJson(p.payload, null));
      if (existingScope === scope) return { ok: true, id: p.id, deduped: true };
    }
    const sid = id('sug');
    await env.DB
      .prepare("INSERT INTO suggestions (id, suggestion_type, summary, payload, status, source_run_id, created_at) VALUES (?,?,?,?,'pending',?,?)")
      .bind(sid, type, summary || null, toJson(payload || null), runId || null, now())
      .run();
    return { ok: true, id: sid, deduped: false };
  } catch { return { ok: false }; }
}

// --- EOD CHASE: flag active kitchen/driver staff with no EOD report for the date. ---
async function eodChase(env, date) {
  const expRes = await env.DB
    .prepare("SELECT id, name, role, team FROM staff WHERE active=1 AND role IN ('kitchen','driver')")
    .all();
  const expected = (expRes && expRes.results) || [];
  const repRes = await env.DB
    .prepare('SELECT staff_id FROM eod_reports WHERE report_date=?')
    .bind(date)
    .all();
  const filed = new Set(((repRes && repRes.results) || []).map((r) => r.staff_id));
  const missing = expected.filter((s) => !filed.has(s.id));

  for (const s of missing) {
    await raiseAlert(env, {
      alert_type: 'eod_missing',
      severity: 'warning',
      title: 'End-of-day report missing',
      body: `${s.name || s.id} (${s.role}) has not filed an EOD for ${date}.`,
      team: s.team || null,
      ref_type: 'eod_report', ref_id: s.id,
      source: 'automation',
      dedupe_key: `eod_missing:${s.id}:${date}`,
    });
    // Tracking plan: eod_report.missed — one per missing staffer, alongside the alert.
    await captureSystem(env, {
      event: 'eod_report.missed',
      role: 'system',
      team: s.team || null,
      properties: { actor_type: 'system', staff_id: s.id, report_date: date },
    });
  }
  // Nudge the people who owe the report, not only the owner — raiseAlert's push
  // targets roles:['owner'], so without this the staffer is never prompted.
  if (missing.length) {
    try { await sendPushTickle(env, { staffIds: missing.map((m) => m.id) }); } catch { /* best-effort */ }
  }
  return {
    outcome: 'success',
    output: { date, expected: expected.length, missing: missing.length, missing_staff: missing.map((m) => m.name || m.id) },
    summary: `EOD chase for ${date}: ${missing.length} of ${expected.length} reports missing.`,
  };
}

// --- DAILY SUMMARY: snapshot the day; optional AI narrative; alert if compliance low. ---
async function dailySummary(env, date) {
  const ordersOpen = await scalar(env, "SELECT COUNT(*) n FROM orders WHERE status IN ('pending','paid')");
  const onShift = await scalar(env, "SELECT COUNT(*) n FROM shifts WHERE status='open'");
  const openAlerts = await scalar(env, "SELECT COUNT(*) n FROM alerts WHERE status='open'");
  const expensesPending = await scalar(env, "SELECT COUNT(*) n FROM expenses WHERE status='pending'");
  const expected = await scalar(env, "SELECT COUNT(*) n FROM staff WHERE active=1 AND role IN ('kitchen','driver')");
  const filed = await scalar(env, 'SELECT COUNT(*) n FROM eod_reports WHERE report_date=?', date);
  const pct = expected ? Math.round((filed / expected) * 100) : null;

  const stats = { date, orders_open: ordersOpen, on_shift: onShift, open_alerts: openAlerts, expenses_pending: expensesPending, eod_filed: filed, eod_expected: expected, eod_pct: pct };

  let narrative = `Daily summary for ${date}: ${ordersOpen} open orders, ${onShift} on shift, ` +
    `${filed}/${expected} EOD reports filed${pct != null ? ` (${pct}%)` : ''}, ` +
    `${openAlerts} open alerts, ${expensesPending} expenses awaiting review.`;
  let tokens = null;

  // Optional AI polish — fully guarded; deterministic narrative stands if it fails.
  // Gated like every model call: over the weekly ceiling the plain narrative ships instead.
  if (env.ANTHROPIC_API_KEY && (await budgetGate(env)).ok) {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 220,
          system: 'You are the operations chief of staff for Añejo Catering Co. Write a crisp 2-3 sentence end-of-day briefing for the owner from the JSON stats. Be specific, flag anything that needs attention, no fluff.',
          messages: [{ role: 'user', content: JSON.stringify(stats) }],
        }),
      });
      if (r.ok) {
        const j = await r.json();
        await recordSpend(env, { feature: 'daily_summary', model: MODEL, usage: j.usage });
        const text = (j.content && j.content[0] && j.content[0].text || '').trim();
        if (text) narrative = text;
        if (j.usage) tokens = (j.usage.input_tokens || 0) + (j.usage.output_tokens || 0);
      }
    } catch { /* keep deterministic narrative */ }
  }

  // Low-compliance nudge for the owner (end of day).
  if (pct != null && pct < 80) {
    await raiseAlert(env, {
      alert_type: 'eod_missing',
      severity: 'info',
      title: 'EOD compliance low',
      body: `${pct}% of EOD reports filed for ${date}.`,
      team: null, source: 'automation',
      dedupe_key: `eod_compliance_low:${date}`,
    });
  }

  return { outcome: 'success', output: { ...stats, narrative }, summary: narrative, tokens };
}

// --- ROUTE OPTIMIZE: propose a route (suggestion) for the date's unassigned orders. ---
// Deterministic plan: lunch stops before dinner, then creation order; driver with the
// fewest routes that date. Optional AI pass re-sequences the stops (guarded).
async function routeOptimize(env, date) {
  const orders = await rows(
    env,
    "SELECT o.id, o.customer_name, o.delivery_window, o.created_at FROM orders o " +
    // PAYMENT GATE: unpaid checkouts ('pending') are never proposed into a route.
    "WHERE o.delivery_date=? AND o.status IN ('paid','prep','ready') " +
    'AND NOT EXISTS (SELECT 1 FROM route_stops rs WHERE rs.order_id = o.id) ' +
    'ORDER BY o.created_at',
    date
  );
  const drivers = await rows(env, "SELECT id, name FROM staff WHERE role='driver' AND active=1 ORDER BY name");
  if (!orders.length || !drivers.length) {
    return {
      outcome: 'success',
      output: { date, unassigned: orders.length, drivers: drivers.length },
      summary: 'nothing to route',
    };
  }

  // Group by window; deterministic sequence = lunch → dinner → created_at.
  const windowRank = (w) => (w === 'lunch' ? 0 : w === 'dinner' ? 1 : 2);
  const ordered = [...orders].sort((a, b) =>
    windowRank(a.delivery_window) - windowRank(b.delivery_window) || (a.created_at || 0) - (b.created_at || 0));
  const windows = { lunch: 0, dinner: 0 };
  for (const o of ordered) {
    if (o.delivery_window === 'lunch') windows.lunch++;
    else if (o.delivery_window === 'dinner') windows.dinner++;
  }

  // Driver with the fewest routes already assigned for the date.
  const loads = await rows(env, 'SELECT driver_id, COUNT(*) n FROM routes WHERE route_date=? GROUP BY driver_id', date);
  const loadBy = new Map(loads.map((l) => [l.driver_id, Number(l.n) || 0]));
  let driver = drivers[0];
  for (const d of drivers) {
    if ((loadBy.get(d.id) || 0) < (loadBy.get(driver.id) || 0)) driver = d;
  }

  // Optional AI re-sequencing — must return a permutation of the same order ids.
  let orderIds = ordered.map((o) => o.id);
  let tokens = null;
  const ai = await askClaudeJson(env, {
    system: 'You are a delivery route planner for a catering company. Given JSON stops with delivery_window (lunch is served before dinner) and created_at, return ONLY JSON {"order_ids":[...]} — every input id exactly once, sequenced for an efficient day (all lunch stops first, then dinner; earlier-created orders earlier within a window).',
    user: JSON.stringify({ date, stops: ordered.map((o) => ({ id: o.id, window: o.delivery_window, created_at: o.created_at })) }),
    maxTokens: 600,
    feature: 'route_optimize',
  });
  if (ai && ai.data && Array.isArray(ai.data.order_ids)) {
    const proposed = ai.data.order_ids.map(String);
    const valid = proposed.length === orderIds.length && new Set(proposed).size === proposed.length &&
      proposed.every((oid) => orderIds.includes(oid));
    if (valid) orderIds = proposed;
    tokens = ai.tokens;
  }

  const summary = `Proposed route: ${orderIds.length} stops for ${driver.name || driver.id} on ${date}`;
  const sug = await makeSuggestion(env, {
    type: 'route_optimize',
    summary,
    payload: { route_date: date, driver_id: driver.id, order_ids: orderIds, windows },
  });

  return {
    outcome: 'success',
    output: { date, driver_id: driver.id, driver_name: driver.name || null, stop_count: orderIds.length, windows, suggestion_id: sug.id || null, deduped: !!sug.deduped },
    summary,
    tokens,
  };
}

// --- RESTOCK SUGGEST: propose a vendor PO (suggestion). Phase 4: when the kitchen
// keeps inventory_items, the proposal is the PAR GAP (items below par, qty = par - on_hand);
// the original 14-day order-demand heuristic remains the fallback for an empty table. ---
async function restockSuggest(env, date) {
  // Par-gap basis: real counts beat demand inference whenever inventory exists.
  const inv = await rows(env, 'SELECT id, name, unit, on_hand, par_level, vendor_id FROM inventory_items WHERE active=1');
  if (inv.length) {
    const below = inv.filter((it) => Number(it.par_level || 0) > 0 && Number(it.on_hand || 0) < Number(it.par_level || 0));
    if (!below.length) {
      return {
        outcome: 'success',
        output: { date, basis: 'par_gap', inventory_items: inv.length, items: [] },
        summary: 'Restock: all inventory at or above par — nothing to order.',
      };
    }
    const items = below.map((it) => ({
      name: it.name,
      qty: Math.max(1, Math.ceil(Number(it.par_level || 0) - Number(it.on_hand || 0))),
      unit: it.unit || 'ea',
      inventory_id: it.id,
    }));

    // Vendor: the most-specified vendor on the gapped items, else the busiest PO vendor.
    let vendor = null;
    const vendorVotes = new Map();
    for (const it of below) {
      if (it.vendor_id) vendorVotes.set(it.vendor_id, (vendorVotes.get(it.vendor_id) || 0) + 1);
    }
    if (vendorVotes.size) {
      const topVendorId = [...vendorVotes.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const v = await rows(env, "SELECT id, name FROM staff WHERE id=? AND role='vendor' AND active=1", topVendorId);
      if (v.length) vendor = v[0];
    }
    if (!vendor) {
      const byPos = await rows(
        env,
        "SELECT s.id, s.name, COUNT(ro.id) n FROM staff s LEFT JOIN restock_orders ro ON ro.vendor_id = s.id " +
        "WHERE s.role='vendor' AND s.active=1 GROUP BY s.id ORDER BY n DESC, s.name LIMIT 1"
      );
      if (byPos.length) vendor = byPos[0];
    }

    const summary = `Restock: ${items.length} items below par`;
    const sug = await makeSuggestion(env, {
      type: 'restock_suggest',
      summary,
      payload: { vendor_id: vendor ? vendor.id : null, items, date, basis: 'par_gap' },
    });

    return {
      outcome: 'success',
      output: { date, basis: 'par_gap', inventory_items: inv.length, item_count: items.length, vendor_id: vendor ? vendor.id : null, vendor_name: vendor ? vendor.name : null, items, suggestion_id: sug.id || null, deduped: !!sug.deduped },
      summary,
    };
  }

  // Fallback (no inventory rows yet): infer from 14 days of order demand.
  const since = now() - 14 * 24 * 60 * 60 * 1000;
  const recent = await rows(env, "SELECT items FROM orders WHERE created_at >= ? AND status NOT IN ('canceled') LIMIT 1000", since);

  // Aggregate item demand from orders.items JSON.
  const demand = new Map();
  for (const r of recent) {
    const items = parseJson(r.items, []);
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const name = (it && it.name || '').toString().trim();
      if (!name) continue;
      const qty = Number(it.qty) || 1;
      demand.set(name, (demand.get(name) || 0) + qty);
    }
  }
  if (!demand.size) {
    return { outcome: 'success', output: { date, orders_scanned: recent.length, items: [] }, summary: 'No order demand in the last 14 days — nothing to restock.' };
  }

  // Top items by 14-day qty → proposed PO lines (half the trailing demand, min 1).
  const top = [...demand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
  let items = top.map(([name, qty]) => ({ name, qty: Math.max(1, Math.ceil(qty * 0.5)), unit: 'ea' }));

  // Optional AI refinement: tune quantities, add kitchen staples. Guarded; must be JSON.
  let tokens = null;
  const ai = await askClaudeJson(env, {
    system: 'You are a kitchen purchasing assistant for a catering company. Given proposed restock lines derived from 14 days of order demand, refine quantities and add obvious missing staples (oil, rice, beans, foil, containers...). Return ONLY JSON {"items":[{"name":"...","qty":1,"unit":"ea"}]} with at most 20 items, integer qty >= 1.',
    user: JSON.stringify({ date, demand_14d: top.map(([name, qty]) => ({ name, qty })), proposed: items }),
    maxTokens: 700,
    feature: 'restock_suggest',
  });
  if (ai && ai.data && Array.isArray(ai.data.items)) {
    const refined = ai.data.items
      .map((it) => ({ name: (it && it.name || '').toString().trim().slice(0, 80), qty: Math.max(1, Math.ceil(Number(it.qty) || 1)), unit: ((it && it.unit) || 'ea').toString().slice(0, 12) }))
      .filter((it) => it.name)
      .slice(0, 20);
    if (refined.length) items = refined;
    tokens = ai.tokens;
  }

  // Pick a vendor: the one with the most POs, else any active vendor, else null.
  let vendor = null;
  const byPos = await rows(
    env,
    "SELECT s.id, s.name, COUNT(ro.id) n FROM staff s LEFT JOIN restock_orders ro ON ro.vendor_id = s.id " +
    "WHERE s.role='vendor' AND s.active=1 GROUP BY s.id ORDER BY n DESC, s.name LIMIT 1"
  );
  if (byPos.length) vendor = byPos[0];

  const summary = `Restock: ${items.length} items proposed from last 14 days of orders`;
  const sug = await makeSuggestion(env, {
    type: 'restock_suggest',
    summary,
    payload: { vendor_id: vendor ? vendor.id : null, items, date },
  });

  return {
    outcome: 'success',
    output: { date, orders_scanned: recent.length, item_count: items.length, vendor_id: vendor ? vendor.id : null, vendor_name: vendor ? vendor.name : null, items, suggestion_id: sug.id || null, deduped: !!sug.deduped },
    summary,
    tokens,
  };
}

// --- TICKET TRIAGE: classify untriaged open tickets; escalate urgent. Direct action. ---
const SEVERITY_RANK = { low: 0, medium: 1, high: 2, urgent: 3 };
const URGENT_RE = /brake|fire|injur|burn|leak|sick/i;

function heuristicSeverity(ticket) {
  const text = `${ticket.title || ''} ${ticket.body || ''}`;
  if (URGENT_RE.test(text)) return { severity: 'urgent', rationale: 'Safety keyword detected (heuristic).' };
  if (ticket.ticket_type === 'complaint' || /complaint/i.test(text)) return { severity: 'medium', rationale: 'Customer complaint (heuristic).' };
  return { severity: ticket.severity || 'low', rationale: 'No escalation keywords found (heuristic).' };
}

async function ticketTriage(env, date) {
  const tickets = await rows(env, "SELECT id, ticket_type, severity, title, body FROM tickets WHERE status='open' AND ai_triaged=0 ORDER BY created_at LIMIT 20");
  if (!tickets.length) {
    return { outcome: 'success', output: { date, scanned: 0, escalated: 0, urgent: 0 }, summary: 'Ticket triage: no untriaged open tickets.' };
  }

  let escalated = 0, urgent = 0, tokens = 0;
  for (const tk of tickets) {
    let verdict = heuristicSeverity(tk);
    const ai = await askClaudeJson(env, {
      system: 'You are a triage assistant for a catering operations team. Classify the ticket severity as one of low|medium|high|urgent (urgent = safety, injury, fire, vehicle, food-safety risk). Return ONLY JSON {"severity":"...","rationale":"one short sentence"}.',
      user: JSON.stringify({ ticket_type: tk.ticket_type, title: tk.title, body: (tk.body || '').slice(0, 1500) }),
      maxTokens: 120,
      feature: 'ticket_triage',
    });
    if (ai && ai.data && SEVERITY_RANK[ai.data.severity] != null) {
      verdict = { severity: ai.data.severity, rationale: (ai.data.rationale || '').toString().slice(0, 240) || 'Classified by AI triage.' };
      tokens += ai.tokens || 0;
    }

    // Never downgrade: keep the higher of current vs classified severity.
    const current = SEVERITY_RANK[tk.severity] != null ? tk.severity : 'low';
    const severity = SEVERITY_RANK[verdict.severity] > SEVERITY_RANK[current] ? verdict.severity : current;
    if (SEVERITY_RANK[severity] > SEVERITY_RANK[current]) escalated++;

    try {
      await env.DB
        .prepare('UPDATE tickets SET ai_triaged=1, severity=?, body=COALESCE(body,\'\') || ?, updated_at=? WHERE id=?')
        .bind(severity, `\n[AI triage] ${verdict.rationale}`, now(), tk.id)
        .run();
    } catch { /* best-effort per ticket */ }

    if (severity === 'urgent') {
      urgent++;
      await raiseAlert(env, {
        alert_type: 'negative_sentiment',
        severity: 'critical',
        title: 'Urgent ticket needs attention',
        body: `${tk.title || tk.id}: ${verdict.rationale}`,
        ref_type: 'ticket', ref_id: tk.id,
        source: 'automation',
        dedupe_key: `ticket:${tk.id}`,
      });
    }
  }

  return {
    outcome: 'success',
    output: { date, scanned: tickets.length, escalated, urgent },
    summary: `Ticket triage: ${tickets.length} tickets scanned, ${escalated} escalated, ${urgent} urgent.`,
    tokens: tokens || null,
  };
}

// --- SENTIMENT SCAN: screen last-24h comms text for negative signals → alerts. ---
const NEGATIVE_LEXICON = [
  'angry', 'late', 'broken', 'refund', 'complaint', 'unsafe', 'quit', 'frustrated',
  'missing', 'wrong', 'cold food', 'never again', 'rude', 'spoiled', 'damaged',
  'terrible', 'awful', 'upset', 'cancel my', 'disgust',
];

async function sentimentScan(env, date) {
  const since = now() - 24 * 60 * 60 * 1000;
  const corpus = [];
  for (const m of await rows(env, 'SELECT body, direction, sender_role FROM messages WHERE created_at >= ? AND body IS NOT NULL LIMIT 200', since)) {
    corpus.push({ source: m.direction === 'inbound' ? 'message:inbound' : `message:${m.sender_role || 'staff'}`, text: m.body });
  }
  for (const r of await rows(env, 'SELECT summary, blockers FROM eod_reports WHERE created_at >= ? LIMIT 100', since)) {
    const text = [r.summary, r.blockers].filter(Boolean).join(' — ');
    if (text) corpus.push({ source: 'eod_report', text });
  }
  for (const tk of await rows(env, 'SELECT title, body FROM tickets WHERE created_at >= ? LIMIT 100', since)) {
    const text = [tk.title, tk.body].filter(Boolean).join(' — ');
    if (text) corpus.push({ source: 'ticket', text });
  }
  if (!corpus.length) {
    return { outcome: 'success', output: { date, scanned: 0, flags: 0 }, summary: 'Sentiment scan: no comms in the last 24h.' };
  }

  // Deterministic screen: lowercase lexicon match, one flag per matching text.
  let flags = [];
  for (const c of corpus) {
    const low = c.text.toLowerCase();
    const hit = NEGATIVE_LEXICON.find((w) => low.includes(w));
    if (hit) flags.push({ source: c.source, quote: c.text.slice(0, 140), reason: `matched "${hit}"` });
  }

  // Optional AI verdict over the (truncated) corpus — replaces the lexicon flags if valid.
  let tokens = null;
  let body = '';
  for (const c of corpus) {
    const line = `[${c.source}] ${c.text}\n`;
    if (body.length + line.length > 4000) break;
    body += line;
  }
  const ai = await askClaudeJson(env, {
    system: 'You scan internal catering-ops messages for negative sentiment that the owner should see (angry customers, unsafe conditions, staff about to quit, failed deliveries). Return ONLY JSON {"flags":[{"source":"...","quote":"verbatim excerpt","reason":"short"}]} — empty array if nothing notable. Max 10 flags.',
    user: body,
    maxTokens: 700,
    feature: 'sentiment_scan',
  });
  if (ai && ai.data && Array.isArray(ai.data.flags)) {
    flags = ai.data.flags
      .map((f) => ({ source: (f && f.source || 'message').toString().slice(0, 40), quote: (f && f.quote || '').toString().slice(0, 140), reason: (f && f.reason || '').toString().slice(0, 120) }))
      .filter((f) => f.quote)
      .slice(0, 10);
    tokens = ai.tokens;
  }

  for (const f of flags) {
    await raiseAlert(env, {
      alert_type: 'negative_sentiment',
      severity: 'warning',
      title: 'Negative sentiment detected',
      body: `"${f.quote}" (${f.source})`,
      source: 'automation',
      dedupe_key: `sent:${date}:${tinyHash(f.quote)}`,
    });
  }

  return {
    outcome: 'success',
    output: { date, scanned: corpus.length, flags: flags.length, flagged: flags },
    summary: `Sentiment scan: ${corpus.length} texts scanned, ${flags.length} flagged.`,
    tokens,
  };
}

// --- PAYROLL PREP: 14-day closed-shift hours per staff → suggestion for owner review. ---
async function payrollPrep(env, date) {
  const periodEnd = date;
  const periodStart = (() => {
    try {
      const d = new Date(`${date}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - 14);
      return d.toISOString().slice(0, 10);
    } catch { return date; }
  })();
  const since = now() - 14 * 24 * 60 * 60 * 1000;

  const shifts = await rows(
    env,
    "SELECT sh.staff_id, sh.clock_in_at, sh.clock_out_at, sh.total_minutes, sh.break_minutes, " +
    'st.name, st.role, st.pay_rate_cents ' +
    "FROM shifts sh JOIN staff st ON st.id = sh.staff_id " +
    "WHERE sh.status='closed' AND sh.clock_in_at >= ? ORDER BY sh.staff_id",
    since
  );
  if (!shifts.length) {
    return { outcome: 'success', output: { period_start: periodStart, period_end: periodEnd, rows: [] }, summary: 'Payroll prep: no closed shifts in the last 14 days.' };
  }

  const byStaff = new Map();
  for (const sh of shifts) {
    let agg = byStaff.get(sh.staff_id);
    if (!agg) {
      agg = { staff_id: sh.staff_id, name: sh.name || sh.staff_id, role: sh.role || null, pay_rate_cents: sh.pay_rate_cents || null, minutes: 0, break_minutes: 0 };
      byStaff.set(sh.staff_id, agg);
    }
    let mins = Number(sh.total_minutes);
    if (!mins && sh.clock_out_at && sh.clock_in_at) mins = Math.round((sh.clock_out_at - sh.clock_in_at) / 60000);
    agg.minutes += Math.max(0, mins || 0);
    agg.break_minutes += Math.max(0, Number(sh.break_minutes) || 0);
  }

  const table = [...byStaff.values()].map((a) => {
    const hours = Math.round((a.minutes / 60) * 100) / 100;
    return {
      staff_id: a.staff_id,
      name: a.name,
      role: a.role,
      hours,
      break_minutes: a.break_minutes,
      est_pay_cents: a.pay_rate_cents ? Math.round(hours * a.pay_rate_cents) : null,
    };
  }).sort((x, y) => y.hours - x.hours);
  const totalHours = Math.round(table.reduce((s, r) => s + r.hours, 0) * 10) / 10;

  const summary = `Payroll prep: ${table.length} staff, ${totalHours} total hours (last 14d)`;
  const sug = await makeSuggestion(env, {
    type: 'payroll_prep',
    summary,
    payload: { period_start: periodStart, period_end: periodEnd, rows: table },
  });

  return {
    outcome: 'success',
    output: { period_start: periodStart, period_end: periodEnd, staff_count: table.length, total_hours: totalHours, rows: table, suggestion_id: sug.id || null, deduped: !!sug.deduped },
    summary,
  };
}

/**
 * social_plan — write the week's Instagram posts from what is actually true this week.
 *
 * The account has six posts because writing them is a job nobody has time for, not because the
 * business has nothing to say. This does the part that takes the time: what to post, what it
 * should look like, and when.
 *
 * TWO RULES SHAPE THIS, and neither is negotiable:
 *
 *  1. IT NEVER POSTS. Everything lands as a DRAFT that a human approves. Generated copy going
 *     straight to a real brand account is how a business ends up publicly advertising a bowl it
 *     stopped selling, in a voice that is not its own, with nobody having read it first.
 *
 *  2. IT ONLY WRITES WHAT IS TRUE TODAY. The prompt is built from the LIVE menu — availability
 *     included — so it cannot promote something that is sold out. That is not a nicety: this
 *     week five of seven bowls are off, and an "order VIDA tonight" post would send people to a
 *     greyed-out card. Prices come from the same rows the storefront charges from.
 */
async function socialPlan(env, date) {
  // The $50/week spend ceiling is checked FIRST, and the refusal is named: 'budget' in the
  // run log, plain words in the summary. Rule 1 of this planner already rejects template
  // fallbacks, so at the ceiling the only honest outcome is a skip the owner can read —
  // never a quiet week that looks like the planner broke.
  const gate = await budgetGate(env);
  if (!gate.ok) {
    return {
      outcome: 'skipped',
      output: { date, reason: 'budget', spent_microdollars: gate.spent },
      summary: 'Weekly AI budget reached — no posts were drafted. The planner resumes when the new week starts.',
    };
  }
  const menu = await loadMenu(env);
  const bowls = (menu.items || []).filter((it) => it.kind === 'bowl');
  const onSale = bowls.filter((it) => isAvailable(it) && isOrderable(it));
  const off = bowls.filter((it) => !isAvailable(it));

  // Nothing to sell means nothing to post. Better to say so than to generate cheerful copy about
  // an empty menu.
  if (!onSale.length) {
    return {
      outcome: 'skipped',
      output: { date, reason: 'no_bowls_available', bowls_off: off.length },
      summary: 'No bowls are available right now, so there is nothing to promote. Nothing was drafted.',
    };
  }

  // CADENCE (owner-settable, functions/_lib/social_cadence.js): a weekly target for NEW feed
  // posts, not a flat top-up ceiling. The previous WANT=5 was compared against the ENTIRE
  // unshipped backlog with no time bound, so an owner who fell behind on approvals accumulated
  // a pile that sat at or above 5 forever — every following week's run saw "5 pending" and
  // drafted ZERO. That is the exact complaint this fixes: not that the planner ran once and
  // stopped, but that after one slow approval week it silently never ran again, which reads as
  // "one post a day" when the truth was "the queue never re-opened." Scoping the count to THIS
  // ET week (etWeekStartOf) means a stale backlog from three weeks ago no longer counts against
  // this week's target — a current run can never be suppressed by old, unrelated drafts.
  const cadence = await getCadenceConfig(env);
  if (!cadence.feed_per_week) {
    return {
      outcome: 'skipped',
      output: { date, reason: 'cadence_zero' },
      summary: 'The feed cadence is set to 0 in cadence settings — the planner is paused. Raise feed_per_week to resume.',
    };
  }
  const weekStart = etWeekStartOf(date);
  const weekStartMs = etMidnightMs(weekStart);
  const weekEndMs = etMidnightMs(addEtDays(weekStart, 7));
  const pending = await scalar(env,
    "SELECT COUNT(*) n FROM social_posts WHERE status IN ('draft','scheduled') AND scheduled_at >= ? AND scheduled_at < ?",
    weekStartMs, weekEndMs);
  const need = Math.max(0, cadence.feed_per_week - Number(pending || 0));
  if (!need) {
    return {
      outcome: 'skipped',
      output: { date, pending: Number(pending || 0), week_target: cadence.feed_per_week },
      summary: `${pending} of ${cadence.feed_per_week} posts for this week are already scheduled — nothing new drafted.`,
    };
  }

  const menuLines = onSale.map((b) => `${b.name} ($${((b.price_cents || 0) / 100).toFixed(2)}) — ${b.description || ''}`.trim());
  const soldOutLine = off.length ? `Currently SOLD OUT and must not be mentioned: ${off.map((b) => b.name).join(', ')}.` : '';
  // What the last posts actually did. Empty string until the first insights sweep lands — the
  // planner must never see an empty scaffold that reads like data. THIS is the line that makes
  // week 10 better than week 1.
  const performance = await performanceBrief(env);
  // The cutoff is the OWNER'S DIAL (ops.order_by_hour) and it moves — a hard-coded hour here is
  // just the next wrong deadline waiting to be published. Read it at plan time.
  let orderByLabel = 'the posted cutoff';
  try {
    const schedOps = await loadOperating(env);
    const hr = Number(schedOps.order_by_hour) || 18;
    orderByLabel = `${hr % 12 || 12} ${hr >= 12 ? 'PM' : 'AM'}`;
  } catch { /* the neutral label above states no specific hour */ }

  // Team briefs, market intel, and knowledge-base passages — see plannerExtraContext for why
  // each of these was previously invisible to this planner. Empty string when none apply.
  // intelIds is the set of market_intel ids actually shown to the model this run — used below to
  // reject any intel_id the model returns that was not one of the ones it was actually given.
  const { text: extraContext, intelIds } = await plannerExtraContext(env);

  // The brand brief — brand_source.js's shared loader, so an owner edit in the HUB reaches this
  // prompt on the SAME run it reaches the Team Lead and the Studio, not only on the next deploy.
  const brand = await loadBrand(env, { maxChars: PLANNER_BRAND_BUDGET });
  const briefHeader = brand.source === 'd1'
    ? '=== AÑEJO BRAND BRIEF (live from the HUB, owner-maintained) ==='
    : '=== AÑEJO BRAND BRIEF (excerpts) ===';

  const ai = await askClaudeJson(env, {
    system:
      PLANNER_ROLE +
      'Below is the brand\'s own standards brief — verbatim, written by the owner. It is the authority ' +
      'on who Añejo is, how it speaks, and what its photography looks like. Follow it over any instinct of your own.\n\n' +
      briefHeader + '\n' + brand.text + '\n=== END BRIEF ===\n\n' +
      '=== WHAT AÑEJO SELLS (promote across ALL of it, not only bowls) ===\n' + productLines() +
      '\n=== END PRODUCT LINES ===\n' +
      'Across any set of posts, cover the breadth of the offer: the bowls, the Macro Portal ' +
      '(personalized macro plans), meal-plan subscriptions, and catering. A week of only bowl ' +
      'photos fails the objective even if every caption is perfect.\n\n' +
      'Every image_brief you write MUST comply with the Photo standard above. ' +
      'Nutrition is always approximate ranges, never medical claims (the Golden Rule). ' +
      'Return ONLY a JSON array. Each element: {"caption": string, "image_brief": string, "day_offset": integer 0-6, "hour": integer 8-19, "category": string, "intel_id": string|null}. ' +
      // The category feeds the trust ledger (0072): approvals are counted PER LANE, so it must
      // come from this fixed list — an invented lane would start a streak nobody can toggle.
      `category: exactly one of ${TRUST_CATEGORIES.map((c) => `"${c}"`).join(', ')} — the post's primary subject. ` +
      'caption: under 500 characters, 2-4 relevant hashtags at the end. ' +
      'image_brief: one sentence of art direction for a food photo we will generate — subject, angle, light. ' +
      // intel_id closes the loop the owner actually complained about: a finding sitting in the
      // Intel Bench that nobody acted on. Copy the "[id: ...]" value VERBATIM from a RECENT
      // MARKET INTEL entry above ONLY when that entry's finding genuinely shaped this post's
      // angle (within the VALUE boundary stated up there) — otherwise null. Told to the model
      // rather than left to trust: the server checks this id against the intel it actually gave
      // you, so an invented one accomplishes nothing but null the field would not have.
      'intel_id: the market_intel id (copied exactly from a "[id: ...]" tag above) whose finding ' +
      'shaped this post\'s angle, or null if none did. The server checks this id against the intel ' +
      'it actually gave you, so inventing one accomplishes nothing. ' +
      'day_offset: days from today. hour: local hour to post — the strongest windows for a food ' +
      'account are 11-13 (lunch decision) and 17-19 (dinner decision) on weekdays, Friday ' +
      'performs best, weekends are weakest so use 17-19 if you place one there. Spread posts ' +
      'across the week, never two posts in the same hour on the same day — the server also ' +
      'enforces this, but a considered choice beats a corrected one. ' +
      'NEVER name a weekday, date or time of day in the caption unless it matches the day_offset you chose for that same post — ' +
      'a caption that opens "Monday starts with intention" published on a Thursday reads as careless, and the reader has no way ' +
      'to know it was scheduled. When in doubt, do not name a day at all.',
    user:
      // The weekday of each offset, spelled out. Told only the ISO date, the model has to derive
      // the weekday itself, and it got it wrong on the first real run — a caption saying "Monday"
      // landed on a Thursday slot.
      `Today is ${date}, a ${new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}. ` +
      `day_offset 0 is today, 1 is ${new Date(Date.parse(`${date}T12:00:00Z`) + 86400000).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}, ` +
      `and so on through 6.\n\n` +
      `Write ${need} posts for the coming week.\n\n` +
      (performance ? performance + '\n\n' : '') +
      `ON THE MENU RIGHT NOW (these are the only items you may promote):\n${menuLines.join('\n')}\n\n` +
      `${soldOutLine}\n\n` +
      (extraContext ? extraContext + '\n\n' : '') +
      'Vary the angle across the set: the food itself, the kitchen/process, the people it feeds, and one that simply invites an order. ' +
      'HOW ORDERING ACTUALLY WORKS, and the only version you may state: scheduled delivery is ordered by ' +
      `${orderByLabel} the DAY BEFORE — a rolling daily cutoff, not a weekly one. There is no "order by Wednesday" ` +
      'and no weekly deadline of any kind. Same-day delivery is available during opening hours. ' +
      'We deliver in Palm Beach County.\n\n' +
      'Do not invent menu items, prices, discounts, delivery areas, deadlines, cutoffs or claims about ' +
      'ingredients we have not been told. If you are unsure of an operational detail, leave it out — ' +
      '"link in bio" is always safe, a wrong deadline makes someone think they missed their window.',
    maxTokens: 1600,
    feature: 'social_plan',
  });

  if (!ai || !Array.isArray(ai.data)) {
    // No key, or an answer we could not parse. Deliberately no deterministic fallback: a
    // hand-rolled template post is worse than no post, and would train the owner to ignore this.
    return {
      outcome: 'skipped',
      output: { date, reason: env.ANTHROPIC_API_KEY ? 'no_usable_response' : 'no_api_key' },
      summary: 'Could not draft posts (no AI response). Nothing was queued.',
    };
  }

  // POSTING-TIME TABLE (functions/_lib/posting_times.js): owner-overridable default slots, and
  // the enforcement the prompt has always asked the model for ("never two posts in the same
  // hour") but never actually checked — a model repeat used to collide silently. Seeded with
  // whatever is ALREADY scheduled this week so a fresh batch cannot collide with the calendar,
  // not just with itself.
  const postingTimes = await getPostingTimes(env);
  const usedByDate = new Map(); // ET date string -> Set(hour already claimed that day)
  try {
    const existingThisWeek = await rows(env,
      "SELECT scheduled_at FROM social_posts WHERE status IN ('draft','scheduled') AND scheduled_at >= ? AND scheduled_at < ?",
      weekStartMs, weekEndMs);
    for (const r of existingThisWeek) {
      if (!r.scheduled_at) continue;
      const d = etDateOf(r.scheduled_at);
      const h = etHourOfSchedule(r.scheduled_at);
      if (h == null) continue;
      if (!usedByDate.has(d)) usedByDate.set(d, new Set());
      usedByDate.get(d).add(h);
    }
  } catch { /* seeding is a nicety — an empty seed just means this batch only dedupes itself */ }

  const t = now();

  // Read ONCE for the whole batch, not per post: every draft this run produces was written under
  // the same rules and the same standing brief, and re-querying per row would let the two drift
  // apart mid-loop if the owner edited a rule while the run was in flight. Both default to "none
  // recorded" rather than throwing — attribution is analysis, and analysis must never be able to
  // cost the week's posts.
  let activeRuleIds = [];
  try {
    activeRuleIds = (await rows(env, 'SELECT id FROM training_rules WHERE active = 1')).map((r) => r.id);
  } catch { activeRuleIds = []; }
  let directingBriefId = null;
  try {
    const b = await rows(env, "SELECT id FROM team_briefs WHERE status != 'archived' ORDER BY created_at DESC LIMIT 1");
    directingBriefId = (b[0] && b[0].id) || null;
  } catch { directingBriefId = null; }

  const made = [];
  for (const item of ai.data.slice(0, need)) {
    const caption = String((item && item.caption) || '').trim().slice(0, 2200);
    if (!caption) continue;
    const brief = String((item && item.image_brief) || '').trim().slice(0, 400) || null;
    const dayOffset = Math.min(6, Math.max(0, Math.floor(Number(item && item.day_offset)) || 0));
    const postDate = addEtDays(date, dayOffset);
    const dow = weekdayIndexOf(postDate);
    const requestedHour = Math.floor(Number(item && item.hour));
    if (!usedByDate.has(postDate)) usedByDate.set(postDate, new Set());
    const daySlots = usedByDate.get(postDate);
    // Snap to the nearest free table slot for this weekday; falls back to any free hour in
    // 8-19 if the table's slots for the day are already spoken for. Always unique per day.
    const hour = assignSlot(postingTimes, dow, requestedHour, daySlots);
    daySlots.add(hour);
    // A SUGGESTED time only. The row stays a draft with scheduled_at set, so approving it is one
    // click and changing the time is one edit — but nothing fires until a human moves it.
    const when = etMidnightMs(postDate) + hour * 3600 * 1000;

    // Trust ledger (0072): file the post under one of the FIXED lanes, or none at all — an
    // invented category would start an approval streak no toggle exists for. The caption hash
    // is taken AS DRAFTED; approval later compares against it to decide clean vs edited.
    const category = TRUST_CATEGORIES.includes(item && item.category) ? item.category : null;
    // Only an id the model was ACTUALLY shown (intelIds, built in plannerExtraContext from the
    // same query) is trusted — a string the model invented, or one left over from a stale prompt
    // it half-remembers, must never be recorded as a real citation. Silent drop, not a flag: an
    // unusable intel_id is exactly as fine as the model never having offered one.
    const intelId = intelIds.has(item && item.intel_id) ? item.intel_id : null;
    const postId = id('sp');
    try {
      // Trust datum first (schema-tolerant), then the governance gate — the audit must complete
      // BEFORE the promotion block below reads audit_status, or auto-publish would judge an
      // unscored draft. The two sibling modules assumed different column spellings; audit_status
      // is the canonical one the promotion gates on, written here alongside gov's own columns.
      try {
        await env.DB.prepare(
          `INSERT INTO social_posts (id, platform, caption, media_key, public_token, status, scheduled_at, image_brief, source, created_by, created_at, updated_at, category, original_caption_hash)
           VALUES (?,'instagram',?,NULL,?,'draft',?,?,'planner','system',?,?,?,?)`
        ).bind(postId, caption, randToken(24), when, brief, t, t, category, captionHash(caption)).run();
      } catch {
        // Pre-0072 schema (deploy window): the plain draft insert must still land — a missed
        // trust datum is recoverable, a missed week of posts is not.
        await env.DB.prepare(
          `INSERT INTO social_posts (id, platform, caption, media_key, public_token, status, scheduled_at, image_brief, source, created_by, created_at, updated_at)
           VALUES (?,'instagram',?,NULL,?,'draft',?,?,'planner','system',?,?)`
        ).bind(postId, caption, randToken(24), when, brief, t, t).run();
      }
      // Governance gate: score the draft the moment it exists — a planner caption once invented
      // an ordering deadline. auditDraft fails closed to 'flag'; this inner catch only covers
      // the pre-migration column gap, where losing the audit write must not lose the draft.
      try {
        const audit = await auditDraft(env, { caption, image_brief: brief });
        await env.DB.prepare('UPDATE social_posts SET audit_score=?, audit_flags=?, audit_at=?, audit_status=? WHERE id=?')
          .bind(audit.brand_score, toJson(audit.flags), now(), audit.verdict === 'pass' ? 'pass' : 'flag', postId).run();
      } catch { /* the draft stands, visibly unscored (NULL audit_at) */ }
      // FOOD PHOTO AT DRAFT TIME (_lib/food_photo.js). This planner has always written an
      // image_brief — "art direction for a food photo we will generate" — and nothing has ever
      // generated from it, so every drafted post landed with an empty frame for the owner to
      // fill. Worse, a post with no photo is precisely what the food-first guard warns about
      // AFTER the fact; a quality gate that reports a defect the same system just created,
      // without fixing it, is a gate that only makes work. Generating here means the warning has
      // nothing to find on anything drafted from now on.
      //
      // Best-effort by construction: ensureFoodPhoto never throws and never touches status, so a
      // provider outage, the weekly AI ceiling, or a missing key costs this post its image — the
      // exact state it would have been in before — and never the caption or the week's cadence.
      const photo = await ensureFoodPhoto(env, { postId, caption, imageBrief: brief });

      // Record WHAT produced this post — which of the owner's rules were in force, which brief
      // directed it, and which market intel finding (if any) shaped its angle — so the reach it
      // eventually earns can be traced back to a cause. Without this, the owner writes a rule (or
      // the Intel Bench surfaces a finding), reach moves, and nothing anywhere connects the two:
      // the team follows instructions but can never learn which one was worth following.
      // Best-effort by contract (see post_provenance.js); a lost stamp costs one row of analysis,
      // never the post.
      //
      // STAMPED AFTER THE PHOTO, deliberately. The comment this replaces said "the planner never
      // attaches media ... slides arrive later", which stopped being true the moment the line
      // above started generating one. Recording format/slide_count only when a photo actually
      // landed keeps the honesty the original had: a post the chain could not illustrate leaves
      // both undefined for whoever knows better later, rather than claiming a shape it lacks.
      await stampPostProvenance(env, {
        postId, ruleIds: activeRuleIds, briefId: directingBriefId, intelId, category,
        format: photo.ok ? 'single' : undefined,
        slideCount: photo.ok ? photo.slides : undefined,
      });
      made.push({ hour, day_offset: dayOffset, id: postId, category, intel_id: intelId, photo: photo.ok ? photo.provider : null });
    } catch { /* one bad row must not lose the rest of the week */ }
  }

  // GRADUATED AUTONOMY, honored: a lane the owner has toggled to auto_publish=1 gets its draft
  // promoted straight to 'scheduled' at the suggested time — but ONLY if the governance audit
  // has stamped it 'pass'. Both conditions live in the one UPDATE: no toggle → the id set is
  // empty; no audit verdict (or a flag) → the WHERE matches nothing; and on a database without
  // the audit columns the statement throws into the catch, so everything stays a draft. Rule 1
  // ("it never posts") survives as: it never posts anything a human process hasn't cleared.
  let autoScheduled = 0;
  try {
    const autoLanes = await autoPublishCategories(env);
    for (const m of made) {
      if (!m.category || !autoLanes.has(m.category)) continue;
      const r = await env.DB.prepare(
        "UPDATE social_posts SET status='scheduled', updated_at=? WHERE id=? AND status='draft' AND audit_status='pass'"
      ).bind(now(), m.id).run();
      if (r && r.meta && r.meta.changes === 1) autoScheduled++;
    }
  } catch { /* governance columns not migrated yet → draft-only, exactly as before 0072 */ }

  return {
    outcome: made.length ? 'success' : 'skipped',
    tokens: ai.tokens || null,
    output: {
      date, drafted: made.length, already_pending: Number(pending || 0), auto_scheduled: autoScheduled,
      illustrated: made.filter((m) => m.photo).length,
      // How many of this run's posts actually cited a market_intel finding for their angle — the
      // one number that answers "is the team acting on intel or just storing it." Zero is honest
      // when there was no usable intel this run, not a bug to chase.
      intel_driven: made.filter((m) => m.intel_id).length,
      promoted: onSale.map((b) => b.name), withheld_sold_out: off.map((b) => b.name),
      // Which brief this run actually read — 'd1' vs 'repo' — so a thin owner edit is visible in
      // the run log instead of a mystery ("why did this week read generic?").
      brand_source: brand.source,
    },
    // Says how many actually got a photo rather than assuming all or none. The old line ("waiting
    // for an image") was about to become false for most runs and misleading for the rest — and a
    // run where every provider was down has to read differently from one where none were.
    summary: made.length
      ? `Drafted ${made.length} Instagram posts for the week from ${onSale.length} available bowls. `
        + (made.filter((m) => m.photo).length === made.length
          ? 'Each one has a generated food photo to start from — replace it with real photography if you have it. '
          : made.filter((m) => m.photo).length
            ? `${made.filter((m) => m.photo).length} have a generated food photo; the rest are waiting for an image. `
            : 'They are waiting for an image. ')
        + 'Nothing posts on its own — they need your approval.'
      : 'Nothing could be drafted.',
  };
}

const RUNNERS = {
  social_plan: socialPlan,
  daily_summary: dailySummary,
  eod_chase: eodChase,
  route_optimize: routeOptimize,
  restock_suggest: restockSuggest,
  ticket_triage: ticketTriage,
  sentiment_scan: sentimentScan,
  payroll_prep: payrollPrep,
};

// Public runner: times, logs agent_runs, fires automation.run + agent_task.completed.
export async function runAutomation(env, type, opts = {}) {
  if (!env || !env.DB) return { ok: false, error: 'no_db' };
  const date = opts.date || today();
  const runner = RUNNERS[type];
  if (!runner) {
    return { ok: false, error: 'not_implemented', type, planned: PLANNED.includes(type) };
  }

  const started = now();
  let result, outcome = 'success', errMsg = null;
  try {
    result = await runner(env, date);
    outcome = result.outcome || 'success';
  } catch (e) {
    outcome = 'failed';
    errMsg = String(e && e.message || e).slice(0, 500);
    result = { output: null, summary: 'Automation failed.' };
  }
  const finished = now();
  const duration = finished - started;

  // Log the agent run (best-effort).
  try {
    await env.DB
      .prepare(
        'INSERT INTO agent_runs (id, automation_type, task_type, outcome, actor_type, input, output, duration_ms, tokens, error, started_at, finished_at, created_at) ' +
        "VALUES (?,?,?,?,'system',?,?,?,?,?,?,?,?)"
      )
      .bind(id('run'), type, type, outcome, toJson({ date, triggered_by: opts.triggeredBy || 'manual' }),
        toJson(result.output || null), duration, result.tokens || null, errMsg, started, finished, started)
      .run();
  } catch { /* best-effort */ }

  // Tracking-plan events.
  await captureSystem(env, { event: 'automation.run', role: 'system', properties: { automation_type: type, outcome } });
  await captureSystem(env, { event: 'agent_task.completed', role: 'system', properties: { task_type: type, duration_ms: duration, tokens: result.tokens || undefined } });

  return { ok: outcome !== 'failed', type, date, outcome, duration_ms: duration, summary: result.summary, output: result.output, error: errMsg };
}
