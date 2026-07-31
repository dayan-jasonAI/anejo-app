// The learning loop's input: what every post on the account actually did.
//
// Two design decisions carry the value here, and both are pinned:
//   · THE WHOLE ACCOUNT is swept, not just pipeline posts — the 6 pre-pipeline posts are the only
//     performance history the brand has, and skipping them throws away the training set on day 1.
//   · SNAPSHOTS, not latest-values — reach on day 2 vs day 7 distinguishes "died instantly" from
//     "slow burner", and an upsert erases exactly that.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sweepAccountInsights, performanceBrief } from '../../functions/_lib/instagram_insights.js';

const LIB = readFileSync(new URL('../../functions/_lib/instagram_insights.js', import.meta.url), 'utf8');
const TICK = readFileSync(new URL('../../functions/api/hub/admin/insights-tick.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0064_ig_insights.sql', import.meta.url), 'utf8');
const AUTO = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');
const CRON = readFileSync(new URL('../../cron/worker.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/social.html', import.meta.url), 'utf8');

const env = (tok) => ({ IG_ACCESS_TOKEN: tok, IG_USER_ID: '17841400000000000', IG_API_HOST: 'facebook' });

function stubFetch(handler) {
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => handler(String(url));
  return { restore: () => { globalThis.fetch = real; } };
}
const jsonRes = (body, status = 200) => new Response(JSON.stringify(body), { status });

const MEDIA_LIST = { data: [
  { id: 'M1', caption: 'VIDA post', media_type: 'IMAGE', permalink: 'p/1', timestamp: '2026-07-30T12:00:00+0000', like_count: 12, comments_count: 3 },
  { id: 'M2', caption: 'old pre-pipeline post', media_type: 'CAROUSEL_ALBUM', permalink: 'p/2', timestamp: '2026-06-01T12:00:00+0000', like_count: 40, comments_count: 8 },
] };

test('the sweep reads the ACCOUNT media list — pre-pipeline posts included', async () => {
  const f = stubFetch((url) => {
    if (url.includes('/media?') || url.includes('%2Fmedia')) return jsonRes(MEDIA_LIST);
    if (url.includes('/insights')) return jsonRes({ data: [{ name: 'reach', values: [{ value: 100 }] }, { name: 'saved', values: [{ value: 5 }] }] });
    return jsonRes({ followers_count: 36, media_count: 6 });
  });
  try {
    const r = await sweepAccountInsights(env('tok-sweep'));
    assert.equal(r.ok, true);
    assert.equal(r.rows.length, 2, 'both posts captured, ours or not');
    assert.equal(r.rows[1].caption, 'old pre-pipeline post');
    assert.equal(r.rows[0].reach, 100);
    assert.equal(r.account.followers, 36);
  } finally { f.restore(); }
});

test('an invalid-metric rejection falls back to the minimal set instead of losing the snapshot', async () => {
  // Meta rejects the WHOLE insights call if one metric is wrong for that media type, and metric
  // names drift between versions. A partial snapshot beats none.
  const asked = [];
  const f = stubFetch((url) => {
    if (url.includes('/insights')) {
      asked.push(decodeURIComponent(url).match(/metric=([^&]+)/)[1]);
      if (asked[asked.length - 1].includes('views')) return jsonRes({ error: { message: 'metric[4] must be one of ...' } }, 400);
      return jsonRes({ data: [{ name: 'reach', values: [{ value: 55 }] }] });
    }
    if (url.includes('/media?')) return jsonRes({ data: [MEDIA_LIST.data[0]] });
    return jsonRes({ followers_count: 36, media_count: 6 });
  });
  try {
    const r = await sweepAccountInsights(env('tok-fallback'));
    assert.equal(r.rows[0].reach, 55, 'the retry with the minimal set landed');
    assert.ok(asked.length >= 2, 'full set tried first, then the fallback');
  } finally { f.restore(); }
});

test('a PERMISSION failure still captures likes, comments and followers — and names the fix', async () => {
  // The old token predates manage_insights. That must degrade to a partial snapshot with a clear
  // hint, not a failed run — likes/comments ride the media list, not the insights edge.
  const f = stubFetch((url) => {
    if (url.includes('/insights')) return jsonRes({ error: { message: '(#10) Application does not have permission for this action' } }, 403);
    if (url.includes('/media?')) return jsonRes(MEDIA_LIST);
    return jsonRes({ followers_count: 36, media_count: 6 });
  });
  try {
    const r = await sweepAccountInsights(env('tok-perm'));
    assert.equal(r.ok, true, 'the sweep itself succeeds');
    assert.equal(r.rows[0].likes, 12, 'likes still landed');
    assert.equal(r.rows[0].reach, null, 'insights honestly null, not zero');
    assert.match(String(r.insights_error), /permission/i);
    assert.match(TICK, /Regenerate the token under Instagram/);
  } finally { f.restore(); }
});

test('snapshots are per-day and yesterday is never touched', () => {
  assert.match(MIG, /PRIMARY KEY \(media_id, capture_date\)/);
  assert.match(TICK, /INSERT OR REPLACE INTO ig_media_metrics/);
  assert.ok(!/DELETE FROM ig_media_metrics/.test(TICK), 'history is never pruned by the tick');
});

test('followers are recorded daily — the number the whole engine is judged on', () => {
  assert.match(MIG, /CREATE TABLE IF NOT EXISTS ig_account_metrics/);
  assert.match(TICK, /INSERT OR REPLACE INTO ig_account_metrics/);
  assert.match(CRON, /'0 10 \* \* \*': \['\/api\/hub\/admin\/insights-tick'\]/);
});

test('the planner OPENS with the performance readout once data exists', () => {
  assert.match(AUTO, /const performance = await performanceBrief\(env\)/);
  assert.match(AUTO, /\(performance \? performance \+ '\\n\\n' : ''\)/);
});

test('no data yet means an EMPTY brief — never a scaffold that reads like data', async () => {
  const r = await performanceBrief({ DB: { prepare: () => ({ all: async () => ({ results: [] }) }) } });
  assert.equal(r, '');
  const r2 = await performanceBrief(null);
  assert.equal(r2, '');
});

test('the tick is not open to the internet, and no token is a skip', () => {
  assert.match(TICK, /ctEq\(cronKey, env\.CRON_KEY\)/);
  assert.match(TICK, /requireRole\(request, env, \['owner'\]\)/);
  assert.match(TICK, /skipped: 'instagram_not_configured'/);
});

test('a published post with no data says so — no fake zeros on the page', () => {
  assert.match(PAGE, /No performance data yet/);
  assert.match(LIB, /if \(!rows\.length\) return ''/);
});
