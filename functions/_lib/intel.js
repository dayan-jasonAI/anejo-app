// Añejo HUB — the Intel Bench. Real-web market research the marketing team can dispatch:
// ad-hoc questions from the queue, plus two standing sweeps (local competitors, platform
// trends). Every answer lands in market_intel WITH its cited URLs, because a brief that
// cannot show where a claim came from is an opinion the owner should not act on.
//
// This is the one surface in the codebase that uses Anthropic's SERVER-SIDE web_search tool,
// and that tool bills separately from tokens ($10 per 1,000 searches). recordSpend() only
// meters tokens, so each run ALSO writes its own ai_spend row for the searches — otherwise
// the $50/week ceiling would quietly stop covering the very calls that browse the web.
// Files under functions/_lib are NOT routed.
import { id, now, today, toJson } from './hub.js';
import { budgetGate, recordSpend, isoWeekOf } from './ai_budget.js';
import { BRAND_CONTEXT } from './brand_context.js';

const MODEL = 'claude-sonnet-4-6';

// Anthropic's server-side web search tool, capped at 5 searches per run: at $10/1,000 that
// bounds one brief's search bill to 5¢, and five queries is plenty for a focused question.
const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };

// $10 per 1,000 searches, in microdollars per search. Priced from the Anthropic API price
// list on 2026-07-31 — like the token table in ai_budget.js, a stale price here undercounts.
const SEARCH_COST_MICRO = 10000;

// Collect every URL the answer actually leaned on. Citations on text blocks are the primary
// signal (the model cited that URL for a specific claim); raw web_search_tool_result URLs are
// the fallback so a brief whose citations didn't parse still shows what was read.
function collectSources(content) {
  const cited = [];
  const searched = [];
  for (const block of Array.isArray(content) ? content : []) {
    if (block && block.type === 'text' && Array.isArray(block.citations)) {
      for (const c of block.citations) if (c && c.url) cited.push(String(c.url));
    }
    if (block && block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r && r.url) searched.push(String(r.url));
    }
  }
  return [...new Set(cited.length ? cited : searched)].slice(0, 20);
}

// The searches are billed whether or not the answer parses, so this records them the same way
// recordSpend treats tokens: after the response, unconditionally. Direct insert rather than
// recordSpend because that helper (correctly) drops zero-token rows, and a search row IS
// zero-token by design — its whole cost is the searches.
async function recordSearchSpend(env, usage) {
  const searches = Number(usage && usage.server_tool_use && usage.server_tool_use.web_search_requests) || 0;
  if (!env || !env.DB || searches <= 0) return;
  const day = today();
  try {
    await env.DB.prepare(
      'INSERT INTO ai_spend (id, week, day, feature, model, input_tokens, output_tokens, cost_microdollars, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(id('ais'), isoWeekOf(day), day, 'intel_web_search', MODEL, 0, 0, SEARCH_COST_MICRO * searches, now()).run();
  } catch { /* best-effort, same stance as recordSpend — metering must not break research */ }
}

/**
 * Run one research question against the live web and file the answer in market_intel.
 *
 * Fully guarded like every model surface: no key or a spent budget returns a named skip
 * (never a throw), so the tick can leave a queued question pending and retry next run
 * instead of burning it as failed.
 */
export async function runIntel(env, { kind = 'adhoc', question, title, feature = 'intel' } = {}) {
  const q = String(question || '').trim();
  if (!q) return { ok: false, skipped: 'no_question' };
  if (!env || !env.DB) return { ok: false, skipped: 'no_db' };
  if (!env.ANTHROPIC_API_KEY) return { ok: false, skipped: 'no_api_key' };
  // The $50/week ceiling is HARD, and web searches ride the same ledger as tokens: at the
  // limit research waits for the new week exactly like every other AI surface.
  if (!(await budgetGate(env)).ok) return { ok: false, skipped: 'budget' };

  let j;
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system:
          'You are the market-intelligence researcher for Añejo Catering Co., a premium ' +
          'longevity-forward Mediterranean-Cuban bowl service in Palm Beach County, Florida. ' +
          'Research the question using web search, then write a concise, factual brief ' +
          '(under 600 words) the owner can act on. Plain text with short headers and bullets. ' +
          'State only what the sources support; say plainly when something could not be verified. ' +
          'Never invent businesses, prices, or statistics.',
        messages: [{ role: 'user', content: q }],
        tools: [WEB_SEARCH_TOOL],
      }),
    });
    if (!r.ok) return { ok: false, error: `api_${r.status}` };
    j = await r.json();
  } catch (e) {
    return { ok: false, error: String(e && e.message || e).slice(0, 200) };
  }

  // Metered before the parse, both meters: tokens and searches were billed even if the
  // answer turns out unusable — skipping them would undercount the wasted calls.
  await recordSpend(env, { feature, model: MODEL, usage: j.usage });
  await recordSearchSpend(env, j.usage);

  const body = (Array.isArray(j.content) ? j.content : [])
    .filter((b) => b && b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n')
    .trim();
  if (!body) return { ok: false, error: 'empty_answer' };

  const sources = collectSources(j.content);
  const intelId = id('mi');
  try {
    await env.DB.prepare(
      'INSERT INTO market_intel (id, kind, title, body, sources_json, created_at) VALUES (?,?,?,?,?,?)'
    ).bind(intelId, kind, String(title || q).slice(0, 160), body, toJson(sources), now()).run();
  } catch (e) {
    return { ok: false, error: 'store_failed: ' + String(e && e.message || e).slice(0, 120) };
  }

  const searches = Number(j.usage && j.usage.server_tool_use && j.usage.server_tool_use.web_search_requests) || 0;
  return { ok: true, intel_id: intelId, kind, sources: sources.length, searches, model: MODEL };
}

