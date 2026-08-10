// The Team Lead opens with how the last round went — §7 step 4 of MARKETING_TEAM_DESIGN.md.
//
// Steps 1–3 were built long ago: posts carry the brief that produced them, metrics are swept
// daily, signals are detected. Step 4 was not, so buildSpine() handed the strategist three
// high-reach posts as bare numbers — no baseline, no verdict, and no mention of the success_metric
// the Lead itself had written into the brief. It could see WHAT happened and never whether it was
// good.
//
// What these tests defend, in order of how badly each would hurt: that "no data" is SAID rather
// than omitted (a model reads silence as "nothing happened"), that a post measured on five days is
// not counted five times, that a partial scorecard announces itself as partial, and that a broken
// retrospective costs the Lead its memory rather than its desk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildRetrospective, renderRetrospective, RETRO_BUDGET } from '../../functions/_lib/retrospective.js';

// A D1 stand-in that dispatches on the SQL each query actually contains.
function fakeDb(state = {}) {
  const route = (sql) => {
    if (sql.includes('FROM team_briefs')) return { all: async () => ({ results: state.briefs || [] }) };
    if (sql.includes('FROM post_provenance pp\n       JOIN') || sql.includes('GROUP BY pp.brief_id')) {
      return { all: async () => ({ results: state.perf || [] }) };
    }
    if (sql.includes('audit_flags')) return { all: async () => ({ results: state.audited || [] }) };
    if (sql.includes("status = 'published'")) return { first: async () => state.coverage || { published: 0, attributed: 0 } };
    if (sql.includes('FROM ig_account_metrics')) return { all: async () => ({ results: state.account || [] }) };
    if (sql.includes('MAX(posted_at)')) return { first: async () => state.lastPost || { last: null } };
    if (sql.includes('FROM ig_media_metrics')) return { all: async () => ({ results: state.media || [] }) };
    return { all: async () => ({ results: [] }), first: async () => null };
  };
  return {
    prepare: (sql) => ({
      bind: () => ({ ...route(sql), run: async () => ({}) }),
      ...route(sql),
      run: async () => ({}),
    }),
  };
}

const envOf = (state) => ({ DB: fakeDb(state) });

