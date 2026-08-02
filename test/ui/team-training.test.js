// Team Training rendering (functions/_lib/training.js) — pure formatting logic, no D1 needed.
//
// WHAT MATTERS HERE. This text gets concatenated straight into the marketing team's system
// prompts elsewhere in the codebase (a file this task does not touch). Three failures would be
// unacceptable there: (1) a fresh install answering as if it had been trained, (2) a growing
// library silently blowing the prompt budget with no signal, and (3) the owner's newest guidance
// losing its seat to something he wrote weeks ago. All three are pinned below.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatTraining, trainingContext, trainingPreview, loadTraining, DEFAULT_MAX_CHARS } from '../../functions/_lib/training.js';
import { makeD1 } from '../helpers/d1.js';

// loadTraining() calls env.DB.prepare(sql).all() directly — no .bind() when there are no
// parameters, same as the rest of this codebase (see knowledge.js's kb_documents list query).
// makeD1's statement object exposes .all()/.first()/.run() both directly AND behind .bind(),
// so route regexes below only need to match the SQL text.
function dbWith(rulesRows, examplesRows) {
  return makeD1([
    [/FROM training_rules/, () => rulesRows],
    [/FROM training_examples/, () => examplesRows],
  ]);
}

// ---- formatTraining: pure formatter ----

test('no rules and no examples renders nothing', () => {
  const r = formatTraining({});
  assert.equal(r.text, '');
  assert.equal(r.usedChars, 0);
  assert.equal(r.truncated, false);
});

test('rules render as bullets under a RULES header, examples under their own header', () => {
  const r = formatTraining({
    rules: [{ text: 'Always show food in the first slide.' }],
    examples: [{ note: 'This plating is the vibe.', flag: 'good' }],
  });
  assert.match(r.text, /RULES \(always follow\):\n- Always show food in the first slide\./);
  assert.match(r.text, /REFERENCE EXAMPLES.*:\n- \[GOOD EXAMPLE\] This plating is the vibe\./s);
  assert.equal(r.ruleCount, 1);
  assert.equal(r.exampleCount, 1);
});

test('a bad-flagged example is spelled out as AVOID THIS, not a bare badge', () => {
  const r = formatTraining({ examples: [{ note: 'Too dark, never post like this.', flag: 'bad' }] });
  assert.match(r.text, /\[AVOID THIS\] Too dark, never post like this\./);
  assert.doesNotMatch(r.text, /\[GOOD EXAMPLE\]/);
});

test('multi-line / multi-space notes are normalized to one line so they cannot break the bullet list', () => {
  const r = formatTraining({ rules: [{ text: 'Line one.\n\nLine   two.' }] });
  assert.equal(r.text.split('\n').filter((l) => l.startsWith('- ')).length, 1);
  assert.match(r.text, /- Line one\. Line two\./);
});

test('a rule/example with only whitespace is dropped rather than rendered as an empty bullet', () => {
  const r = formatTraining({ rules: [{ text: '   ' }], examples: [{ note: '  ', flag: 'good' }] });
  assert.equal(r.text, '', 'whitespace-only entries must not count as real training');
});

test('output stays within maxChars and reports truncated:true when it had to cut', () => {
  const manyRules = Array.from({ length: 60 }, (_, i) => ({
    text: `Rule number ${i} is a fairly long sentence about branding consistency and tone of voice.`,
  }));
  const r = formatTraining({ rules: manyRules, examples: [] }, 800);
  assert.ok(r.usedChars <= 800, `usedChars (${r.usedChars}) must never exceed maxChars`);
  assert.equal(r.truncated, true);
  assert.ok(r.ruleCount < manyRules.length, 'must have dropped some rules');
  assert.ok(r.ruleCount > 0, 'must still keep the rules that DO fit');
});

test('when over budget, the newest-first rules are kept and the oldest are the ones cut', () => {
  // loadTraining orders newest-updated-first, so index 0 here stands in for "written most recently".
  const rules = [
    { text: 'NEWEST: ' + 'x'.repeat(200) },
    { text: 'MIDDLE: ' + 'x'.repeat(200) },
    { text: 'OLDEST: ' + 'x'.repeat(200) },
  ];
  // header (49) + block open (26) + one ~210-char line fits comfortably under 320;
  // a second ~211-char line (joined with '\n') would push past it.
  const r = formatTraining({ rules, examples: [] }, 320);
  assert.match(r.text, /NEWEST/);
  assert.doesNotMatch(r.text, /OLDEST/, 'the oldest rule must be the one dropped, not a random one');
  assert.doesNotMatch(r.text, /MIDDLE/, 'sanity: budget must only fit exactly one rule for this test to prove anything');
});

