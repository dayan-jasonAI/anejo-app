// The reaction loop (0079): functions/_lib/instagram_insights.js:
//   detectPerformanceSignals / alertsForSignals / reactionBrief
//
// Before this, three of the four levels of the learning loop existed (data stored, shown to a
// human, fed into the planner's prompt as descriptive text) and the fourth — the system
// autonomously REACTING to bad results — did not. Reach could go to zero for a month and nothing
// would say a word.
//
// The hard part is staying statistically honest about it: the account has very few posts, and a
// confident-looking "your posts are failing" built on two or three data points is worse than
// silence, because it trains both the owner and the planner on noise. So every test here checks
// BOTH halves — that a real signal fires, AND that the SAME code stays silent (enoughData:false)
// when there isn't enough history to justify saying anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPerformanceSignals, alertsForSignals, reactionBrief,
  BASELINE_MIN_POSTS, UNDERPERFORM_RATIO, WEAK_RUN_LENGTH, WEAK_RUN_RATIO,
  FOLLOWER_TREND_WINDOW_DAYS, SILENCE_DAYS,
} from '../../functions/_lib/instagram_insights.js';
import { etDateOf, addEtDays } from '../../functions/_lib/hub.js';
import { makeD1 } from '../helpers/d1.js';

const TODAY = etDateOf(Date.now());
const daysAgo = (n) => addEtDays(TODAY, -n);
const msDaysAgo = (n) => Date.parse(`${daysAgo(n)}T12:00:00Z`);

const REACH_SQL = /FROM ig_media_metrics m[\s\S]*ORDER BY m\.posted_at DESC/;
const FOLLOWERS_SQL = /FROM ig_account_metrics ORDER BY capture_date ASC/;
const SILENCE_SQL = /MAX\(posted_at\) AS last FROM ig_media_metrics/;

// A row as recentAccountReach's query returns it (newest posted_at first is the CALLER's job —
// the fixture is handed back pre-sorted the way the real ORDER BY would produce it).
function reachRow(mediaId, reach, daysBack) {
  return { media_id: mediaId, post_id: null, caption: null, posted_at: msDaysAgo(daysBack), reach };
}

function envWith({ reach = [], followers = [], lastPostedDaysBack = undefined } = {}) {
  const routes = [
    [REACH_SQL, () => reach],
    [FOLLOWERS_SQL, () => followers],
    [SILENCE_SQL, () => ({ last: lastPostedDaysBack === undefined ? null : msDaysAgo(lastPostedDaysBack) })],
  ];
  return { DB: makeD1(routes) };
}

// ---------------------------------------------------------------------------
// Constants sanity — pins the thresholds this whole file's reasoning depends on.
// ---------------------------------------------------------------------------
test('the chosen thresholds are what the comments claim', () => {
  assert.equal(BASELINE_MIN_POSTS, 3, 'lower than MIN_SAMPLE_SIZE (5) — one group, not a with/without split');
  assert.equal(UNDERPERFORM_RATIO, 0.5);
  assert.equal(WEAK_RUN_LENGTH, 3);
  assert.equal(WEAK_RUN_RATIO, 0.7);
  assert.equal(FOLLOWER_TREND_WINDOW_DAYS, 14);
  assert.equal(SILENCE_DAYS, 10);
});

// ---------------------------------------------------------------------------
// detectPerformanceSignals — stays silent below the sample floor.
// ---------------------------------------------------------------------------
test('with only 2 prior posts, single-post and weak-run both stay "not enough data" — never a guess', async () => {
  const env = envWith({
    reach: [reachRow('m0', 10, 0), reachRow('m1', 100, 1), reachRow('m2', 100, 2)],
  });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.singlePost.enoughData, false, 'only 2 posts behind the newest one — below BASELINE_MIN_POSTS');
  assert.equal(s.weakRun.enoughData, false);
});

test('zero post history at all is "not enough data", not zero signals of alarm', async () => {
  const env = envWith({ reach: [] });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.singlePost.enoughData, false);
  assert.equal(s.weakRun.enoughData, false);
});

