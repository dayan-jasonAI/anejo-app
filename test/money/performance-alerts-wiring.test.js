// The wiring for 0079's reaction loop — proving the pieces tested in isolation
// (performance-detection.test.js) are actually connected:
//   · ALERT_TYPES carries the one new type
//   · the daily insights tick raises real `alerts` rows for a real signal, and does NOT let a
//     detection failure sink the tick that just captured the day's data
//   · /api/hub/owner/performance-alerts is owner-gated and forwards detectPerformanceSignals as-is
//   · the marketing HUB page fetches it and renders a card with an honest "not enough data" state
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../../functions/api/hub/admin/insights-tick.js';
import { onRequestGet } from '../../functions/api/hub/owner/performance-alerts.js';
import { ALERT_TYPES } from '../../functions/_lib/alerts.js';
import { makeD1, makeKV } from '../helpers/d1.js';

const TICK = readFileSync(new URL('../../functions/api/hub/admin/insights-tick.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/performance-alerts.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/marketing.html', import.meta.url), 'utf8');

test('social_underperform is a real ALERT_TYPES entry', () => {
  assert.ok(ALERT_TYPES.includes('social_underperform'));
});

// ---------------------------------------------------------------------------
// insights-tick.js — detection runs after the snapshot is stored, and alerting is best-effort.
// ---------------------------------------------------------------------------
function stubFetch(handler) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => handler(String(url));
  return { restore: () => { globalThis.fetch = real; } };
}
const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

const NOW = Date.now();
const DAY_MS = 86400000;

// A single post, far below its own last-3-runs of ~100 reach, AND itself the fourth consecutive
// weak post after three weak ones already on file — engineered so BOTH the single-post and the
// weak-run checks are expected to have "enough data" once the whole-account history query runs
// against a real D1 mock. Mirrors sweepAccountInsights's own MEDIA_LIST fixture shape.
const MEDIA_LIST = { data: [
  { id: 'NEW', caption: 'today', media_type: 'IMAGE', permalink: 'p/new', timestamp: new Date(NOW).toISOString(), like_count: 1, comments_count: 0 },
] };

function tickEnv({ historyRows = [], followerRows = [] } = {}) {
  return {
    CRON_KEY: 'k',
    IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '178', IG_API_HOST: 'facebook',
    DB: makeD1([
      [/SELECT id, ig_media_id FROM social_posts/, () => []],
      [/INSERT OR REPLACE INTO ig_media_metrics/, () => true],
      [/INSERT OR REPLACE INTO ig_account_metrics/, () => true],
      [/FROM ig_media_metrics m[\s\S]*ORDER BY m\.posted_at DESC/, () => historyRows],
      [/MAX\(posted_at\) AS last FROM ig_media_metrics/, () => (historyRows[0] ? { last: historyRows[0].posted_at } : { last: null })],
      [/FROM ig_account_metrics ORDER BY capture_date ASC/, () => followerRows],
      [/SELECT id FROM alerts WHERE dedupe_key/, () => null],
      [/INSERT INTO alerts/, () => true],
      [/INSERT INTO activity_log/, () => true],
    ]),
  };
}
const tickReq = () => new Request('https://anejocateringco.com/api/hub/admin/insights-tick', {
  method: 'POST', headers: { 'x-cron-key': 'k' },
});

test('a real weak-run signal raises a social_underperform alert with warning severity', async () => {
  const f = stubFetch((url) => {
    if (url.includes('/insights')) return jsonRes({ data: [{ name: 'reach', values: [{ value: 8 }] }, { name: 'saved', values: [{ value: 0 }] }] });
    if (url.includes('/media?')) return jsonRes(MEDIA_LIST);
    return jsonRes({ followers_count: 36, media_count: 6 });
  });
  // Three weak posts (already on file) + three strong baseline posts before them — same shape
  // proven to trip weakRun in performance-detection.test.js.
  const historyRows = [
    { media_id: 'NEW', post_id: null, caption: null, posted_at: NOW, reach: 8 },
    { media_id: 'r1', post_id: null, caption: null, posted_at: NOW - 1 * DAY_MS, reach: 9 },
    { media_id: 'r2', post_id: null, caption: null, posted_at: NOW - 2 * DAY_MS, reach: 10 },
    { media_id: 'b1', post_id: null, caption: null, posted_at: NOW - 3 * DAY_MS, reach: 100 },
    { media_id: 'b2', post_id: null, caption: null, posted_at: NOW - 4 * DAY_MS, reach: 100 },
    { media_id: 'b3', post_id: null, caption: null, posted_at: NOW - 5 * DAY_MS, reach: 100 },
  ];
  const env = tickEnv({ historyRows });
  try {
    const res = await onRequestPost({ request: tickReq(), env });
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(body.alerts_raised >= 1, 'at least the weak-run alert must have been raised');

    const inserted = env.DB.calls.filter((c) => /INSERT INTO alerts/.test(c.sql));
    assert.ok(inserted.length >= 1);
    // bind order: (aid, alert_type, severity, title, body, team, ref_type, ref_id, source, dedupe, t, t)
    const weakRunInsert = inserted.find((c) => c.args[1] === 'social_underperform' && /weak_run/.test(c.args[9] || ''));
    assert.ok(weakRunInsert, 'a weak_run-dedupe-keyed alert must have been inserted');
    assert.equal(weakRunInsert.args[2], 'warning', 'a weak run is a warning, never critical');
  } finally { f.restore(); }
});

