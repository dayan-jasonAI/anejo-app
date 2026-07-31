// The Intel Bench: real-web research with real per-search billing, so the pins here guard
// the two ways it could quietly go wrong with money and one way it could go wrong with truth:
//   · the web_search server tool must actually be in the request (no tool, no research —
//     just a model reciting stale memory as if it browsed);
//   · searches bill separately from tokens, so each run must write its OWN ai_spend row —
//     one unmetered search path and the $50 ceiling stops covering the browsing calls;
//   · the competitor sweep derives its queries from the brand, never from a hand-kept
//     competitor list — a hardcoded name is a stale market map pretending to be research.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runIntel, competitorSweep } from '../../functions/_lib/intel.js';

const LIB = readFileSync(new URL('../../functions/_lib/intel.js', import.meta.url), 'utf8');
const TICK = readFileSync(new URL('../../functions/api/hub/admin/intel-tick.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0070_intel.sql', import.meta.url), 'utf8');

// D1 stub: budget gate reads 0 spent; every INSERT is captured with its SQL for inspection.
function stubDb() {
  const inserts = [];
  const db = {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async first() { return /FROM ai_spend/.test(sql) ? { c: 0 } : null; },
        async all() { return { results: [] }; },
        async run() { if (/^INSERT/i.test(sql.trim())) inserts.push({ sql, args: stmt.args }); return {}; },
      };
      return stmt;
    },
  };
  return { db, inserts };
}

// A successful web-searched answer: 3 searches billed, one cited source, usable text.
function stubFetch(captured) {
  return async (url, opts) => {
    captured.push({ url, body: JSON.parse(opts.body) });
    return {
      ok: true,
      json: async () => ({
        content: [
          { type: 'server_tool_use', id: 'st_1', name: 'web_search', input: { query: 'meal prep boca raton' } },
          { type: 'web_search_tool_result', tool_use_id: 'st_1', content: [{ type: 'web_search_result', url: 'https://example.com/read', title: 'Read' }] },
          { type: 'text', text: 'Researched brief.', citations: [{ type: 'web_search_result_location', url: 'https://example.com/cited', title: 'Cited' }] },
        ],
        usage: { input_tokens: 500, output_tokens: 300, server_tool_use: { web_search_requests: 3 } },
      }),
    };
  };
}

test('the web_search server tool is in the request body — pinned in source AND on the wire', async () => {
  // Source pin: the tool id and its 5-search cap are written where the sweep test can see them.
  assert.match(LIB, /web_search_20250305/, 'the server tool type is pinned');
  assert.match(LIB, /max_uses:\s*5/, 'and capped at 5 searches per run');

  const realFetch = globalThis.fetch;
  const captured = [];
  globalThis.fetch = stubFetch(captured);
  try {
    const { db } = stubDb();
    const res = await runIntel({ DB: db, ANTHROPIC_API_KEY: 'k' }, { kind: 'adhoc', question: 'test question' });
    assert.equal(res.ok, true);
    assert.equal(captured.length, 1);
    const tools = captured[0].body.tools;
    assert.ok(Array.isArray(tools) && tools.some((t) => t.type === 'web_search_20250305' && t.name === 'web_search'),
      'the request that actually left carries the web_search tool');
  } finally { globalThis.fetch = realFetch; }
});

test('search cost lands as its OWN ai_spend row — feature intel_web_search, zero tokens, 10000 µ$ per search', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = stubFetch([]);
  try {
    const { db, inserts } = stubDb();
    const res = await runIntel({ DB: db, ANTHROPIC_API_KEY: 'k' }, { kind: 'adhoc', question: 'test question' });
    assert.equal(res.ok, true);

    const spendRows = inserts.filter((i) => /INSERT INTO ai_spend/.test(i.sql));
    assert.equal(spendRows.length, 2, 'two meters: one token row (recordSpend) + one search row');

    // ai_spend columns: id, week, day, feature, model, input_tokens, output_tokens, cost, created_at
    const searchRow = spendRows.find((i) => i.args[3] === 'intel_web_search');
    assert.ok(searchRow, 'the search row is its own feature, separable in the ledger');
    assert.equal(searchRow.args[5], 0, 'input_tokens 0 — the cost is searches, not tokens');
    assert.equal(searchRow.args[6], 0, 'output_tokens 0');
    assert.equal(searchRow.args[7], 3 * 10000, '3 searches at $10/1000 = 30,000 microdollars');

    // And the brief itself was filed with its sources.
    const intelRow = inserts.find((i) => /INSERT INTO market_intel/.test(i.sql));
    assert.ok(intelRow, 'the answer is stored in market_intel');
    assert.deepEqual(JSON.parse(intelRow.args[4]), ['https://example.com/cited'],
      'cited URLs win over merely-read URLs in sources_json');
  } finally { globalThis.fetch = realFetch; }
});