test('follower trend needs history reaching back the full window, not just 2 data points', async () => {
  // Only 5 days of snapshots — the account has not been tracked for a full 14-day window yet.
  const followers = [5, 4, 3, 2, 1].map((d) => ({ capture_date: daysAgo(d), followers: 100 + (5 - d) }));
  const env = envWith({ followers });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.followerTrend.enoughData, false);
});

test('a single stray snapshot alone cannot form a follower trend', async () => {
  const env = envWith({ followers: [{ capture_date: TODAY, followers: 50 }] });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.followerTrend.enoughData, false);
});

test('no posting history at all reads as "we do not know yet" — never a false "silent" alarm', async () => {
  const env = envWith({ lastPostedDaysBack: undefined });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.silence.enoughData, false);
});

// ---------------------------------------------------------------------------
// detectPerformanceSignals — fires above the floor, on a REAL drop.
// ---------------------------------------------------------------------------
test('a post at 10% of its own recent baseline is flagged — a real, unambiguous gap', async () => {
  const env = envWith({
    reach: [
      reachRow('new', 10, 0),
      reachRow('b1', 100, 1), reachRow('b2', 100, 2), reachRow('b3', 100, 3),
    ],
  });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.singlePost.enoughData, true);
  assert.equal(s.singlePost.baselineN, 3, 'exactly BASELINE_MIN_POSTS must be enough, not one short');
  assert.equal(s.singlePost.baselineMedian, 100);
  assert.equal(s.singlePost.flagged, true, 'reach 10 vs baseline 100 is 10% — well under the 50% bar');
});

test('a post at 90% of baseline is ordinary variance, not flagged', async () => {
  const env = envWith({
    reach: [
      reachRow('new', 90, 0),
      reachRow('b1', 100, 1), reachRow('b2', 100, 2), reachRow('b3', 100, 3),
    ],
  });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.singlePost.enoughData, true);
  assert.equal(s.singlePost.flagged, false, '90% of baseline is well inside normal wobble');
});

// ---------------------------------------------------------------------------
// Consecutive weak-run detection — the "a pattern, not a blip" case, and proof it is judged
// SEPARATELY from the single-post check (a run of moderately-soft posts that never individually
// crosses the single-post bar must still be caught by the run check).
// ---------------------------------------------------------------------------
test('three posts in a row at ~65-69% of baseline trip the weak-run check but NOT the single-post check', async () => {
  const env = envWith({
    reach: [
      reachRow('r0', 65, 0), reachRow('r1', 68, 1), reachRow('r2', 69, 2),
      reachRow('b1', 100, 3), reachRow('b2', 100, 4), reachRow('b3', 100, 5),
    ],
  });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.weakRun.enoughData, true);
  assert.equal(s.weakRun.baselineN, 3);
  assert.equal(s.weakRun.baselineMedian, 100);
  assert.equal(s.weakRun.flagged, true, 'all three posts are at or below 70% of the pre-run baseline');
  assert.deepEqual(s.weakRun.reaches, [65, 68, 69]);
  // The newest post alone (65 vs a baseline of 100 computed from the OTHER 5 posts) is 65% of
  // baseline — inside the single-post 50% bar, so that check must stay quiet. Proves the two
  // detectors disagree correctly rather than one just mirroring the other.
  assert.equal(s.singlePost.flagged, false, 'a repeated pattern is not the same finding as one bad post');
});

test('two weak posts are not a "run" — WEAK_RUN_LENGTH is 3, not 2', async () => {
  const env = envWith({
    reach: [
      reachRow('r0', 20, 0), reachRow('r1', 20, 1),
      reachRow('b1', 100, 2), reachRow('b2', 100, 3), reachRow('b3', 100, 4),
    ],
  });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.weakRun.enoughData, false, 'only 5 total posts — WEAK_RUN_LENGTH(3) + BASELINE_MIN_POSTS(3) needs 6');
});

test('a run where only 2 of 3 posts are soft is NOT flagged — every post in the run must qualify', async () => {
  const env = envWith({
    reach: [
      reachRow('r0', 20, 0), reachRow('r1', 20, 1), reachRow('r2', 95, 2), // r2 is basically on-baseline
      reachRow('b1', 100, 3), reachRow('b2', 100, 4), reachRow('b3', 100, 5),
    ],
  });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.weakRun.enoughData, true);
  assert.equal(s.weakRun.flagged, false, 'one on-baseline post in the run breaks the pattern');
});

