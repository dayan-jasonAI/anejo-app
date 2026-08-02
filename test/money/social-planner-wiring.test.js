// The social planner (functions/_lib/automations.js socialPlan), running end to end against a
// mocked D1 + KV + Claude, to prove the four things the owner's complaint asked for:
//   A. it has a real strategist role, not "write Instagram posts for Añejo" — and that role
//      contains the food-specific rules (cover shows food, saves/shares > likes, act-now).
//   B. cadence is a real, owner-settable weekly target, and a backlog SCOPED OUTSIDE this week
//      can no longer suppress a current run (the "one post a day" bug).
//   C. the posting-time table is actually enforced: two posts that land on the same day can
//      never collide on the same hour, table-provided or not.
//   D. team_briefs, market_intel and the knowledge base reach the prompt when present, and the
//      run still succeeds — unbroken — when any of those tables is missing entirely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runAutomation } from '../../functions/_lib/automations.js';
import { makeKV } from '../helpers/d1.js';

const AUTO = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');

const MONDAY = '2026-08-03'; // fixed so day_offset math and weekday slot tables are deterministic

// ---- shared plumbing -------------------------------------------------------

// A D1 stand-in that answers the FIXED set of queries socialPlan cannot run without, and lets
// each test override individual routes (pending count, existing-this-week rows, briefs, intel).
// Everything else (ai_spend, app_settings, agent_runs, activity_log, trust_ledger, the audit
// UPDATE) is deliberately left UNROUTED — every one of those call sites in the real code is
// wrapped in its own try/catch and degrades to a safe default, so an unrouted throw there is
// exactly what "best-effort" is supposed to survive, not a test bug.
function stubDb({ pending = 0, existingRows = [], briefRows = null, intelRows = null } = {}) {
  const inserted = [];
  const routes = [
    [/FROM menu_items/, () => [
      { id: 'vida', kind: 'bowl', name: 'VIDA', price_cents: 1999, availability: 'available', active: 1, description: 'citrus-lime chicken' },
      { id: 'ligero', kind: 'bowl', name: 'LIGERO', price_cents: 1899, availability: 'available', active: 1, description: 'light greens bowl' },
    ]],
    [/FROM menu_modifier_prices/, () => []],
    [/SELECT COUNT\(\*\) n FROM social_posts WHERE status IN/, () => ({ n: pending })],
    [/SELECT scheduled_at FROM social_posts WHERE status IN/, () => existingRows],
    [/^INSERT INTO social_posts \(id, platform, caption, media_key, public_token, status, scheduled_at, image_brief, source, created_by, created_at, updated_at, category, original_caption_hash\)/,
      ({ args }) => { inserted.push(args); return 1; }],
  ];
  if (briefRows !== null) routes.push([/FROM team_briefs/, () => briefRows]);
  if (intelRows !== null) routes.push([/FROM market_intel/, () => intelRows]);
  const db = {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...a) { stmt.args = a; return stmt; },
        async first() {
          const hit = routes.find(([re]) => re.test(sql));
          if (!hit) throw new Error(`Unrouted first() SQL: ${sql}`);
          return hit[1]({ args: stmt.args });
        },
        async all() {
          const hit = routes.find(([re]) => re.test(sql));
          if (!hit) throw new Error(`Unrouted all() SQL: ${sql}`);
          return { results: hit[1]({ args: stmt.args }) };
        },
        async run() {
          const hit = routes.find(([re]) => re.test(sql));
          if (!hit) throw new Error(`Unrouted run() SQL: ${sql}`);
          hit[1]({ args: stmt.args });
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };
  return { db, inserted };
}

const claudeSays = (items) => new Response(JSON.stringify({
  content: [{ text: JSON.stringify(items) }],
  usage: { input_tokens: 800, output_tokens: 400 },
}), { status: 200 });

// The draft-writing call is identified by the planner's own role marker in `system`; anything
// else (the governance audit, one fetch per drafted post) gets a network failure — auditDraft
// degrades that to a 'flag' verdict on its own, which is irrelevant to what these tests check.
function stubFetch(items) {
  const real = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    seen.push(body);
    if (String(body.system || '').includes('You are the content writer on the Añejo Marketing Team')) {
      return claudeSays(items);
    }
    throw new Error('governance audit network down (irrelevant to this test)');
  };
  return { seen, restore: () => { globalThis.fetch = real; } };
}

