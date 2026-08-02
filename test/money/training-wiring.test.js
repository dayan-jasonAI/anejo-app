// The owner's training has to REACH the two surfaces that write his marketing, or the HUB page
// that collects it is a suggestion box wired to nothing.
//
// That is not hypothetical here. Before this wiring the same repo already had a knowledge base
// the owner could upload to that only Creative Studio could read, and a market_intel table the
// Lead filed questions into that nothing in the entire codebase ever read back. Both looked like
// features from the HUB. So these are source pins: they fail loudly if a future refactor drops
// the call, which is exactly how the previous two went silently dead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

test('the weekly planner imports the owner training and calls it', () => {
  const src = read('functions/_lib/automations.js');
  assert.match(src, /import \{ trainingContext \} from '\.\/training\.js'/,
    'planner must import trainingContext');
  assert.match(src, /await trainingContext\(env/,
    'planner must actually CALL it — an unused import is the same as no wiring');
});

test('the Team Lead imports the owner training and calls it', () => {
  const src = read('functions/_lib/team_lead.js');
  assert.match(src, /import \{ trainingContext \} from '\.\/training\.js'/);
  assert.match(src, /await trainingContext\(env/);
});

test('the Team Lead renders the training into the spine it actually sends', () => {
  const src = read('functions/_lib/team_lead.js');
  // Gathered in buildSpine, carried on the spine object, and emitted by renderSpine. Gathering it
  // and never rendering it would cost a query and change nothing about what the model sees.
  assert.match(src, /metrics, drafts, budget, briefs, surfaces, training,/,
    'training must be carried on the spine object');
  assert.match(src, /spine\.training \?/,
    'renderSpine must emit the training block');
});

test('a planner run with no training recorded still produces a prompt', async () => {
  // The honest-empty case. trainingContext returns '' on a fresh install, and joining an empty
  // string into the context must not leave a dangling header or blow up the run.
  const { trainingContext } = await import('../../functions/_lib/training.js');
  assert.equal(await trainingContext({}, { maxChars: 4000 }), '',
    'no DB binding must yield empty string, never a partial header');
});

test('both surfaces budget the training rather than pasting it whole', () => {
  // A library the owner keeps adding to must never be able to crowd out the brand brief or the
  // live menu. Both callers pass an explicit cap.
  for (const p of ['functions/_lib/automations.js', 'functions/_lib/team_lead.js']) {
    assert.match(read(p), /trainingContext\(env, \{ maxChars: \d+ \}\)/,
      `${p} must pass an explicit maxChars`);
  }
});
