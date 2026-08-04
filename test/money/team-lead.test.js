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
  buildSpine, renderSpine, leadReply, parseActionBlock, parseActionBlocks, leadModel, FALLBACK_MODEL, ALLOWED_ACTIONS,
} from '../../functions/_lib/team_lead.js';
import { bowlArtFor } from '../../functions/_lib/bowl_art.js';
import { WEEKLY_LIMIT_MICRO } from '../../functions/_lib/ai_budget.js';
import { BRAND_CONTEXT } from '../../functions/_lib/brand_context.js';

const LIB = readFileSync(new URL('../../functions/_lib/team_lead.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/team.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0069_team_lead.sql', import.meta.url), 'utf8');
// 2026-08-04: the Team Lead chat now lives inside the Teach tab of the unified marketing.html
// workspace (see that file's own header comment for the consolidation).
const PAGE = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');

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
  // The Lead no longer keeps a private copy of the brand loader — it shares ONE with the planner
  // and the Brand Auditor (brand_source.js), so an owner edit in the HUB reaches all three the
  // same run instead of only whichever surface happened to read D1 directly.
  assert.match(LIB, /import \{ loadBrand \} from '\.\/brand_source\.js'/, 'the Lead must import the SHARED loader');
  assert.match(LIB, /await loadBrand\(env, \{ maxChars: BRAND_BUDGET \}\)/, 'and must actually CALL it — an unused import is not wiring');
  assert.match(LIB, /loadMenu\(env\)/);
  assert.match(LIB, /ig_account_metrics/);
  assert.match(LIB, /ig_media_metrics/);
  assert.match(LIB, /weekSpend\(env\)/, 'budget comes from ai_budget\'s own accessor, not a private query');
  assert.match(LIB, /team_briefs/);
  assert.match(LIB, /from '\.\/bowlspec\.js'/, 'the kitchen spec is the ingredient source, not the model');
});

// ---------------------------------------------------------------------------
// The product is IN the spine
//
// The Lead was asked for a bowl campaign and answered with a table of what it did not know: it
// could name COCO and FUEGO only because their ingredients had leaked in through Instagram
// captions, and knew nothing at all about the other five. Menu rows carried name and price; the
// brief arrived as 5 of 12 sections, without §6. Every test below is that session.
// ---------------------------------------------------------------------------

test('every bowl arrives with its kitchen build, macros and tags — no more "what I am missing"', async () => {
  const { db } = SPINE_DB();
  const spine = await buildSpine({ DB: db });

  const vida = spine.menu[0];
  assert.equal(vida.macros.kcal, 510);
  assert.equal(vida.macros.protein_g, 40);
  assert.ok(vida.build.some((b) => b.item === 'Seared tuna' && b.oz === 4.5), 'per-ingredient oz, from bowlspec');
  assert.ok(vida.tags.includes('pescatarian'));
  assert.ok(vida.description, 'a bowl is never described to the strategist in silence');

  const text = renderSpine(spine);
  assert.match(text, /Built from: Seared tuna 4\.5 oz/, 'the build is rendered, not just carried');
  assert.match(text, /approx 510 kcal · 40g protein/);
  assert.match(text, /never present them as precise or medical/, 'macros ship with their caveat');
  // The regression that started this: availability must stay on the name line, above the detail.
  assert.match(text, /FUEGO.*OFF SALE/);
});

test('a menu row with no kitchen spec says so, instead of going quiet', async () => {
  const { db } = stubDb([
    { re: /FROM menu_items/, all: [
      { id: 'mystery', kind: 'bowl', name: 'MYSTERY', price_cents: 1500, availability: 'available', active: 1 },
    ] },
  ]);
  const spine = await buildSpine({ DB: db });
  assert.equal(spine.menu[0].build, null);
  const text = renderSpine(spine);
  assert.match(text, /No kitchen spec on file/);
  assert.match(text, /do not state its ingredients or macros/);
});

test('drinks and add-ons are promotable too — they used to be invisible', async () => {
  const { db } = stubDb([
    { re: /FROM menu_items/, all: [
      { id: 'fit_gold', kind: 'drink', name: 'Añejo Fit — Gold Vitality', price_cents: 999, availability: 'available', active: 1 },
      { id: 'sauce_extra', kind: 'addon', name: 'Extra Signature Sauce (2 oz)', price_cents: 150, availability: 'sold_out', active: 1 },
    ] },
  ]);
  const spine = await buildSpine({ DB: db });
  assert.equal(spine.other_items.length, 2);
  const text = renderSpine(spine);
  assert.match(text, /DRINKS & ADD-ONS/);
  assert.match(text, /Gold Vitality \(\$9\.99\)/);
  assert.match(text, /Extra Signature Sauce.*OFF SALE/);
});