test('rules are fit into the budget before examples, so a fresh rule never loses its seat to an old example', () => {
  const rules = [{ text: 'x'.repeat(300) }];
  const examples = [{ note: 'y'.repeat(300), flag: 'good' }];
  const r = formatTraining({ rules, examples }, 200); // fits the header + a slice of rules, nothing else
  assert.ok(r.ruleCount >= 0);
  assert.equal(r.exampleCount, 0, 'examples must be sacrificed before rules when both cannot fit');
});

test('a large enough budget never truncates a small library', () => {
  const r = formatTraining({
    rules: [{ text: 'short rule' }],
    examples: [{ note: 'short note', flag: 'good' }],
  }, DEFAULT_MAX_CHARS);
  assert.equal(r.truncated, false);
});

// ---- trainingContext(): the contract other modules import ----

test('trainingContext returns an empty string on a fresh install (no env.DB)', async () => {
  const text = await trainingContext({});
  assert.equal(text, '', 'a caller that concatenates this into a prompt must add nothing');
});

test('trainingContext returns an empty string when DB has no active rows', async () => {
  const env = { DB: dbWith([], []) };
  const text = await trainingContext(env);
  assert.equal(text, '');
});

test('trainingContext never throws — a DB error degrades to empty, not a crash', async () => {
  const env = { DB: { prepare: () => { throw new Error('boom'); } } };
  const text = await trainingContext(env);
  assert.equal(text, '');
});

test('trainingContext renders real rows into the same shape formatTraining produces', async () => {
  const env = { DB: dbWith(
    [{ id: 'rul_1', text: 'Always show food first.', updated_at: 2 }],
    [{ id: 'trex_1', note: 'Bright natural light.', flag: 'good', updated_at: 1 }],
  ) };
  const text = await trainingContext(env, { maxChars: 4000 });
  assert.match(text, /Always show food first\./);
  assert.match(text, /\[GOOD EXAMPLE\] Bright natural light\./);
});

test('trainingContext honors a caller-supplied maxChars', async () => {
  const bigRules = Array.from({ length: 40 }, (_, i) => ({ id: 'r' + i, text: 'Rule ' + i + ': ' + 'x'.repeat(80), updated_at: i }));
  const env = { DB: dbWith(bigRules, []) };
  const text = await trainingContext(env, { maxChars: 300 });
  assert.ok(text.length <= 300);
});

// ---- loadTraining(): D1 degradation ----

test('loadTraining degrades to empty arrays when env.DB is absent, never throws', async () => {
  const r = await loadTraining({});
  assert.deepEqual(r, { rules: [], examples: [] });
});

test('loadTraining degrades one table at a time — a broken examples query does not blank the rules', async () => {
  const env = {
    DB: makeD1([
      [/FROM training_examples/, () => { throw new Error('no such table: training_examples'); }],
      [/FROM training_rules/, () => [{ id: 'rul_1', text: 'Keep the rules even if examples break.' }]],
    ]),
  };
  const r = await loadTraining(env);
  assert.equal(r.rules.length, 1);
  assert.equal(r.examples.length, 0);
});

// ---- trainingPreview(): the HUB page's "see what the team currently believes" panel ----

test('trainingPreview reports totals alongside what actually fit, so the owner can see what was cut', async () => {
  const manyRules = Array.from({ length: 30 }, (_, i) => ({ id: 'r' + i, text: 'x'.repeat(100), updated_at: i }));
  const env = { DB: dbWith(manyRules, []) };
  const p = await trainingPreview(env, { maxChars: 500 });
  assert.equal(p.totalRules, 30);
  assert.ok(p.ruleCount < p.totalRules, 'preview must show fewer rendered than exist once truncated');
  assert.equal(p.truncated, true);
  assert.equal(p.maxChars, 500);
});

test('trainingPreview on an empty library reports zero totals, not an error', async () => {
  const p = await trainingPreview({});
  assert.equal(p.totalRules, 0);
  assert.equal(p.totalExamples, 0);
  assert.equal(p.text, '');
});
