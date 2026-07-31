// The Marketing Team Lead: the owner's strategy chat. What carries weight here:
//   · The Lead can only PROPOSE — schedule/publish machinery is structurally out of reach.
//   · The executor runs exactly three verbs, deterministically; a fourth verb dies in the parser.
//   · Every model call is budget-gated and metered (feature 'team_lead'), $50/week HARD.
//   · The frontier model id is an env dial with an automatic Sonnet fallback on model_not_found,
//     and the answering model is reported, never assumed.
//   · The spine is the Lead's whole world: menu, metrics, drafts, budget, briefs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  buildSpine, renderSpine, leadReply, parseActionBlock, leadModel, FALLBACK_MODEL, ALLOWED_ACTIONS,
} from '../../functions/_lib/team_lead.js';
import { WEEKLY_LIMIT_MICRO } from '../../functions/_lib/ai_budget.js';

const LIB = readFileSync(new URL('../../functions/_lib/team_lead.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/team.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0069_team_lead.sql', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/team.html', import.meta.url), 'utf8');

// A D1 stub: answers each regex-matched query from `answers`, records every INSERT.
function stubDb(answers = [], { weekSpent = 0 } = {}) {
  const inserts = [];
  const db = {
    prepare(sql) {
      const stmt = {
        args: [],
        bind(...args) { stmt.args = args; return stmt; },
        async first() {
          if (/FROM ai_spend/.test(sql)) return { c: weekSpent };
          const hit = answers.find((a) => a.re.test(sql) && a.first !== undefined);
          return hit ? hit.first : null;
        },
        async all() {
          const hit = answers.find((a) => a.re.test(sql) && a.all !== undefined);
          return { results: hit ? hit.all : [] };
        },
        async run() { inserts.push({ sql, args: stmt.args }); return { meta: { changes: 1 } }; },
      };
      return stmt;
    },
  };
  return { db, inserts };
}

function stubFetch(handler) {
  const real = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(calls.length, String(url), init); };
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const claudeSays = (text, usage = { input_tokens: 100, output_tokens: 50 }) =>
  new Response(JSON.stringify({ content: [{ text }], usage }), { status: 200 });
const modelNotFound = () =>
  new Response(JSON.stringify({ type: 'error', error: { type: 'not_found_error', message: 'model: claude-opus-4-6' } }), { status: 404 });

const SPINE_DB = () => stubDb([
  { re: /FROM menu_items/, all: [
    { id: 'vida', kind: 'bowl', name: 'VIDA', price_cents: 1999, availability: 'available', active: 1 },
    { id: 'fuego', kind: 'bowl', name: 'FUEGO', price_cents: 2299, availability: 'sold_out', active: 1 },
  ] },
  { re: /FROM menu_modifier_prices/, all: [] },
  { re: /FROM ig_account_metrics/, first: { capture_date: '2026-07-30', followers: 212, media_count: 9 } },
  { re: /FROM ig_media_metrics/, all: [
    { caption: 'Top post', media_type: 'IMAGE', likes: 40, comments: 5, reach: 900, saved: 12 },
    { caption: 'Second', media_type: 'IMAGE', likes: 20, comments: 2, reach: 500, saved: 4 },
    { caption: 'Third', media_type: 'CAROUSEL_ALBUM', likes: 10, comments: 1, reach: 300, saved: 2 },
    { caption: 'Flop', media_type: 'IMAGE', likes: 1, comments: 0, reach: 40, saved: 0 },
  ] },
  { re: /FROM social_posts/, all: [{ caption: 'Draft one caption' }, { caption: 'Draft two caption' }] },
  { re: /FROM team_briefs/, all: [{ id: 'tb_1', title: 'Gym partners push', objective: 'obj', status: 'draft', created_at: 1 }] },
]);

// ---------------------------------------------------------------------------
// The spine: what the Lead is allowed to know
// ---------------------------------------------------------------------------

test('the spine carries menu (with availability), metrics (top-3/bottom-1), drafts, budget and briefs', async () => {
  const { db } = SPINE_DB();
  const spine = await buildSpine({ DB: db });

  assert.equal(spine.menu.length, 2);
  assert.equal(spine.menu[0].name, 'VIDA');
  assert.equal(spine.menu[0].price_usd, 19.99);
  assert.equal(spine.menu[0].available, true);
  assert.equal(spine.menu[1].available, false, 'sold_out must surface as unavailable');

  assert.equal(spine.metrics.account.followers, 212);
  assert.equal(spine.metrics.top_posts.length, 3);
  assert.equal(spine.metrics.bottom_post.caption, 'Flop');

  assert.equal(spine.drafts.count, 2);
  assert.equal(spine.budget.limit_usd, 50, 'the ceiling in the spine IS the owner\'s $50');
  assert.equal(spine.briefs.length, 1);

  const text = renderSpine(spine);
  assert.match(text, /VIDA \(\$19\.99\)/, 'live price, not a hardcoded one');
  assert.match(text, /FUEGO.*OFF SALE/, 'a sold-out bowl is named as off sale, not hidden');
  assert.match(text, /Followers: 212/);
  assert.match(text, /\$50\.00 weekly ceiling/);
  assert.match(text, /Gym partners push/);
});

test('an empty world renders as stated ABSENCE, never as fake data', async () => {
  const { db } = stubDb([]); // every query answers empty
  const spine = await buildSpine({ DB: db });
  const text = renderSpine(spine);
  assert.match(text, /No Instagram metrics captured yet/);
  assert.match(text, /do not state follower counts/i, 'absence comes with the instruction not to invent');
});

test('spine sources are pinned: brand brief verbatim, live loadMenu, latest ig metrics, ai_spend week', () => {
  assert.match(LIB, /BRAND_CONTEXT/);
  assert.match(LIB, /loadMenu\(env\)/);
  assert.match(LIB, /ig_account_metrics/);
  assert.match(LIB, /ig_media_metrics/);
  assert.match(LIB, /weekSpend\(env\)/, 'budget comes from ai_budget\'s own accessor, not a private query');
  assert.match(LIB, /team_briefs/);
});

// ---------------------------------------------------------------------------
// The Lead cannot schedule or publish — structurally
// ---------------------------------------------------------------------------

test('the schedule/publish machinery is not even imported, and the prompt forbids it in words', () => {
  for (const src of [LIB, API]) {
    assert.ok(!/social_publish/.test(src), 'publishSocialPost is out of reach');
    assert.ok(!/from '\.\/instagram/.test(src) && !/_lib\/instagram/.test(src), 'no Instagram module imported');
  }
  assert.ok(!/'scheduled'/.test(API), 'the executor never writes status scheduled');
  assert.match(LIB, /NEVER schedule and NEVER publish/);
  // Drafts land with scheduled_at NULL — a time would be one approval away from firing.
  assert.match(API, /'draft',NULL/);
});

// ---------------------------------------------------------------------------
// The action parser and executor: three verbs, no more
// ---------------------------------------------------------------------------

test('parseActionBlock accepts exactly the three allowed verbs and ignores everything else', () => {
  assert.deepEqual(ALLOWED_ACTIONS, ['create_brief', 'request_intel', 'draft_posts']);
  const wrap = (o) => 'Some strategy talk.\n```json\n' + JSON.stringify(o) + '\n```';
  assert.equal(parseActionBlock(wrap({ action: 'create_brief', title: 'X' })).action, 'create_brief');
  assert.equal(parseActionBlock(wrap({ action: 'request_intel', question: 'Q?' })).action, 'request_intel');
  assert.equal(parseActionBlock(wrap({ action: 'draft_posts', count: 2, assets: [] })).action, 'draft_posts');
  // The dangerous verbs a creative model might invent: all dead on arrival.
  assert.equal(parseActionBlock(wrap({ action: 'publish_post', id: 'sp_1' })), null);
  assert.equal(parseActionBlock(wrap({ action: 'schedule_posts', at: 123 })), null);
  assert.equal(parseActionBlock(wrap({ action: 'send_email' })), null);
  assert.equal(parseActionBlock('no block at all'), null);
  assert.equal(parseActionBlock('```json\nnot json\n```'), null);
});

test('draft_posts is capped at 5 and the executor validates its own fields', () => {
  assert.match(API, /MAX_DRAFT_POSTS = 5/);
  assert.match(API, /ALLOWED_ACTIONS\.includes\(action\.action\)/, 'the executor re-checks the allowlist itself');
  assert.match(API, /source, created_by/, 'drafts carry provenance');
  assert.match(API, /'planner'/, 'source planner, so the Social page treats them like planner drafts');
});

test('intel_requests rows are what a refused guess becomes', () => {
  assert.match(API, /INSERT INTO intel_requests/);
  assert.match(API, /'pending','lead'/);
  assert.match(MIG, /CREATE TABLE IF NOT EXISTS intel_requests/, 'IF NOT EXISTS — shared with the intel module, order-independent');
});

// ---------------------------------------------------------------------------
// Money: gated before, metered after, feature-tagged
// ---------------------------------------------------------------------------

test('at the $50 ceiling the Lead refuses BEFORE any network call', async () => {
  const { db } = stubDb([], { weekSpent: WEEKLY_LIMIT_MICRO });
  const f = stubFetch(() => { throw new Error('must not be called'); });
  try {
    const r = await leadReply({ DB: db, ANTHROPIC_API_KEY: 'k' }, { history: [], message: 'plan the week' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'budget');
    assert.equal(f.calls.length, 0, 'no fetch at the ceiling — the gate runs first');
  } finally { f.restore(); }
});

test('a successful reply is metered as feature team_lead with the usage the API returned', async () => {
  const { db, inserts } = SPINE_DB();
  const f = stubFetch(() => claudeSays('Here is my thinking.', { input_tokens: 1234, output_tokens: 321 }));
  try {
    const r = await leadReply({ DB: db, ANTHROPIC_API_KEY: 'k' }, { history: [], message: 'hi' });
    assert.equal(r.ok, true);
    const spendRow = inserts.find((i) => /INSERT INTO ai_spend/.test(i.sql));
    assert.ok(spendRow, 'the call was recorded');
    assert.equal(spendRow.args[3], 'team_lead');
    assert.equal(spendRow.args[5], 1234);
    assert.equal(spendRow.args[6], 321);
  } finally { f.restore(); }
});

test('no API key means an honest refusal, not a fake reply', async () => {
  const r = await leadReply({ DB: stubDb([]).db }, { message: 'hi' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_api_key');
});

// ---------------------------------------------------------------------------
// Model choice: env dial, automatic fallback, answering model reported
// ---------------------------------------------------------------------------

test('the frontier id is env.TEAM_LEAD_MODEL with a default, and model_not_found falls back to Sonnet', async () => {
  assert.equal(leadModel({}), 'claude-opus-4-6');
  assert.equal(leadModel({ TEAM_LEAD_MODEL: 'claude-x' }), 'claude-x');
  assert.equal(FALLBACK_MODEL, 'claude-sonnet-4-6');

  const { db, inserts } = SPINE_DB();
  const f = stubFetch((n) => (n === 1 ? modelNotFound() : claudeSays('Fallback thinking.')));
  try {
    const r = await leadReply({ DB: db, ANTHROPIC_API_KEY: 'k' }, { history: [], message: 'hi' });
    assert.equal(r.ok, true);
    assert.equal(f.calls.length, 2, 'exactly one retry');
    assert.equal(JSON.parse(f.calls[0].init.body).model, 'claude-opus-4-6');
    assert.equal(JSON.parse(f.calls[1].init.body).model, 'claude-sonnet-4-6');
    assert.equal(r.model, 'claude-sonnet-4-6', 'the ANSWERING model is reported');
    const spendRow = inserts.find((i) => /INSERT INTO ai_spend/.test(i.sql));
    assert.equal(spendRow.args[4], 'claude-sonnet-4-6', 'spend is priced on the model that answered');
  } finally { f.restore(); }
});

test('a non-model failure does NOT retry-loop — one refusal, reason named', async () => {
  const { db } = SPINE_DB();
  const f = stubFetch(() => new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } }), { status: 529 }));
  try {
    const r = await leadReply({ DB: db, ANTHROPIC_API_KEY: 'k' }, { history: [], message: 'hi' });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'model_error');
    assert.equal(f.calls.length, 1, 'overloaded is not model_not_found; no second spend attempt');
  } finally { f.restore(); }
});

// ---------------------------------------------------------------------------
// Surface wiring
// ---------------------------------------------------------------------------

test('the endpoint is owner-only and the page exists with the chat idiom', () => {
  assert.match(API, /requireRole\(request, env, \['owner'\]\)/);
  assert.match(PAGE, /\/api\/hub\/owner\/team/);
  assert.match(PAGE, /Hub\.boot\(\)/);
  const OWNER_JS = readFileSync(new URL('../../public/hub/owner/assets/owner.js', import.meta.url), 'utf8');
  assert.match(OWNER_JS, /team\.html', ico: '[^']+', label: 'Team'/, 'the nav knows the page');
});

test('the migration is additive and the message roles are constrained to owner|lead', () => {
  assert.ok(!/DROP TABLE/.test(MIG) && !/ALTER TABLE/.test(MIG), 'additive only');
  assert.match(MIG, /CHECK \(role IN \('owner','lead'\)\)/);
  assert.match(MIG, /CHECK \(status IN \('draft','approved','archived'\)\)/);
});