test('a healthy account (no signal fires) raises nothing — the common case stays quiet', async () => {
  const f = stubFetch((url) => {
    if (url.includes('/insights')) return jsonRes({ data: [{ name: 'reach', values: [{ value: 100 }] }] });
    if (url.includes('/media?')) return jsonRes(MEDIA_LIST);
    return jsonRes({ followers_count: 36, media_count: 6 });
  });
  const env = tickEnv({ historyRows: [] }); // thin history -> everything stays "not enough data"
  try {
    const res = await onRequestPost({ request: tickReq(), env });
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.alerts_raised, 0);
    assert.ok(!env.DB.calls.some((c) => /INSERT INTO alerts/.test(c.sql)));
  } finally { f.restore(); }
});

test('a detection failure (e.g. missing table) never fails the tick that just captured real data', async () => {
  const f = stubFetch((url) => {
    if (url.includes('/insights')) return jsonRes({ data: [{ name: 'reach', values: [{ value: 100 }] }] });
    if (url.includes('/media?')) return jsonRes(MEDIA_LIST);
    return jsonRes({ followers_count: 36, media_count: 6 });
  });
  const env = {
    CRON_KEY: 'k', IG_ACCESS_TOKEN: 'tok', IG_USER_ID: '178', IG_API_HOST: 'facebook',
    DB: makeD1([
      [/SELECT id, ig_media_id FROM social_posts/, () => []],
      [/INSERT OR REPLACE INTO ig_media_metrics/, () => true],
      [/INSERT OR REPLACE INTO ig_account_metrics/, () => true],
      // Every detection read throws — simulates a pre-0064 schema.
      [/FROM ig_media_metrics m[\s\S]*ORDER BY m\.posted_at DESC/, () => { throw new Error('no such table'); }],
      [/MAX\(posted_at\) AS last FROM ig_media_metrics/, () => { throw new Error('no such table'); }],
      [/FROM ig_account_metrics ORDER BY capture_date ASC/, () => { throw new Error('no such table'); }],
    ]),
  };
  try {
    const res = await onRequestPost({ request: tickReq(), env });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true, 'the tick itself must still report success');
    assert.equal(body.posts_captured, 1, 'the snapshot capture must be unaffected by the alerting failure');
    assert.equal(body.alerts_raised, 0);
  } finally { f.restore(); }
});

test('insights-tick.js runs detection and raises through the pure alertsForSignals mapping', () => {
  assert.match(TICK, /detectPerformanceSignals/);
  assert.match(TICK, /alertsForSignals/);
  assert.match(TICK, /raiseAlert\(env, \{ \.\.\.a/);
  assert.match(TICK, /alerting must never fail the tick/);
});

// ---------------------------------------------------------------------------
// /api/hub/owner/performance-alerts — owner-gated, pure forwarding.
// ---------------------------------------------------------------------------
function ownerEnv(routes = []) {
  const sess = JSON.stringify({ type: 'staff', role: 'owner', uid: 'stf_owner', email: 'dayan@anejocateringco.com', la: Date.now(), created: Date.now() });
  return {
    SESSIONS: makeKV({ 'session:tok': sess }),
    DB: makeD1([[/^SELECT active FROM staff WHERE id=\?/, () => ({ active: 1 })], ...routes]),
  };
}
const perfReq = () => new Request('https://anejocateringco.com/api/hub/owner/performance-alerts', {
  headers: { Cookie: 'anejo_sess=tok' },
});

test('GET /performance-alerts is gated to the marketing desk', async () => {
  const env = { SESSIONS: makeKV({}), DB: makeD1([]) };
  const res = await onRequestGet({ request: perfReq(), env });
  assert.equal(res.status, 401);
  assert.match(API, /requireRole\(request, env, MARKETING_DESK\)/);
});

test('GET /performance-alerts forwards an honest empty snapshot on a fresh install', async () => {
  const env = ownerEnv([
    [/FROM ig_media_metrics m[\s\S]*ORDER BY m\.posted_at DESC/, () => []],
    [/MAX\(posted_at\) AS last FROM ig_media_metrics/, () => ({ last: null })],
    [/FROM ig_account_metrics ORDER BY capture_date ASC/, () => []],
  ]);
  const res = await onRequestGet({ request: perfReq(), env });
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.equal(d.singlePost.enoughData, false);
  assert.equal(d.weakRun.enoughData, false);
  assert.equal(d.followerTrend.enoughData, false);
  assert.equal(d.silence.enoughData, false);
});

// ---------------------------------------------------------------------------
// The marketing HUB page — surfaces the same honesty the API returns.
// ---------------------------------------------------------------------------
test('the marketing HUB page fetches performance-alerts and renders an honest "not enough data" card', () => {
  assert.match(PAGE, /\/api\/hub\/owner\/performance-alerts/);
  assert.match(PAGE, /Performance watch/);
  assert.match(PAGE, /Not enough data yet/);
  // The card must say what the team is doing about it, not just report a number.
  assert.match(PAGE, /planner.{0,40}(has been told|approach)/i);
});
