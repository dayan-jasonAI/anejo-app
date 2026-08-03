// Reporting results back BY CAUSE (0076) — functions/_lib/instagram_insights.js:
// attributionRollup / attributionBrief.
//
// The whole point is statistical honesty: with a handful of published posts, a ranking is not a
// finding, it's noise wearing a finding's costume. So every comparison here is checked for BOTH
// its numbers (median vs mean, computed correctly) AND its refusal to rank once a side of the
// comparison has fewer than MIN_SAMPLE_SIZE posts — the refusal matters as much as the number.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { attributionRollup, attributionBrief, MIN_SAMPLE_SIZE } from '../../functions/_lib/instagram_insights.js';
import { makeD1 } from '../helpers/d1.js';

// ---------------------------------------------------------------------------
// Fixture: 13 "published, measured" posts.
//
//   p1-p5   ("with rul_1", category=menu)   reaches [100,120,90,200,80] — median 100, mean 118.
//           The 200 outlier is deliberate: mean and median must differ so the test can tell
//           them apart, and pull in different directions if computed wrong.
//   p6-p10  ("without rul_1", category=promo) reaches [40,50,60,45,55] — median 50, mean 50.
//           p8/p9 carry rul_2 instead (only 2 posts total → rul_2 must read "not enough data").
//           brf_1 directs p6-p8 only (3 posts → also "not enough data" even though the OTHER
//           side, 7 posts, would clear the bar alone — one thin side is enough to block ranking).
//   p11-p13 have NO provenance row at all — high/low reach on purpose, so a bug that folds them
//           into any comparison would visibly skew the numbers a test can catch.
//
// format: single = p1,p2,p6,p7,p8 (5); carousel = p4,p5,p10 (3); p3,p9 leave format unrecorded
// (Studio hasn't decided yet) — both format buckets end up "not enough data" (3 < 5 on one side),
// proving format is judged on its OWN recorded value, not smuggled in via category/rule counts.
// ---------------------------------------------------------------------------
function row(post_id, reach, has_provenance, rule_ids, brief_id, category, format) {
  return { post_id, reach, has_provenance: has_provenance ? 1 : 0, rule_ids, brief_id, category, format };
}
const FIXTURE_ROWS = [
  row('p1', 100, 1, JSON.stringify(['rul_1']), null, 'menu', 'single'),
  row('p2', 120, 1, JSON.stringify(['rul_1']), null, 'menu', 'single'),
  row('p3', 90, 1, JSON.stringify(['rul_1']), null, 'menu', null),
  row('p4', 200, 1, JSON.stringify(['rul_1']), null, 'menu', 'carousel'),
  row('p5', 80, 1, JSON.stringify(['rul_1']), null, 'menu', 'carousel'),
  row('p6', 40, 1, JSON.stringify([]), 'brf_1', 'promo', 'single'),
  row('p7', 50, 1, JSON.stringify([]), 'brf_1', 'promo', 'single'),
  row('p8', 60, 1, JSON.stringify(['rul_2']), 'brf_1', 'promo', 'single'),
  row('p9', 45, 1, JSON.stringify(['rul_2']), null, 'promo', null),
  row('p10', 55, 1, JSON.stringify([]), null, 'promo', 'carousel'),
  row('p11', 999, 0, null, null, null, null),
  row('p12', 1, 0, null, null, null, null),
  row('p13', 500, 0, null, null, null, null),
];

function fixtureEnv() {
  return {
    DB: makeD1([
      [/FROM social_posts p[\s\S]*JOIN ig_media_metrics m/, () => FIXTURE_ROWS],
      [/FROM training_rules WHERE active = 1/, () => [
        { id: 'rul_1', text: 'Show the food first.', created_by: 'owner', created_at: 1, updated_at: 1 },
        { id: 'rul_2', text: 'Mention catering every third post.', created_by: 'owner', created_at: 1, updated_at: 1 },
      ]],
      [/FROM training_examples WHERE active = 1/, () => []],
      [/FROM team_briefs/, () => [{ id: 'brf_1', title: 'Summer Menu Push' }]],
    ]),
  };
}

test('MIN_SAMPLE_SIZE is 5 — the same bar trust_ledger.js already uses for "enough repeats to trust"', () => {
  assert.equal(MIN_SAMPLE_SIZE, 5);
});

test('rule with 5-vs-5 published posts gets a real comparison, median and mean both correct', async () => {
  const r = await attributionRollup(fixtureEnv());
  assert.equal(r.ok, true);
  assert.equal(r.totalPublished, 13, 'all 13 measured posts count toward the total, provenance or not');
  assert.equal(r.totalWithProvenance, 10, 'only the 10 stamped posts count as having provenance');

  const rul1 = r.byRule.find((x) => x.ruleId === 'rul_1');
  assert.equal(rul1.withN, 5);
  assert.equal(rul1.withoutN, 5);
  assert.equal(rul1.enoughData, true, 'exactly MIN_SAMPLE_SIZE on both sides must be enough, not one short');
  assert.equal(rul1.withMedianReach, 100, 'median of [80,90,100,120,200]');
  assert.equal(rul1.withMeanReach, 118, 'mean of the same set — deliberately different from the median');
  assert.equal(rul1.withoutMedianReach, 50);
  assert.equal(rul1.withoutMeanReach, 50);
});

test('a rule used on only 2 posts refuses to rank, even though it IS applied to some posts', async () => {
  const r = await attributionRollup(fixtureEnv());
  const rul2 = r.byRule.find((x) => x.ruleId === 'rul_2');
  assert.equal(rul2.withN, 2);
  assert.equal(rul2.enoughData, false, 'n=2 is noise, not a finding');
});