test('the brief the OWNER edits wins over the compiled snapshot, and the source is reported', async () => {
  const { db } = stubDb([
    { re: /FROM docs/, all: [{ title: 'Brand & Standards Brief', body: 'Live brief the owner approved in the HUB.' }] },
  ]);
  const spine = await buildSpine({ DB: db });
  assert.equal(spine.brand_source, 'd1');
  assert.match(spine.brand, /Live brief the owner approved/);
  assert.match(renderSpine(spine), /live from the HUB/, 'the owner can see which copy the Lead read');
});

test('an unapproved Studio proposal never reaches the Lead as though it were the brief', async () => {
  // The Studio appends owner-review proposals into the same docs row as the ratified brief. Live
  // production carried one quoting LIGERO $21.99 / RAÍZ $20.99 / CONGREEN $22.99 against real
  // storefront prices of $19.99 / $21.99 / $20.99 — the Lead would have been reading the owner's
  // inbox as his price list. Dropped at injection; the row itself is his to keep.
  const { db } = stubDb([
    { re: /FROM docs/, all: [{ title: 'Brand & Standards Brief', body: [
      '## 11. Brand voice',
      'Warm, direct, never clinical.',
      '',
      '## Proposed Studio Brief Change / Cambio propuesto desde Studio',
      '',
      '### Precios oficiales',
      'LIGERO $21.99 · RAÍZ $20.99 · CONGREEN $22.99',
      '',
      '## 12. Non-negotiables',
      'Standard bowls are 16 oz.',
    ].join('\n') }] },
  ]);
  const spine = await buildSpine({ DB: db });
  assert.equal(spine.brand_source, 'd1');
  assert.doesNotMatch(spine.brand, /Proposed Studio Brief Change/, 'the proposal heading is gone');
  assert.doesNotMatch(spine.brand, /21\.99/, 'and so is the unapproved price it carried');
  assert.doesNotMatch(spine.brand, /Precios oficiales/, 'including its own subsections');
  // The ratified sections on BOTH sides survive — this strips a block, it does not truncate.
  assert.match(spine.brand, /Warm, direct, never clinical/, 'the section before it stands');
  assert.match(spine.brand, /Standard bowls are 16 oz/, 'the section after it comes back');
});

test('with no brand doc in D1 the compiled brief is the floor, never an empty brief', async () => {
  const { db } = stubDb([]);
  const spine = await buildSpine({ DB: db });
  assert.equal(spine.brand_source, 'repo');
  assert.match(spine.brand, /40% protein \/ 30% carbs \/ 30% fat/, 'the Golden Rule still arrives');
});

test('the brief carries the sections the Lead was answering without', () => {
  // §6 is the one it asked the owner for by name; §8 is the one that makes copy safe.
  assert.match(BRAND_CONTEXT, /coconut-lime sauce/, '§6 Menu — the per-bowl ingredient lists');
  assert.match(BRAND_CONTEXT, /Allergen discipline is non-negotiable/, '§8 Allergens');
  assert.match(BRAND_CONTEXT, /Standard à la carte bowls are \*\*16 oz\*\*/, '§12 Non-negotiables');
  assert.match(BRAND_CONTEXT, /Signature bowl layout/, '§10 plating, not just the photo standard');
});

