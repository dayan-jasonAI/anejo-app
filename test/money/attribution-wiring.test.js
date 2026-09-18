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

test('provenance uses retained sources gathered before inference, not fresh attribution queries', () => {
  const contextAt = planner.indexOf('ruleIds: activeRuleIds, trainingReceipt } = await plannerExtraContext(env)');
  const inferenceAt = planner.indexOf('const ai =', contextAt);
  assert.ok(contextAt > -1 && inferenceAt > contextAt);
  assert.match(planner, /ruleIds = training\.receipt\.rules\.map/);
  assert.match(planner, /briefIds\.has\(selectedBrief\) \? selectedBrief : null/);
  assert.ok(!planner.includes('SELECT id FROM training_rules WHERE active = 1'));
  assert.ok(!planner.includes("SELECT id FROM team_briefs WHERE status != 'archived' ORDER BY created_at DESC LIMIT 1"));
  // Executable source-mutation and truncation coverage: social-planner-context.test.js.
});

test('missing context keeps empty provenance defaults and guarded context reads', () => {
  const context = planner.slice(planner.indexOf('async function plannerExtraContext'), planner.indexOf("import { captureSystem }"));
  assert.match(context, /let ruleIds;/);
  assert.match(context, /const briefIds = new Set\(\)/);
  assert.match(context, /try \{[\s\S]*await trainingContextReceipt[\s\S]*catch/);
  assert.match(context, /try \{[\s\S]*FROM team_briefs[\s\S]*catch/);
});

test('format is recorded only when a photo actually landed — never guessed', () => {
  // The RULE has not changed: never record a format the planner does not know, because a
  // confident "single" pollutes every carousel-vs-single comparison the rollup makes.
  //
  // The FACT it rested on has. This test used to assert a flat `format: undefined, slideCount:
  // undefined` because "the planner attaches no media — slides arrive later from the owner or
  // Studio". Since _lib/food_photo.js, the planner generates a food photo at draft time, so on
  // success the shape IS known and 'single' is a fact rather than a guess. On failure — no
  // provider, weekly AI ceiling reached, non-JPEG — nothing is attached and both stay undefined,
  // which is the honesty the original was protecting.
  const stamp = planner.slice(planner.indexOf('await stampPostProvenance('), planner.indexOf('made.push('));
  assert.match(stamp, /format: photo\.ok \? 'single' : undefined/, 'format must be conditional on a photo having landed');
  assert.match(stamp, /slideCount: photo\.ok \? photo\.slides : undefined/);
  // And the stamp must come AFTER the generation, or it would record the shape from before it.
  assert.ok(planner.indexOf('await ensureFoodPhoto(') < planner.indexOf('await stampPostProvenance('),
    'the photo must be attached before its shape is recorded');
});
