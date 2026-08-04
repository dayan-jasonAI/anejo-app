// 0079's third leg: the weekly planner (functions/_lib/automations.js socialPlan) must not just
// READ performance data (performanceBrief/attributionBrief, already wired) — it must be told,
// in the imperative, to try something different when the account's own last three posts
// underperformed its own baseline, and told plainly when the history is too thin to justify
// changing anything. This runs the REAL socialPlan end to end (same harness shape as
// social-planner-wiring.test.js) and inspects the actual prompt Claude would receive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runAutomation } from '../../functions/_lib/automations.js';
import { makeKV } from '../helpers/d1.js';

const MONDAY = '2026-08-03';
const DAY_MS = 86400000;
const MONDAY_MS = Date.parse(`${MONDAY}T12:00:00Z`);

// Same fixed-query stand-in as social-planner-wiring.test.js, extended with the two 0079 reads
// (ig_media_metrics / ig_account_metrics) so a test can opt into a real reaction signal.
function stubDb({ pending = 0, reachRows = null } = {}) {
  const inserted = [];
  const routes = [
    [/FROM menu_items/, () => [
      { id: 'vida', kind: 'bowl', name: 'VIDA', price_cents: 1999, availability: 'available', active: 1, description: 'citrus-lime chicken' },
    ]],
    [/FROM menu_modifier_prices/, () => []],
    [/SELECT COUNT\(\*\) n FROM social_posts WHERE status IN/, () => ({ n: pending })],
    [/SELECT scheduled_at FROM social_posts WHERE status IN/, () => []],
    [/^INSERT INTO social_posts \(id, platform, caption, media_key, public_token, status, scheduled_at, image_brief, source, created_by, created_at, updated_at, category, original_caption_hash\)/,
      ({ args }) => { inserted.push(args); return 1; }],
  ];
  if (reachRows !== null) {
    routes.push([/FROM ig_media_metrics m[\s\S]*ORDER BY m\.posted_at DESC/, () => reachRows]);
    // performanceBrief's own read — unrelated to reactionBrief, routed separately so it does not
    // throw and pollute this test with an extra "unrouted" surprise.
    routes.push([/FROM ig_media_metrics\s+WHERE capture_date = \(SELECT MAX/, () => []]);
  }
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

function reach(mediaId, r, daysBack) {
  return { media_id: mediaId, post_id: null, caption: null, posted_at: MONDAY_MS - daysBack * DAY_MS, reach: r };
}

test('a real weak-run in the account\'s history reaches the prompt as an IMPERATIVE instruction', async () => {
  const reachRows = [
    reach('r0', 10, 0), reach('r1', 10, 1), reach('r2', 10, 2),
    reach('b1', 100, 3), reach('b2', 100, 4), reach('b3', 100, 5),
  ];
  const { db } = stubDb({ pending: 0, reachRows });
  const items = [post()];
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 1 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.outcome, 'success');
    const draftCall = f.seen.find((b) => String(b.system || '').includes('You are the content writer'));
    const userText = draftCall.messages[0].content;
    assert.match(userText, /REACT: THE LAST 3 POSTS UNDERPERFORMED/);
    assert.match(userText, /Do NOT repeat the same format, category and angle/);
  } finally { f.restore(); }
});

test('too little post history reaches the prompt as an explicit "do not react" note, not silence and not a false alarm', async () => {
  const { db } = stubDb({ pending: 0, reachRows: [reach('m0', 10, 0)] }); // 1 post — nowhere near enough
  const items = [post()];
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 1 }) }), ANTHROPIC_API_KEY: 'test-key' };
    await runAutomation(env, 'social_plan', { date: MONDAY });
    const draftCall = f.seen.find((b) => String(b.system || '').includes('You are the content writer'));
    const userText = draftCall.messages[0].content;
    assert.match(userText, /NOT ENOUGH DATA TO REACT/);
    assert.ok(!/REACT: THE LAST/.test(userText), 'must not fire the imperative instruction on thin data');
  } finally { f.restore(); }
});

test('a healthy recent trend never injects reaction text — no news is not fed to the planner as news', async () => {
  const reachRows = [
    reach('r0', 95, 0), reach('r1', 98, 1), reach('r2', 97, 2),
    reach('b1', 100, 3), reach('b2', 100, 4), reach('b3', 100, 5),
  ];
  const { db } = stubDb({ pending: 0, reachRows });
  const items = [post()];
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 1 }) }), ANTHROPIC_API_KEY: 'test-key' };
    await runAutomation(env, 'social_plan', { date: MONDAY });
    const draftCall = f.seen.find((b) => String(b.system || '').includes('You are the content writer'));
    const userText = draftCall.messages[0].content;
    assert.ok(!/REACT: THE LAST/.test(userText));
    assert.ok(!/NOT ENOUGH DATA TO REACT/.test(userText));
  } finally { f.restore(); }
});

test('a missing ig_media_metrics table (pre-0064 database) degrades to the SAME honest "not enough data" note as thin data — the weekly run still succeeds', async () => {
  // A missing table and one lonely post are both, honestly, "we cannot conclude anything" — the
  // planner does not need to know WHY there is no signal, only that there isn't one yet, so it
  // must get the plain not-enough-data note either way, never the imperative reaction, and never
  // a crash.
  const { db } = stubDb({ pending: 0 }); // reachRows === null -> the 0079 reads are unrouted -> throw -> caught
  const items = [post()];
  const f = stubFetch(items);
  try {
    const env = { DB: db, SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 1 }) }), ANTHROPIC_API_KEY: 'test-key' };
    const res = await runAutomation(env, 'social_plan', { date: MONDAY });
    assert.equal(res.outcome, 'success', 'a missing 0079 table must never break the weekly run');
    const draftCall = f.seen.find((b) => String(b.system || '').includes('You are the content writer'));
    const userText = draftCall.messages[0].content;
    assert.ok(!/REACT: THE LAST/.test(userText), 'no confident reaction claim from a table that does not even exist');
    assert.match(userText, /NOT ENOUGH DATA TO REACT/);
  } finally { f.restore(); }
});
