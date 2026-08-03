// The attribution loop only closes if the planner both WRITES the cause and READS the result.
// Either half alone is dead weight: stamping without reading is a table nobody queries, and
// reading without stamping is a report with nothing to report on.
//
// Source-pinned for the same reason the training wiring is. This repo has a track record of
// features that looked live from the HUB and were connected to nothing — the knowledge base was
// Studio-only for months, and market_intel was written by the Intel Bench and read by literally
// no code anywhere. Both looked finished.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const planner = readFileSync(join(root, 'functions/_lib/automations.js'), 'utf8');

test('the planner stamps what produced each post', () => {
  assert.match(planner, /import \{ stampPostProvenance \} from '\.\/post_provenance\.js'/);
  assert.match(planner, /await stampPostProvenance\(env, \{/,
    'an import alone is not wiring — the call must exist');
});

test('the planner reads results back by cause', () => {
  assert.match(planner, /attributionBrief/);
  assert.match(planner, /await attributionBrief\(env\)/);
});

test('rule ids and brief id are read ONCE per run, not per post', () => {
  // Re-querying inside the loop would let the recorded cause drift mid-run if the owner edited a
  // rule while the weekly job was in flight — every post in one batch was written under one set
  // of rules, and the record has to say so.
  const loopAt = planner.indexOf('for (const item of ai.data.slice');
  const rulesAt = planner.indexOf('SELECT id FROM training_rules WHERE active = 1');
  const briefAt = planner.indexOf("SELECT id FROM team_briefs WHERE status != 'archived' ORDER BY created_at DESC LIMIT 1");
  assert.ok(rulesAt > -1 && briefAt > -1, 'both causes must be gathered');
  assert.ok(rulesAt < loopAt, 'active rule ids must be read before the loop');
  assert.ok(briefAt < loopAt, 'the directing brief must be read before the loop');
});

test('attribution can never cost the week its posts', () => {
  // Every attribution read is individually guarded. A missing table (pre-migration deploy window)
  // must leave the planner exactly as capable as it was before any of this existed.
  const guarded = planner.slice(planner.indexOf('let activeRuleIds'), planner.indexOf('const made = []'));
  assert.match(guarded, /catch \{ activeRuleIds = \[\]; \}/);
  assert.match(guarded, /catch \{ directingBriefId = null; \}/);
});

test('format is left UNSET by the planner rather than guessed', () => {
  // The planner attaches no media — slides arrive later from the owner or Studio. Recording
  // "single" here would be a confident answer to a question not yet decided, and it would then
  // pollute every carousel-vs-single comparison the rollup makes.
  assert.match(planner, /format: undefined, slideCount: undefined/);
});