test('no key → a named skip, not a crash; budget spent → the same', async () => {
  const { db, inserts } = stubDb();
  const noKey = await runIntel({ DB: db }, { question: 'anything' });
  assert.deepEqual(noKey, { ok: false, skipped: 'no_api_key' });
  assert.equal(inserts.length, 0, 'nothing was spent and nothing was stored');

  // Gate refuses (week already at the ceiling) → 'budget', and no fetch is attempted.
  const spentDb = {
    prepare(sql) {
      const stmt = {
        bind() { return stmt; },
        async first() { return /FROM ai_spend/.test(sql) ? { c: 50_000_000 } : null; },
        async all() { return { results: [] }; },
        async run() { return {}; },
      };
      return stmt;
    },
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('must not be called over budget'); };
  try {
    const over = await runIntel({ DB: spentDb, ANTHROPIC_API_KEY: 'k' }, { question: 'anything' });
    assert.equal(over.ok, false);
    assert.equal(over.skipped, 'budget');
  } finally { globalThis.fetch = realFetch; }
});

test('the tick is owner-or-cron, the canonical pattern — pinned', () => {
  assert.match(TICK, /x-cron-key/, 'cron path reads the X-Cron-Key header');
  assert.match(TICK, /ctEq\(cronKey,\s*env\.CRON_KEY\)/, 'compared constant-time, never ===');
  assert.match(TICK, /requireRole\(request,\s*env,\s*\['owner'\]\)/, 'the human path is owner-only');
  assert.match(TICK, /LIMIT 2/, 'at most 2 questions per run — research drains, never bursts');
});

test('the competitor sweep derives queries from the brand — no hand-kept competitor list', async () => {
  // Source pin: no invented/remembered competitor names may be baked into the sweep. These are
  // the plausible ones a model would reach for; any literal name here is a regression.
  for (const name of ['Clean Eatz', 'Fitlife', 'Fit Life', 'Territory Foods', 'Trifecta', 'Factor', 'Freshly', 'Snap Kitchen', 'Eat Clean Bro']) {
    assert.ok(!LIB.includes(name), `intel.js hardcodes "${name}" — the sweep must derive competitors from the live web, not memory`);
  }

  const realFetch = globalThis.fetch;
  const captured = [];
  globalThis.fetch = stubFetch(captured);
  try {
    const { db } = stubDb();
    const res = await competitorSweep({ DB: db, ANTHROPIC_API_KEY: 'k' });
    assert.equal(res.ok, true);
    assert.equal(res.kind, 'competitor');
    const userMsg = captured[0].body.messages[0].content;
    // The queries come from what Añejo sells and where — the brand, not a list.
    assert.match(userMsg, /Derive your own search queries/i);
    assert.match(userMsg, /Palm Beach County/);
    assert.match(userMsg, /Boca Raton/);
    assert.match(userMsg, /macro/i);
    assert.match(userMsg, /Añejo Catering Co/, 'the brand brief rides along so "what to learn" is judged against who Añejo is');
  } finally { globalThis.fetch = realFetch; }
});

test('migration 0070 is share-safe: both tables IF NOT EXISTS (intel_requests is shared with the lead module)', () => {
  assert.match(MIG, /CREATE TABLE IF NOT EXISTS market_intel/);
  assert.match(MIG, /CREATE TABLE IF NOT EXISTS intel_requests/);
});