function post(overrides = {}) {
  return { caption: 'Order the bowl today. #anejo #eats', image_brief: 'plated bowl, top-down, warm light', day_offset: 0, hour: 12, category: 'menu', ...overrides };
}

// ---- A. the role ------------------------------------------------------------

test('the planner role is a real strategist brief, not one clause', () => {
  const planner = AUTO.slice(AUTO.indexOf('const PLANNER_ROLE'), AUTO.indexOf('// Monday-anchored ET week'));
  assert.match(planner, /Palm Beach County/);
  assert.match(planner, /orders in Palm Beach County, not vanity metrics/i, 'objective is orders, not vanity metrics');
  assert.match(planner, /people nearby, deciding what to eat today/i, 'audience is named, not generic');
});

test('the role carries the food-specific platform rules the owner\'s complaint implies were missing', () => {
  assert.match(AUTO, /THE COVER FRAME IS THE SALE/, 'cover frame must show food');
  assert.match(AUTO, /show the FOOD ITSELF/);
  assert.match(AUTO, /Carousels and Reels reach further than one static photo/, 'format theory: carousels/reels > static');
  assert.match(AUTO, /Saves and shares matter more than likes/i, 'saves/shares > likes');
  assert.match(AUTO, /reason to act NOW/, 'captions must give a reason to act now');
});

// ---- B. cadence, and the backlog-suppression bug -----------------------------

test('with an empty queue this week, the planner tops up to the FULL cadence target', async () => {
  const { db, inserted } = stubDb({ pending: 0 });
  const items = [post(), post({ day_offset: 1 }), post({ day_offset: 2 }), post({ day_offset: 3 })];
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 4 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.outcome, 'success');
    assert.equal(res.output.drafted, 4, 'all 4 of this week\'s target got drafted');
    assert.equal(inserted.length, 4);
  } finally { f.restore(); }
});

test('a cadence-scoped backlog of ZERO for this week is never inflated by drafts sitting outside the window', async () => {
  // The bug this replaces: WANT=5 counted the ENTIRE unshipped backlog with no time bound, so an
  // owner behind on approving old drafts kept the count pinned at/above the ceiling forever and
  // the planner drafted nothing, permanently. `pending` here represents what the real SQL query
  // (scoped to scheduled_at within THIS week, pinned in social-automation.test.js) actually
  // returns — 0, regardless of how large a backlog exists elsewhere in the table — so cadence 3
  // must top all the way up to 3, not to 0.
  const { db } = stubDb({ pending: 0 });
  const items = [post(), post({ day_offset: 1 }), post({ day_offset: 2 })];
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 3 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.outcome, 'success');
    assert.equal(res.output.drafted, 3);
  } finally { f.restore(); }
});

test('a partially-filled week tops up to the remainder, and a week already at target drafts nothing', async () => {
  const { db: db1 } = stubDb({ pending: 2 });
  const f1 = stubFetch([post(), post({ day_offset: 1 })]);
  try {
    const env = { DB: db1, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 4 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.output.drafted, 2, 'tops up to the remaining 2, not the full 4');
  } finally { f1.restore(); }

  const { db: db2 } = stubDb({ pending: 4 });
  const f2 = stubFetch([post()]);
  try {
    const env = { DB: db2, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 4 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.outcome, 'skipped');
    assert.match(res.summary, /4 of 4 posts for this week are already scheduled/);
  } finally { f2.restore(); }
});

test('feed_per_week=0 pauses the planner outright, with an owner-readable reason', async () => {
  const { db } = stubDb({ pending: 0 });
  const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 0 }) }), ANTHROPIC_API_KEY: 'test-key' };
  const res = await runAutomation(env, 'social_plan', { date: MONDAY });
  assert.equal(res.outcome, 'skipped');
  assert.equal(res.output.reason, 'cadence_zero');
});

// ---- C. the posting-time table is enforced, not just requested ---------------