test('a brief refuses to rank when its OWN side is thin, even though the other side clears the bar', async () => {
  const r = await attributionRollup(fixtureEnv());
  const brf1 = r.byBrief.find((x) => x.briefId === 'brf_1');
  assert.equal(brf1.withN, 3);
  assert.equal(brf1.withoutN, 7, 'the other side has plenty of posts...');
  assert.equal(brf1.enoughData, false, '...but one thin side is enough to block ranking entirely');
});

test('posts with no provenance row at all are excluded from rule/brief/category comparisons', async () => {
  const r = await attributionRollup(fixtureEnv());
  // p11/p12/p13 carry deliberately extreme reach (999, 1, 500). If they leaked into any
  // comparison the numbers below would move; they must not, because they were never stamped.
  const rul1 = r.byRule.find((x) => x.ruleId === 'rul_1');
  assert.equal(rul1.withN + rul1.withoutN, 10, 'only the 10 stamped posts form the rule universe');
  const menu = r.byCategory.find((x) => x.category === 'menu');
  assert.equal(menu.withN + menu.withoutN, 10);
});

test('category comparison at exactly 5-vs-5 is ranked; a category with zero posts is not', async () => {
  const r = await attributionRollup(fixtureEnv());
  const menu = r.byCategory.find((x) => x.category === 'menu');
  assert.equal(menu.enoughData, true);
  assert.equal(menu.withMedianReach, 100);
  const macroPortal = r.byCategory.find((x) => x.category === 'macro_portal');
  assert.equal(macroPortal.withN, 0);
  assert.equal(macroPortal.enoughData, false, 'a category nobody has used yet must say so, not rank on n=0');
});

test('format is judged on ITS OWN recorded value, not smuggled in via category/rule membership', async () => {
  const r = await attributionRollup(fixtureEnv());
  const single = r.byFormat.find((x) => x.format === 'single');
  const carousel = r.byFormat.find((x) => x.format === 'carousel');
  assert.equal(single.withN, 5);
  assert.equal(carousel.withN, 3);
  // p3 and p9 have provenance but NO recorded format — they must appear in NEITHER bucket.
  assert.equal(single.withN + carousel.withN, 8, 'p3 and p9 (format unrecorded) are excluded entirely');
  assert.equal(single.enoughData, false, "the other side (carousel, 3) is too thin to rank either");
  assert.equal(carousel.enoughData, false);
});

test('zero published posts degrades to an honest empty rollup, never throws', async () => {
  const env = { DB: makeD1([[/FROM social_posts p[\s\S]*JOIN ig_media_metrics m/, () => []]]) };
  const r = await attributionRollup(env);
  assert.equal(r.ok, true);
  assert.equal(r.totalPublished, 0);
  assert.equal(r.totalWithProvenance, 0);
  assert.deepEqual(r.byRule, []);
  assert.deepEqual(r.byBrief, []);
  assert.deepEqual(r.byCategory, []);
  assert.deepEqual(r.byFormat, []);
});

test('no DB binding degrades to the same empty shape, never throws', async () => {
  const r = await attributionRollup({});
  assert.equal(r.ok, true);
  assert.equal(r.totalPublished, 0);
  const r2 = await attributionRollup(null);
  assert.equal(r2.ok, true);
});

test('a query failure (e.g. pre-0076 schema) degrades to the empty shape rather than throwing', async () => {
  const env = { DB: { prepare() { throw new Error('no such table: post_provenance'); } } };
  const r = await attributionRollup(env);
  assert.equal(r.ok, true);
  assert.equal(r.totalPublished, 0);
});

// ---------------------------------------------------------------------------
// attributionBrief — the planner-facing text. Same discipline as performanceBrief(): '' when
// there is nothing worth saying, never a scaffold that looks like data.
// ---------------------------------------------------------------------------

test('the planner brief surfaces only comparisons that cleared the sample-size bar', async () => {
  const brief = await attributionBrief(fixtureEnv());
  assert.match(brief, /Rule "Show the food first\."/, 'rul_1 cleared the bar and must be named');
  assert.match(brief, /Category menu/);
  assert.match(brief, /Category promo/);
  assert.ok(!/Mention catering every third post/.test(brief), 'rul_2 (n=2) must stay silent, not guess');
  assert.ok(!/Summer Menu Push/.test(brief), 'brf_1 (n=3) must stay silent');
  assert.ok(!/Format /.test(brief), 'neither format cleared the bar');
});

test('the planner brief is empty — not fabricated — when there is no data at all', async () => {
  const env = { DB: makeD1([[/FROM social_posts p[\s\S]*JOIN ig_media_metrics m/, () => []]]) };
  assert.equal(await attributionBrief(env), '');
  assert.equal(await attributionBrief({}), '');
});

test('the planner brief is empty when posts exist but nothing clears the sample-size bar', async () => {
  // Every comparison here is thin on at least one side (n=2), so the brief must stay silent
  // rather than teach the planner a pattern built on noise.
  const env = {
    DB: makeD1([
      [/FROM social_posts p[\s\S]*JOIN ig_media_metrics m/, () => [
        row('q1', 100, 1, JSON.stringify(['rul_1']), null, 'menu', 'single'),
        row('q2', 110, 1, JSON.stringify(['rul_1']), null, 'menu', 'single'),
      ]],
      [/FROM training_rules WHERE active = 1/, () => [{ id: 'rul_1', text: 'x', created_at: 1, updated_at: 1 }]],
      [/FROM training_examples WHERE active = 1/, () => []],
      [/FROM team_briefs/, () => []],
    ]),
  };
  assert.equal(await attributionBrief(env), '');
});