/**
 * Standing sweep: who is actually competing for Añejo's customers right now.
 *
 * The owner supplies NO competitor list, on purpose (his decision #5): a hand-kept list is
 * stale the week after it is written, and it pre-decides who matters. Instead the prompt
 * derives the search queries from the brand itself — what Añejo sells and where — and lets
 * the live web say who shows up. The brand brief rides along so "what can Añejo learn"
 * is answered against who Añejo actually is, not generic meal-prep advice.
 */
export async function competitorSweep(env) {
  return runIntel(env, {
    kind: 'competitor',
    title: `Local competitor sweep — ${today()}`,
    feature: 'intel_competitor_sweep',
    question:
      'Find who is competing for our customers RIGHT NOW. Derive your own search queries from ' +
      'what we sell and where: premium meal prep, healthy bowls, and macro-based meal plans in ' +
      'Palm Beach County, Florida — especially Boca Raton, Delray Beach, and West Palm Beach. ' +
      'Identify 3-6 REAL local competitors you can verify from search results. For each: name, ' +
      'Instagram handle if findable, positioning/posture, any price signals, and one thing ' +
      'Añejo could learn from them. Skip national chains unless they are visibly active in ' +
      'this county. Do not include any business you could not verify exists.\n\n' +
      '=== WHO AÑEJO IS (for judging relevance and what to learn) ===\n' + BRAND_CONTEXT,
  });
}

/**
 * Standing sweep: what is working on Instagram for food brands this month. Feeds the social
 * planner's taste without hardcoding trends that will be stale by the next deploy.
 */
export async function platformPulse(env) {
  return runIntel(env, {
    kind: 'platform',
    title: `Instagram platform pulse — ${today()}`,
    feature: 'intel_platform_pulse',
    question:
      'What Instagram content formats and approaches are currently working for food and ' +
      'restaurant brands — especially small premium food businesses? Research current trends: ' +
      'formats (Reels, carousels, stories), posting cadence, caption styles, and any recent ' +
      'platform/algorithm changes that affect reach. End with 3-5 concrete, current ' +
      'recommendations a small premium bowl brand could apply this month.',
  });
}
