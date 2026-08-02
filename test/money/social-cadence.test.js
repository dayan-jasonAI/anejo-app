// Social cadence config (functions/_lib/social_cadence.js): the owner-settable weekly FEED
// target that replaced the flat WANT=5 backlog ceiling. Same three-tier resolution every other
// owner-tunable number in this codebase uses (pay.js getPayConfig, autodispatch.js
// getAutoConfig): KV override -> env var -> hard-coded default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getCadenceConfig, setCadenceConfig, CADENCE_DEFAULTS } from '../../functions/_lib/social_cadence.js';
import { makeKV } from '../helpers/d1.js';

const LIB = readFileSync(new URL('../../functions/_lib/social_cadence.js', import.meta.url), 'utf8');

test('defaults land inside the researched 3-5/week band, and record the owner\'s Stories ask separately', () => {
  assert.equal(CADENCE_DEFAULTS.feed_per_week, 4);
  assert.equal(CADENCE_DEFAULTS.stories_per_day_min, 3);
  assert.equal(CADENCE_DEFAULTS.stories_per_day_max, 6);
});

test('with nothing set, getCadenceConfig resolves to the hard-coded defaults', async () => {
  const env = { SESSIONS: makeKV({}) };
  const cfg = await getCadenceConfig(env);
  assert.deepEqual(cfg, CADENCE_DEFAULTS);
});

test('an env var overrides the default when there is no KV entry', async () => {
  const env = { SESSIONS: makeKV({}), SOCIAL_CADENCE_FEED_PER_WEEK: '5' };
  const cfg = await getCadenceConfig(env);
  assert.equal(cfg.feed_per_week, 5);
  // Untouched fields still fall through to their defaults.
  assert.equal(cfg.stories_per_day_min, CADENCE_DEFAULTS.stories_per_day_min);
});

test('a KV override wins over both the env var and the default — the owner\'s dial is the last word', async () => {
  const env = {
    SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 6 }) }),
    SOCIAL_CADENCE_FEED_PER_WEEK: '5',
  };
  const cfg = await getCadenceConfig(env);
  assert.equal(cfg.feed_per_week, 6);
});

test('feed_per_week=0 is a deliberate pause, not treated as "unset"', async () => {
  const env = { SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 0 }) }) };
  const cfg = await getCadenceConfig(env);
  assert.equal(cfg.feed_per_week, 0);
});

test('a runaway feed_per_week clamps at the sanity ceiling', async () => {
  const env = { SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: 999 }) }) };
  const cfg = await getCadenceConfig(env);
  assert.ok(cfg.feed_per_week <= 14, 'nothing in the research supports twice-daily feed posting');
});

test('a garbage/negative value falls back to the default rather than going negative', async () => {
  const env = { SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ feed_per_week: -3, stories_per_day_min: 'nope' }) }) };
  const cfg = await getCadenceConfig(env);
  assert.equal(cfg.feed_per_week, CADENCE_DEFAULTS.feed_per_week);
  assert.equal(cfg.stories_per_day_min, CADENCE_DEFAULTS.stories_per_day_min);
});

test('a stories max below its own min is widened to match, not left as a 0-width range', async () => {
  const env = { SESSIONS: makeKV({ 'cfg:social_cadence': JSON.stringify({ stories_per_day_min: 6, stories_per_day_max: 3 }) }) };
  const cfg = await getCadenceConfig(env);
  assert.ok(cfg.stories_per_day_max >= cfg.stories_per_day_min);
});

test('setCadenceConfig writes KV and getCadenceConfig reads the write straight back', async () => {
  const env = { SESSIONS: makeKV({}) };
  const r = await setCadenceConfig(env, { feed_per_week: 3 });
  assert.equal(r.ok, true);
  const cfg = await getCadenceConfig(env);
  assert.equal(cfg.feed_per_week, 3);
});

test('setCadenceConfig fails cleanly without a settings store, rather than throwing', async () => {
  const r = await setCadenceConfig({}, { feed_per_week: 3 });
  assert.equal(r.ok, false);
  assert.match(r.error, /settings store/i);
});

test('the module documents WHY feed and Stories are two separate numbers', () => {
  // The owner's literal ask ("3 to 6 posts daily") is right for Stories and wrong for feed —
  // this reasoning has to survive in the code, not just in a PR description.
  assert.match(LIB, /3 to 6 posts daily/);
  assert.match(LIB, /reach PER POST/);
});