test('the baseline for a run excludes the run itself — a bad run cannot drag down its own yardstick', async () => {
  // If the 3 weak posts were folded into their own baseline, the median would drop and the run
  // could self-launder into looking "normal". It must not.
  const env = envWith({
    reach: [
      reachRow('r0', 10, 0), reachRow('r1', 10, 1), reachRow('r2', 10, 2),
      reachRow('b1', 100, 3), reachRow('b2', 100, 4), reachRow('b3', 100, 5),
    ],
  });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.weakRun.baselineMedian, 100, 'baseline must come from the 3 posts BEFORE the run only');
});

// ---------------------------------------------------------------------------
// Follower trend — flat and falling, over a real window.
// ---------------------------------------------------------------------------
test('followers falling over the full 14-day window is flagged, with the real delta', async () => {
  const followers = [];
  for (let d = 20; d >= 0; d--) followers.push({ capture_date: daysAgo(d), followers: 100 - (20 - d) }); // 100 -> 80
  const env = envWith({ followers });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.followerTrend.enoughData, true);
  assert.equal(s.followerTrend.falling, true);
  assert.equal(s.followerTrend.flat, false);
  assert.equal(s.followerTrend.delta, -14, 'delta measured across the 14-day window, not the whole history');
});

test('followers exactly unchanged over the window reads as flat, not falling', async () => {
  const followers = [];
  for (let d = 20; d >= 0; d--) followers.push({ capture_date: daysAgo(d), followers: 50 });
  const env = envWith({ followers });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.followerTrend.enoughData, true);
  assert.equal(s.followerTrend.flat, true);
  assert.equal(s.followerTrend.falling, false);
  assert.equal(s.followerTrend.delta, 0);
});

test('followers growing over the window is neither falling nor flat', async () => {
  const followers = [];
  for (let d = 20; d >= 0; d--) followers.push({ capture_date: daysAgo(d), followers: 50 + (20 - d) });
  const env = envWith({ followers });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.followerTrend.falling, false);
  assert.equal(s.followerTrend.flat, false);
});

// ---------------------------------------------------------------------------
// The "nothing published at all" case — a failure mode nothing in this codebase noticed before.
// ---------------------------------------------------------------------------
test('silence: 20 days since the last post trips the flag', async () => {
  const env = envWith({ lastPostedDaysBack: 20 });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.silence.enoughData, true);
  assert.equal(s.silence.daysSince, 20);
  assert.equal(s.silence.flagged, true);
});

test('silence: 3 days since the last post is an ordinary gap, not silence', async () => {
  const env = envWith({ lastPostedDaysBack: 3 });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.silence.enoughData, true);
  assert.equal(s.silence.flagged, false);
});

test('silence: exactly SILENCE_DAYS is flagged — the threshold is inclusive', async () => {
  const env = envWith({ lastPostedDaysBack: SILENCE_DAYS });
  const s = await detectPerformanceSignals(env);
  assert.equal(s.silence.flagged, true);
});

// ---------------------------------------------------------------------------
// Every new read degrades to empty INDEPENDENTLY — a missing/broken table for one signal must
// never take down the other three, and must never break the caller (insights-tick.js's daily
// run, or the weekly planner via reactionBrief).
// ---------------------------------------------------------------------------
test('a broken ig_media_metrics read leaves follower-trend and silence unaffected', async () => {
  const followers = [];
  for (let d = 20; d >= 0; d--) followers.push({ capture_date: daysAgo(d), followers: 50 });
  const env = {
    DB: makeD1([
      [REACH_SQL, () => { throw new Error('no such table: ig_media_metrics'); }],
      [FOLLOWERS_SQL, () => followers],
      [SILENCE_SQL, () => { throw new Error('no such table: ig_media_metrics'); }],
    ]),
  };
  const s = await detectPerformanceSignals(env);
  assert.equal(s.singlePost.enoughData, false);
  assert.equal(s.weakRun.enoughData, false);
  assert.equal(s.followerTrend.enoughData, true, 'the UNRELATED follower-trend read must still work');
  assert.equal(s.silence.enoughData, false);
});

