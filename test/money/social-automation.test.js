// The social loop, running without anyone watching.
//
// The account has six posts because writing them is a job nobody has time for. This closes the
// loop: a planner writes the week, a human approves, a timer publishes. Two of those three steps
// are new, and both are the kind that can embarrass a brand in public.
//
// The rules everything below defends:
//   1. NOTHING PUBLISHES WITHOUT A HUMAN. Generated copy reaching a real profile unreviewed is how
//      a business advertises a bowl it stopped selling, in a voice that is not its own.
//   2. IT CANNOT PROMOTE WHAT IT CANNOT SELL. Five of seven bowls are off this week.
//   3. LATE IS WRONG, NOT LATE. Timing is part of a social post in a way it is not for an email.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const AUTO = readFileSync(new URL('../../functions/_lib/automations.js', import.meta.url), 'utf8');
const TICK = readFileSync(new URL('../../functions/api/hub/admin/social-tick.js', import.meta.url), 'utf8');
const API = readFileSync(new URL('../../functions/api/hub/owner/social.js', import.meta.url), 'utf8');
const CRON = readFileSync(new URL('../../cron/worker.js', import.meta.url), 'utf8');
const MIG = readFileSync(new URL('../../migrations/0061_social_planning.sql', import.meta.url), 'utf8');

// ---------- 1. the human gate ----------

test('the planner writes DRAFTS — it has no path to publish', () => {
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /VALUES \(\?,'instagram',\?,NULL,\?,'draft'/, 'always draft, never scheduled');
  assert.ok(!/publishImage|media_publish|status='scheduled'/.test(planner), 'the planner cannot publish or self-schedule');
});

test('scheduling is a separate, explicit human action', () => {
  assert.match(API, /if \(op === 'schedule'\)/);
  assert.match(API, /event: 'social\.post_scheduled'/);
});

test('a post with no image cannot be scheduled or published', () => {
  // Otherwise the tick has to decide what to do about it at 11am on a Tuesday, and the only
  // honest answer then is "nothing".
  assert.match(API, /if \(!row\.media_key\) return bad\('Add an image before scheduling it\.'/);
  assert.match(API, /if \(!post\.media_key\) return bad\('This post has no image yet/);
});

test('the tick never even picks up an imageless post', () => {
  // Belt and braces: without this it would churn one through publishing→failed every minute.
  assert.match(TICK, /status='scheduled' AND media_key IS NOT NULL AND scheduled_at IS NOT NULL/);
});

// ---------- 2. it cannot promote what it cannot sell ----------

test('the planner is built from the LIVE menu, availability included', () => {
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /const onSale = bowls\.filter\(\(it\) => isAvailable\(it\) && isOrderable\(it\)\)/);
  assert.match(planner, /Currently SOLD OUT and must not be mentioned/);
});

test('with nothing on sale it writes nothing, rather than cheerful copy about an empty menu', () => {
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /if \(!onSale\.length\)/);
  assert.match(planner, /reason: 'no_bowls_available'/);
});

test('it is told not to invent prices, discounts or claims', () => {
  assert.match(AUTO, /Do not invent menu items, prices, discounts, delivery areas or claims/);
});

test('no AI response means no posts — there is no template fallback', () => {
  // A hand-rolled template post is worse than none: it trains the owner to ignore the queue.
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /if \(!ai \|\| !Array\.isArray\(ai\.data\)\)/);
  assert.match(planner, /reason: env\.ANTHROPIC_API_KEY \? 'no_usable_response' : 'no_api_key'/);
});

test('it tops up to a target instead of piling on every week', () => {
  const planner = AUTO.slice(AUTO.indexOf('async function socialPlan'), AUTO.indexOf('const RUNNERS'));
  assert.match(planner, /const need = Math\.max\(0, WANT - Number\(pending \|\| 0\)\)/);
  assert.match(planner, /if \(!need\)/);
});

// ---------- 3. late is wrong ----------

test('a post that comes due too late goes back to draft instead of out', () => {
  assert.match(TICK, /const GRACE_MS = 2 \* 60 \* 60 \* 1000/);
  assert.match(TICK, /if \(late > GRACE_MS\)/);
  assert.match(TICK, /UPDATE social_posts SET status='draft', error=\?/);
});

test('the claim still guards against a timer racing a click', () => {
  assert.match(TICK, /UPDATE social_posts SET status='publishing', error=NULL, updated_at=\? WHERE id=\? AND status='scheduled'/);
  assert.match(TICK, /claim\.meta\.changes !== 1\) continue/);
});

test('one post per tick, not a burst', () => {
  // ~20s each, and a burst reads as a bot and burns the daily cap.
  assert.match(TICK, /const PER_TICK = 1/);
});

test('no Instagram token is a SKIP, not a failure every minute', () => {
  assert.match(TICK, /if \(!igConfigured\(env\)\) return json\(\{ ok: true, skipped: 'instagram_not_configured'/);
});

// ---------- wiring ----------

test('both halves are actually scheduled, not just written', () => {
  assert.match(CRON, /'\/api\/hub\/admin\/social-tick'/);
  assert.match(CRON, /'0 14 \* \* 0': \['social_plan'\]/, 'the planner runs weekly');
  assert.match(AUTO, /IMPLEMENTED = \[.*'social_plan'\]/);
  assert.match(AUTO, /social_plan: socialPlan/);
});

test('the tick is not open to the internet', () => {
  assert.match(TICK, /ctEq\(cronKey, env\.CRON_KEY\)/);
  assert.match(TICK, /requireRole\(request, env, \['owner'\]\)/);
});

test('media_key became nullable without losing the rows that had one', () => {
  // SQLite cannot drop NOT NULL, so the table is rebuilt — and the carry-over lists columns
  // explicitly, because a column-order surprise would shuffle a caption into a media key.
  assert.match(MIG, /media_key\s+TEXT,/);
  assert.match(MIG, /INSERT INTO social_posts_new\s*\n\s*\(id, platform, caption, media_key, public_token/);
  assert.ok(!/INSERT INTO social_posts_new SELECT \*/.test(MIG));
});

test('a planner post is marked as one', () => {
  // So an owner's own draft is never treated as disposable, and tone can be reviewed later.
  assert.match(MIG, /source\s+TEXT NOT NULL DEFAULT 'owner'/);
  assert.match(AUTO, /'planner','system'/);
});