test('a brief with no attributed post says so — it is never scored as a zero', async () => {
  // The difference that matters to a strategist: "this campaign failed" and "this campaign has not
  // shipped yet" are opposite instructions, and both look like no data.
  const retro = await buildRetrospective(envOf({
    briefs: [{ id: 'brf_1', title: 'Bowl Identity Series', success_metric: '3 saves per post', status: 'draft', created_at: 1 }],
    perf: [],
    coverage: { published: 0, attributed: 0 },
  }));
  const text = renderRetrospective(retro);
  assert.match(text, /Bowl Identity Series/);
  assert.match(text, /3 saves per post/, "the Lead's own target is quoted back at it");
  assert.match(text, /NO published post carries this brief's id, so it cannot be judged yet/);
});

test("a brief that DID ship is scored against the target it set itself", async () => {
  const retro = await buildRetrospective(envOf({
    briefs: [{ id: 'brf_1', title: 'Macro Portal push', success_metric: '10 calculator visits', status: 'active', created_at: 1 }],
    perf: [{ brief_id: 'brf_1', posts: 2, reach: 210, saved: 7 }],
    coverage: { published: 2, attributed: 2 },
    account: [{ capture_date: '2026-07-20', followers: 40 }, { capture_date: '2026-08-08', followers: 42 }],
  }));
  const text = renderRetrospective(retro);
  assert.match(text, /"Macro Portal push"/);
  assert.match(text, /target: "10 calculator visits"/);
  assert.match(text, /2 posts/);
  assert.match(text, /210 reach/);
  assert.match(text, /7 saves/);
});

test('partial attribution announces itself — an unmeasured post is not a failed one', async () => {
  const retro = await buildRetrospective(envOf({
    briefs: [{ id: 'brf_1', title: 'A', success_metric: 'x', status: 'active', created_at: 1 }],
    perf: [{ brief_id: 'brf_1', posts: 1, reach: 100, saved: 2 }],
    coverage: { published: 7, attributed: 1 },
  }));
  const text = renderRetrospective(retro);
  assert.match(text, /Attribution is PARTIAL: 1 of 7 published posts carry a brief id/);
  assert.match(text, /unmeasured, not unsuccessful/);
});

test('full attribution stays quiet about coverage — no noise when nothing is wrong', async () => {
  const retro = await buildRetrospective(envOf({
    briefs: [], perf: [], coverage: { published: 3, attributed: 3 },
  }));
  assert.doesNotMatch(renderRetrospective(retro), /Attribution is PARTIAL/);
});

test('thin history is STATED, never omitted — silence reads as "nothing happened"', async () => {
  // The invented-deadline bug in another costume: a model given no trend line will supply one.
  const retro = await buildRetrospective(envOf({ briefs: [], perf: [], coverage: { published: 0, attributed: 0 } }));
  const text = renderRetrospective(retro);
  assert.match(text, /not enough history for a \d+-day trend — do not claim one/);
  assert.match(text, /Not enough posts yet to compare one against a baseline/);
  assert.match(text, /No briefs on the board yet/);
});

test('a recurring auditor rejection is surfaced; a one-off is not', async () => {
  // Once is an incident, twice is a pattern — §7 step 5 turns the pattern into a prompt rule, and
  // the strategist has to be able to see it first.
  const retro = await buildRetrospective(envOf({
    briefs: [], perf: [], coverage: { published: 0, attributed: 0 },
    audited: [
      { audit_flags: JSON.stringify(['no_cta', 'price_claim']) },
      { audit_flags: JSON.stringify(['no_cta']) },
      { audit_flags: JSON.stringify(['no_cta', 'off_voice']) },
      { audit_flags: JSON.stringify(['price_claim']) },
      { audit_flags: JSON.stringify(['one_time_thing']) },
    ],
  }));
  const text = renderRetrospective(retro);
  assert.match(text, /no_cta \(3×\)/, 'the recurring miss, with its count');
  assert.match(text, /price_claim \(2×\)/);
  assert.doesNotMatch(text, /one_time_thing/, 'a single occurrence is variance, not a pattern');
});

test('the PRODUCTION flag shape tallies — { type, detail }, not a bare string', async () => {
  // Caught by running against a real D1 export, not by this suite: the first version keyed on
  // .code/.flag, which every production row lacks, so 21 real rejections rendered as
  // "[object Object] (21×)". A tally that cannot read its own data looks like a finding.
  const retro = await buildRetrospective(envOf({
    briefs: [], perf: [], coverage: { published: 0, attributed: 0 },
    audited: [
      { audit_flags: JSON.stringify([{ type: 'claim', detail: 'Exact macros presented as fact.' }]) },
      { audit_flags: JSON.stringify([{ type: 'claim', detail: 'Price not on the live menu.' }]) },
      { audit_flags: JSON.stringify([{ type: 'voice', detail: 'Reads as arrogant.' }, { type: 'claim', detail: 'Outcome promise.' }]) },
      { audit_flags: JSON.stringify([{ type: 'voice', detail: 'Off-brand hype.' }]) },
    ],
  }));
  const text = renderRetrospective(retro);
  assert.match(text, /claim \(3×\)/, 'the recurring category, named');
  assert.match(text, /voice \(2×\)/);
  assert.doesNotMatch(text, /\[object Object\]/, 'never again');
});

test('malformed audit_flags never break the retrospective', async () => {
  const retro = await buildRetrospective(envOf({
    briefs: [], perf: [], coverage: { published: 0, attributed: 0 },
    audited: [{ audit_flags: 'not json at all' }, { audit_flags: JSON.stringify({ not: 'an array' }) }],
  }));
  assert.ok(retro, 'still returns');
  assert.doesNotThrow(() => renderRetrospective(retro));
});

test('the block carries an instruction, not just numbers — data nobody must act on is decoration', () => {
  const text = renderRetrospective({
    signals: null, flags: [], coverage: { published: 0, attributed: 0 },
    briefs: [{ title: 'A', target: 't', posts: 0, reach: null, saved: null }],
  });
  assert.match(text, /READ THIS BEFORE PROPOSING ANYTHING/);
  assert.match(text, /say what will be different this time/);
});

test('it is hard-capped, and cut by whole lines — the Lead runs on Opus', () => {
  const retro = {
    signals: null, flags: [],
    coverage: { published: 0, attributed: 0 },
    briefs: Array.from({ length: 200 }, (_, i) => ({ title: `Brief number ${i}`, target: 'x'.repeat(140), posts: 0, reach: null, saved: null })),
  };
  const text = renderRetrospective(retro);
  assert.ok(text.length <= RETRO_BUDGET, `capped at ${RETRO_BUDGET}, got ${text.length}`);
  assert.ok(!text.endsWith('…') && !/\s$/.test(text), 'cut on a line boundary, never mid-sentence');
  assert.match(text, /READ THIS BEFORE PROPOSING ANYTHING/, 'the lead line always survives the cut');
});

test('no DB, or a DB that throws, costs the Lead its memory and never its desk', async () => {
  assert.equal(await buildRetrospective({}), null);
  assert.equal(renderRetrospective(null), '', 'and renders to nothing, so the prompt is unchanged');

  const exploding = { DB: { prepare() { throw new Error('D1 down'); } } };
  const retro = await buildRetrospective(exploding);
  assert.ok(retro, 'a throwing DB still returns a shape');
  assert.doesNotThrow(() => renderRetrospective(retro));
});

test('the verdicts come from the DAILY detector, not a second opinion', () => {
  // If the Lead's read of a weak run disagreed with the alert the owner got that morning, one of
  // them is wrong and he has no way to tell which. Same function, one set of thresholds.
  const src = readFileSync(new URL('../../functions/_lib/retrospective.js', import.meta.url), 'utf8');
  assert.match(src, /import \{ detectPerformanceSignals \} from '\.\/instagram_insights\.js'/);
  assert.ok(!/BASELINE_MIN|UNDERPERFORM_RATIO\s*=/.test(src), 'no thresholds are redefined here');
});