test('a broken ig_account_metrics read leaves post-underperformance detection unaffected', async () => {
  const env = {
    DB: makeD1([
      [REACH_SQL, () => [
        reachRow('new', 10, 0), reachRow('b1', 100, 1), reachRow('b2', 100, 2), reachRow('b3', 100, 3),
      ]],
      [FOLLOWERS_SQL, () => { throw new Error('no such table: ig_account_metrics'); }],
      [SILENCE_SQL, () => ({ last: msDaysAgo(1) })],
    ]),
  };
  const s = await detectPerformanceSignals(env);
  assert.equal(s.singlePost.enoughData, true, 'the UNRELATED post-reach read must still work');
  assert.equal(s.singlePost.flagged, true);
  assert.equal(s.followerTrend.enoughData, false);
  assert.equal(s.silence.enoughData, true);
});

test('no DB binding at all degrades to the same empty shape, never throws', async () => {
  const s1 = await detectPerformanceSignals({});
  assert.equal(s1.ok, true);
  assert.equal(s1.singlePost.enoughData, false);
  const s2 = await detectPerformanceSignals(null);
  assert.equal(s2.ok, true);
});

// ---------------------------------------------------------------------------
// alertsForSignals — severity mapping. Pure function, no DB — the whole point of factoring it
// out of insights-tick.js was to make severity testable without mocking Instagram or D1.
// ---------------------------------------------------------------------------
test('a single soft post never pages anyone — severity is info, per the task\'s own instruction', () => {
  const alerts = alertsForSignals({
    singlePost: { enoughData: true, flagged: true, reach: 5, baselineMedian: 100, baselineN: 3, ratio: 0.05, mediaId: 'm1' },
    weakRun: { enoughData: false }, followerTrend: { enoughData: false }, silence: { enoughData: false },
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].alert_type, 'social_underperform');
  assert.equal(alerts[0].severity, 'info');
  assert.equal(alerts[0].dedupe_key, 'social_underperform:single:m1');
});

test('a weak run is a warning — a real pattern, but never critical (nothing about it "breaks the day")', () => {
  const alerts = alertsForSignals({
    singlePost: { enoughData: false },
    weakRun: { enoughData: true, flagged: true, reaches: [10, 12, 11], baselineMedian: 100, baselineN: 3, mediaIds: ['a', 'b', 'c'] },
    followerTrend: { enoughData: false }, silence: { enoughData: false },
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'warning');
  assert.equal(alerts[0].dedupe_key, 'social_underperform:weak_run:a,b,c');
});

test('followers falling is a warning; flat is only info', () => {
  const falling = alertsForSignals({
    singlePost: { enoughData: false }, weakRun: { enoughData: false }, silence: { enoughData: false },
    followerTrend: { enoughData: true, falling: true, flat: false, delta: -5, latestFollowers: 95, baselineFollowers: 100, windowDays: 14 },
  });
  assert.equal(falling[0].severity, 'warning');
  assert.equal(falling[0].dedupe_key, 'social_underperform:followers:falling');

  const flat = alertsForSignals({
    singlePost: { enoughData: false }, weakRun: { enoughData: false }, silence: { enoughData: false },
    followerTrend: { enoughData: true, falling: false, flat: true, delta: 0, latestFollowers: 100, baselineFollowers: 100, windowDays: 14 },
  });
  assert.equal(flat[0].severity, 'info');
  assert.equal(flat[0].dedupe_key, 'social_underperform:followers:flat');
});

test('followers growing raises nothing at all', () => {
  const alerts = alertsForSignals({
    singlePost: { enoughData: false }, weakRun: { enoughData: false }, silence: { enoughData: false },
    followerTrend: { enoughData: true, falling: false, flat: false, delta: 10, latestFollowers: 110, baselineFollowers: 100, windowDays: 14 },
  });
  assert.equal(alerts.length, 0);
});

test('silence is a warning — an operational gap the team can act on, still never critical', () => {
  const alerts = alertsForSignals({
    singlePost: { enoughData: false }, weakRun: { enoughData: false }, followerTrend: { enoughData: false },
    silence: { enoughData: true, flagged: true, daysSince: 15 },
  });
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].severity, 'warning');
  assert.equal(alerts[0].dedupe_key, 'social_underperform:silence');
});