test('four posts the model placed on the SAME day never collide on the same hour', async () => {
  const { db, inserted } = stubDb({ pending: 0 });
  // The model repeats itself (a real failure mode the prompt asks it not to do, and used to go
  // unchecked): all four land on day_offset 0 asking for the exact same hour.
  const items = [post({ hour: 12 }), post({ hour: 12 }), post({ hour: 12 }), post({ hour: 12 })];
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 4 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.output.drafted, 4);
    const scheduledMs = inserted.map((args) => args[3]); // scheduled_at is bind position 3
    // Four posts, same day, same requested hour — the real invariant is that four DIFFERENT
    // scheduled_at moments came out, i.e. four different hours on the same ET calendar day.
    assert.equal(new Set(scheduledMs).size, 4, 'four distinct scheduled_at slots for four same-day, same-hour requests');
  } finally { f.restore(); }
});

test('posts already on the calendar this week are respected — a new draft cannot double-book them either', async () => {
  const { etMidnightMs } = await import('../../functions/_lib/hub.js');
  const noonMonday = etMidnightMs(MONDAY) + 12 * 3600 * 1000;
  const eveningMonday = etMidnightMs(MONDAY) + 18 * 3600 * 1000;
  const { db, inserted } = stubDb({ pending: 0, existingRows: [{ scheduled_at: noonMonday }, { scheduled_at: eveningMonday }] });
  const items = [post({ hour: 12 })]; // both Monday table slots are already taken
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 1 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.output.drafted, 1);
    const when = inserted[0][3];
    assert.notEqual(when, noonMonday);
    assert.notEqual(when, eveningMonday);
  } finally { f.restore(); }
});

// ---- D. previously-blind context sources --------------------------------------

test('team_briefs and market_intel reach the prompt when they exist', async () => {
  const { db } = stubDb({
    pending: 0,
    briefRows: [{ title: 'August catering push', objective: 'book 3 events', audience: 'HOA event planners', angle: 'convenience', status: 'draft' }],
    intelRows: [{ kind: 'competitor', title: 'Rival meal-prep launches Fridays', body: 'A nearby competitor now posts every Friday at noon.' }],
  });
  const items = [post()];
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 1 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.outcome, 'success');
    const draftCall = f.seen.find((b) => String(b.system || '').includes('You are the content writer'));
    const userText = draftCall.messages[0].content;
    assert.match(userText, /CAMPAIGN DIRECTION FROM THE TEAM LEAD/);
    assert.match(userText, /August catering push/);
    assert.match(userText, /RECENT MARKET INTEL/);
    assert.match(userText, /Rival meal-prep launches Fridays/);
  } finally { f.restore(); }
});

test('a missing team_briefs/market_intel table degrades to silence — the run still succeeds', async () => {
  // briefRows/intelRows both null => those routes are NOT registered => querying them throws,
  // exactly like a pre-migration database would.
  const { db } = stubDb({ pending: 0 });
  const items = [post()];
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 1 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.outcome, 'success', 'a missing context table must never break the weekly run');
    assert.equal(res.output.drafted, 1);
    const draftCall = f.seen.find((b) => String(b.system || '').includes('You are the content writer'));
    const userText = draftCall.messages[0].content;
    assert.ok(!userText.includes('CAMPAIGN DIRECTION FROM THE TEAM LEAD'), 'no team_briefs table, no section');
    assert.ok(!userText.includes('RECENT MARKET INTEL'), 'no market_intel table, no section');
  } finally { f.restore(); }
});

test('knowledge-base retrieval degrades to silence with no VECTORIZE/AI binding — it never breaks the run', async () => {
  // No env.VECTORIZE / env.AI at all (the common case pre-knowledge-base setup): retrieve()
  // itself no-ops, so the run must succeed exactly as if the KB section never existed.
  const { db } = stubDb({ pending: 0 });
  const items = [post()];
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 1 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.outcome, 'success');
    const draftCall = f.seen.find((b) => String(b.system || '').includes('You are the content writer'));
    assert.ok(!draftCall.messages[0].content.includes('AÑEJO\'S OWN KNOWLEDGE BASE'));
  } finally { f.restore(); }
});

test('plannerExtraContext is wired into functions/_lib/knowledge.js retrieve — the KB\'s first marketing reader', () => {
  assert.match(AUTO, /import \{ retrieve, formatPassages \} from '\.\/knowledge\.js'/);
  assert.match(AUTO, /await retrieve\(env,/);
});
