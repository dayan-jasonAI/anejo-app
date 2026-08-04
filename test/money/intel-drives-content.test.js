// The owner's actual complaint: the Intel Bench (0070) produced a genuinely good finding —
// "Añejo has to justify its price, nobody else in this market charges this much for a meal-plan
// subscription" — and nothing in the product ever turned it into content. Before this wiring,
// market_intel reached the planner's prompt as inert paragraph text ("context only — never
// quote") with no way for a post to be traced back to the finding that shaped it.
//
// This file pins the two halves of the fix:
//   1. the planner can name WHICH intel finding shaped a post (intel_id in/out, checked against
//      post_provenance.intel_id, 0081) — a real finding becomes a real, traceable post;
//   2. the VALUE boundary is stated explicitly in the prompt the model reads: a competitor
//      pricing signal earns a post about Añejo's own value, never a competitor's name, price, or
//      a superiority claim. The brand auditor (governance.js) is the runtime backstop for this —
//      this file only proves the prompt actually asks for the boundary, not that the model always
//      obeys it (an LLM call cannot be pinned that way).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAutomation } from '../../functions/_lib/automations.js';
import { makeKV } from '../helpers/d1.js';

const AUTO = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0081_post_provenance_intel.sql', import.meta.url), 'utf8');

const MONDAY = '2026-08-03';

// Same shape as social-planner-wiring.test.js's stubDb, plus a market_intel route that returns
// ids (the real 0081 wiring needs an id to cite) and a post_provenance INSERT capture — the same
// column-parsing trick test/money/post-provenance.test.js uses, so this file does not need to
// know the exact positional bind order, only the column names stampPostProvenance writes.
function stubDb({ pending = 0, intelRows = [] } = {}) {
  const socialInserts = [];
  const provenanceRows = new Map(); // post_id -> { col: value }
  const routes = [
    [/FROM menu_items/, () => [
      { id: 'vida', kind: 'bowl', name: 'VIDA', price_cents: 1999, availability: 'available', active: 1, description: 'citrus-lime chicken' },
    ]],
    [/FROM menu_modifier_prices/, () => []],
    [/SELECT COUNT\(\*\) n FROM social_posts WHERE status IN/, () => ({ n: pending })],
    [/SELECT scheduled_at FROM social_posts WHERE status IN/, () => []],
    [/FROM team_briefs/, () => []],
    [/FROM training_rules/, () => []],
    [/FROM market_intel/, () => intelRows],
    [/^INSERT INTO social_posts \(id, platform, caption, media_key, public_token, status, scheduled_at, image_brief, source, created_by, created_at, updated_at, category, original_caption_hash\)/,
      ({ args }) => { socialInserts.push(args); return 1; }],
  ];
  const db = {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...a) { stmt.args = a; return stmt; },
        async first() {
          const hit = routes.find(([re]) => re.test(sql));
          if (hit) return hit[1]({ args: stmt.args });
          if (/^INSERT INTO post_provenance/.test(sql)) return upsertProvenance(sql, stmt.args);
          throw new Error(`Unrouted first() SQL: ${sql}`);
        },
        async all() {
          const hit = routes.find(([re]) => re.test(sql));
          if (!hit) throw new Error(`Unrouted all() SQL: ${sql}`);
          return { results: hit[1]({ args: stmt.args }) };
        },
        async run() {
          if (/^INSERT INTO post_provenance/.test(sql)) return upsertProvenance(sql, stmt.args);
          const hit = routes.find(([re]) => re.test(sql));
          if (!hit) throw new Error(`Unrouted run() SQL: ${sql}`);
          hit[1]({ args: stmt.args });
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };

  function upsertProvenance(sql, args) {
    const cols = sql.match(/INSERT INTO post_provenance \(([^)]+)\)/)[1].split(',').map((c) => c.trim());
    const row = {};
    cols.forEach((c, i) => { row[c] = args[i]; });
    provenanceRows.set(row.post_id, row);
    return { meta: { changes: 1 } };
  }

  return { db, socialInserts, provenanceRows };
}

const claudeSays = (items) => new Response(JSON.stringify({
  content: [{ text: JSON.stringify(items) }],
  usage: { input_tokens: 800, output_tokens: 400 },
}), { status: 200 });

function stubFetch(items) {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push(body);
    if (String(body.system || '').includes('You are the content writer on the Añejo Marketing Team')) {
      return claudeSays(items);
    }
    // Governance audit / food-photo calls: irrelevant to this file, degrade on their own.
    throw new Error('network down (irrelevant to this test)');
  };
  return { seen, restore: () => { globalThis.fetch = real; } };
}