test('ingredient detail does not become permission to make allergen claims', () => {
  assert.match(LIB, /never write an allergen SAFETY claim/);
  assert.match(LIB, /macros are approximate/);
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
  // 2026-08-04: Team no longer has its own nav tab — it is the Teach tab of the single
  // 'marketing' nav entry (see owner.js's consolidation comment). Old bookmarks to
  // /hub/owner/team.html still work: that file now redirects into marketing.html#teach.
  const OWNER_JS = readFileSync(new URL('../../public/hub/owner/assets/owner.js', import.meta.url), 'utf8');
  assert.match(OWNER_JS, /\{ view: 'marketing', href: '\/hub\/owner\/marketing\.html'/, 'the nav knows the workspace');
  assert.doesNotMatch(OWNER_JS, /href: '\/hub\/owner\/team\.html'/, 'no separate Team tab — consolidated');
  const STUB = readFileSync(new URL('../../public/hub/owner/team.html', import.meta.url), 'utf8');
  assert.match(STUB, /location\.replace\('\/hub\/owner\/marketing\.html#teach'\)/, 'the old URL forwards into Teach');
});

test('the page SHOWS which brief the Lead read — reporting it in JSON alone is invisible', () => {
  // spineSummary has carried brand_source since the spine fix, but nothing painted it, so the
  // one symptom it exists to disambiguate — an off-brand Lead vs a brief that never arrived —
  // still looked identical from the chat. Pinned at the surface, where the owner actually reads.
  assert.match(API, /brand_source: spine\.brand_source/, 'the endpoint reports the source');
  assert.match(PAGE, /s\.brand_source/, 'the page reads it');
  assert.match(PAGE, /brief: live from the HUB/, 'the live case is named in words');
  assert.match(PAGE, /brief: repo snapshot/, 'the snapshot case is named in words');
});

test('the migration is additive and the message roles are constrained to owner|lead', () => {
  assert.ok(!/DROP TABLE/.test(MIG) && !/ALTER TABLE/.test(MIG), 'additive only');
  assert.match(MIG, /CHECK \(role IN \('owner','lead'\)\)/);
  assert.match(MIG, /CHECK \(status IN \('draft','approved','archived'\)\)/);
});

test('Lead-created drafts pass through governance too — no unscored door', () => {
  // The planner's inserts are audited in socialPlan; a Lead that could slip unscored copy past
  // the gate would make governance decorative. Found at integration, pinned here.
  const TEAM = readFileSync(new URL('../../functions/api/hub/owner/team.js', import.meta.url), 'utf8');
  assert.match(TEAM, /auditDraft\(env, \{ caption, image_brief: brief \}\)/);
  assert.match(TEAM, /audit_status=\? WHERE id=\?/);
});

test('EVERY action block is accounted for — the phantom-draft bug, pinned', () => {
  // Live failure: the Lead emitted create_brief + draft_posts in one reply; the executor took
  // the first and silently dropped the second; the Lead then told the owner "draft #5 is in
  // your queue" about a draft that never existed. Dropped blocks now come back as results.
  const two = parseActionBlocks('a ```json\n{"action":"create_brief","title":"t"}\n``` b ```json\n{"action":"draft_posts","assets":[]}\n``` c');
  assert.equal(two.length, 2);
  assert.equal(two[1].action, 'draft_posts', 'the second block is no longer dropped');
  const bad = parseActionBlocks('```json\n{"action":"launch_missiles"}\n```');
  assert.equal(bad[0].dropped, true, 'unknown verbs are reported, not silently ignored');
  assert.match(bad[0].reason, /unknown action/);
  const TEAM = readFileSync(new URL('../../functions/api/hub/owner/team.js', import.meta.url), 'utf8');
  assert.match(TEAM, /for \(const blk of blocks\)/, 'the executor iterates all blocks');
  assert.match(TEAM, /dropped: true, reason: blk\.reason/, 'dropped blocks reach the thread');
});

test('a one-bowl draft gets that bowl\'s staged art; ambiguous or none gets nothing', () => {
  // The Lead writes art direction, not pixels, and Workers cannot render at request time — a
  // draft used to land media_key NULL and read to the owner as half a post.
  assert.equal(bowlArtFor('COCO — coconut-lime shrimp over quinoa'), 'studio/bowls/coco.jpg');
  assert.equal(bowlArtFor('single RAÍZ bowl, centered'), 'studio/bowls/raiz.jpg', 'accent-insensitive');
  assert.equal(bowlArtFor('COCO or FUEGO, your pick'), null, 'two bowls named → attach nothing');
  assert.equal(bowlArtFor('Meal prep that respects your goals'), null, 'no bowl named → nothing');
  assert.equal(bowlArtFor('marinated, marbled, marvelous'), null, 'MAR must not match inside words');
  const TEAM = readFileSync(new URL('../../functions/api/hub/owner/team.js', import.meta.url), 'utf8');
  assert.match(TEAM, /const art = bowlArtFor/, 'the executor actually attaches it');
  // social_post_media is the authority and the public window is per-slide: setting only the
  // legacy media_key column would look illustrated in the queue yet be unpublishable.
  assert.match(TEAM, /INSERT INTO social_post_media/, 'a real slide row is written, not just the column');
});