test('nothing enoughData/flagged raises nothing — the common case must be silent, not noisy', () => {
  const alerts = alertsForSignals({
    singlePost: { enoughData: true, flagged: false },
    weakRun: { enoughData: true, flagged: false },
    followerTrend: { enoughData: true, falling: false, flat: false },
    silence: { enoughData: true, flagged: false },
  });
  assert.equal(alerts.length, 0);
});

test('no severity used anywhere is "critical" — that bar is reserved for the day breaking', () => {
  const all = [
    ...alertsForSignals({ singlePost: { enoughData: true, flagged: true, reach: 1, baselineMedian: 100, baselineN: 3, ratio: 0.01, mediaId: 'x' }, weakRun: {}, followerTrend: {}, silence: {} }),
    ...alertsForSignals({ weakRun: { enoughData: true, flagged: true, reaches: [1, 1, 1], baselineMedian: 100, baselineN: 3, mediaIds: ['x'] }, singlePost: {}, followerTrend: {}, silence: {} }),
    ...alertsForSignals({ followerTrend: { enoughData: true, falling: true, flat: false, delta: -50, latestFollowers: 50, baselineFollowers: 100, windowDays: 14 }, singlePost: {}, weakRun: {}, silence: {} }),
    ...alertsForSignals({ silence: { enoughData: true, flagged: true, daysSince: 60 }, singlePost: {}, weakRun: {}, followerTrend: {} }),
  ];
  assert.ok(all.length >= 4);
  for (const a of all) assert.notEqual(a.severity, 'critical');
});

test('an empty/null signals object raises nothing rather than throwing', () => {
  assert.deepEqual(alertsForSignals(null), []);
  assert.deepEqual(alertsForSignals({}), []);
});

// ---------------------------------------------------------------------------
// reactionBrief — the planner-facing text. The reaction INSTRUCTION appears only when data
// supports it; a plain "not enough data" note appears when it does not, so the planner is never
// left silently guessing which state it is in.
// ---------------------------------------------------------------------------
test('the reaction instruction appears only for a real, enough-data weak run', async () => {
  const env = envWith({
    reach: [
      reachRow('r0', 10, 0), reachRow('r1', 10, 1), reachRow('r2', 10, 2),
      reachRow('b1', 100, 3), reachRow('b2', 100, 4), reachRow('b3', 100, 5),
    ],
  });
  const brief = await reactionBrief(env);
  assert.match(brief, /REACT: THE LAST 3 POSTS UNDERPERFORMED/);
  assert.match(brief, /Do NOT repeat the same format, category and angle/);
  assert.match(brief, /DIFFERENT format/);
});

test('with too little history, the brief says so plainly instead of staying silent or guessing', async () => {
  const env = envWith({ reach: [reachRow('m0', 10, 0)] });
  const brief = await reactionBrief(env);
  assert.match(brief, /NOT ENOUGH DATA TO REACT/);
  assert.match(brief, /Do NOT change format, category or angle/);
  assert.ok(!/REACT: THE LAST/.test(brief), 'the imperative reaction header must not appear without a real signal');
});

test('with enough data and a healthy trend, the brief is silent — nothing to react to', async () => {
  const env = envWith({
    reach: [
      reachRow('r0', 95, 0), reachRow('r1', 98, 1), reachRow('r2', 97, 2),
      reachRow('b1', 100, 3), reachRow('b2', 100, 4), reachRow('b3', 100, 5),
    ],
  });
  const brief = await reactionBrief(env);
  assert.equal(brief, '', 'a healthy trend must not manufacture text the planner would read as a scaffold');
});

test('no DB binding degrades reactionBrief to empty, never throws', async () => {
  assert.equal(await reactionBrief(null), '');
  assert.equal(await reactionBrief({}), '');
});