function post(overrides = {}) {
  return { caption: 'Order the bowl today. #anejo #eats', image_brief: 'plated bowl, top-down, warm light', day_offset: 0, hour: 12, category: 'menu', ...overrides };
}

const env = (db) => ({ DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 1 }) }), ANTHROPIC_API_KEY: 'test-key' });

// ---- the boundary is IN the prompt, not just in this comment ----------------

test('the intel section states the VALUE boundary explicitly: no competitor names, prices, or superiority claims', () => {
  const section = AUTO.slice(AUTO.indexOf('Web research the Intel Bench'), AUTO.indexOf('The owner\'s uploaded knowledge base'));
  assert.match(section, /NEVER:\s+state\s+a\s+competitor[\s\S]{1,3}s\s+price\s+or\s+name/i, 'no competitor prices or names');
  assert.match(section, /Añejo is cheaper\/better\/healthier than anyone/i, 'no superiority claims');
  assert.match(section, /VALUE/i, 'points the model at value framing, not fact-repeating');
  assert.match(section, /ignore it/i, 'the safe default when a finding is not clearly usable is to write nothing about it');
});

test('the output schema asks for intel_id, and warns the model that inventing an id is pointless', () => {
  assert.match(AUTO, /"intel_id":\s*string\|null/, 'intel_id is part of the JSON contract');
  // Source is a template of string-literal fragments joined by '+', so a phrase spanning two
  // fragments cannot be matched as one contiguous regex against the raw file text — check the
  // two halves of the sentence separately instead of insisting they are adjacent on disk.
  assert.match(AUTO, /server checks this id against the intel/i, 'the model is told the id is verified');
  assert.match(AUTO, /inventing one accomplishes nothing/i, 'and told that inventing one is pointless');
});

test('migration 0081: post_provenance gains intel_id, additive, referencing market_intel', () => {
  assert.match(MIG, /ALTER TABLE post_provenance ADD COLUMN intel_id TEXT REFERENCES market_intel\(id\)/);
});

// ---- end-to-end: a real intel id offered by the model lands on the post's provenance --------

test('a post that cites a REAL intel id gets that id stamped on its provenance, and counted in intel_driven', async () => {
  const { db, provenanceRows } = stubDb({
    pending: 0,
    intelRows: [{ id: 'mi_pricing', kind: 'competitor', title: 'Añejo is the priciest meal-plan subscription in this market', body: 'No comparable local subscription charges as much; the price needs to be justified by value.' }],
  });
  const items = [post({ intel_id: 'mi_pricing' })];
  const f = stubFetch(items);
  try {
    const res = await runAutomation(env(db), 'social_plan', { date: MONDAY });
    assert.equal(res.outcome, 'success');
    assert.equal(res.output.drafted, 1);
    assert.equal(res.output.intel_driven, 1, 'the run reports one post as intel-driven');

    // Confirm the id the model was actually shown flowed into the prompt verbatim.
    const draftCall = f.seen.find((b) => String(b.system || '').includes('You are the content writer'));
    assert.match(draftCall.messages[0].content, /\[id: mi_pricing\]/);

    const [row] = [...provenanceRows.values()];
    assert.equal(row.intel_id, 'mi_pricing', 'the post_provenance row carries the intel that shaped it');
  } finally { f.restore(); }
});

test('an intel id the model invents (never shown to it) is dropped, not trusted onto the record', async () => {
  const { db, provenanceRows } = stubDb({
    pending: 0,
    intelRows: [{ id: 'mi_real', kind: 'platform', title: 'Real finding', body: 'body' }],
  });
  // The model cites an id that was never in the RECENT MARKET INTEL section it was shown.
  const items = [post({ intel_id: 'mi_hallucinated_by_the_model' })];
  const f = stubFetch(items);
  try {
    const res = await runAutomation(env(db), 'social_plan', { date: MONDAY });
    assert.equal(res.output.intel_driven, 0, 'a citation the server cannot verify does not count as intel-driven');
    const [row] = [...provenanceRows.values()];
    assert.equal(row.intel_id, null, 'the invented id never reaches the provenance row');
  } finally { f.restore(); }
});

test('no market_intel at all: the run still succeeds, intel_id is recorded as null (known: none applied)', async () => {
  const { db, provenanceRows } = stubDb({ pending: 0, intelRows: [] });
  const items = [post({ intel_id: null })];
  const f = stubFetch(items);
  try {
    const res = await runAutomation(env(db), 'social_plan', { date: MONDAY });
    assert.equal(res.outcome, 'success');
    assert.equal(res.output.intel_driven, 0);
    const [row] = [...provenanceRows.values()];
    assert.equal(row.intel_id, null);
  } finally { f.restore(); }
});
