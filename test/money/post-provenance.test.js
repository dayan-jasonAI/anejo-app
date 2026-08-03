// Post provenance (0076): the record of what CAUSED a post — which training rules were in
// force, which brief (if any) directed it, its category, its format. Without this, "reach went
// up" and "I wrote a rule last week" can never be connected.
//
// The one fact this file exists to prove: a post from before this table existed reads as
// UNKNOWN, never as "confirmed zero rules." Those are different claims — an analysis that
// conflates them would credit or blame the training system for posts it never touched.
//
// test/helpers/d1.js's makeD1 is a regex-dispatch stub with no real SQL semantics, so it can't
// prove read-your-own-write behavior across an INSERT...ON CONFLICT upsert. This file's fake DB
// is a small stateful stand-in that implements just the two SQL shapes stampPostProvenance /
// getPostProvenance actually emit, so the merge contract (only supplied columns are written; an
// omitted field is left untouched; an explicit null overwrites) can be exercised for real.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stampPostProvenance, getPostProvenance } from '../../functions/_lib/post_provenance.js';

const MIG = readFileSync(new URL('../../migrations/0076_post_provenance.sql', import.meta.url), 'utf8');

function makeProvenanceDb() {
  const rows = new Map(); // post_id -> stored row

  function upsert(sql, args) {
    const cols = sql.match(/INSERT INTO post_provenance \(([^)]+)\)/)[1].split(',').map((c) => c.trim());
    const postId = args[0];
    const existing = rows.get(postId) || { post_id: postId };
    cols.forEach((col, i) => {
      if (col === 'post_id') return;
      if (col === 'created_at' && existing.created_at != null) return; // never overwritten once set
      existing[col] = args[i];
    });
    rows.set(postId, existing);
    return { success: true, meta: { changes: 1 } };
  }

  function select(args) {
    const row = rows.get(args[0]);
    return row || null;
  }

  return {
    rows,
    prepare(sql) {
      return {
        bind: (...args) => ({
          async run() { return upsert(sql, args); },
          async first() { return select(args); },
        }),
      };
    },
  };
}

test('stamping a fresh post reads back exactly what was stamped', async () => {
  const env = { DB: makeProvenanceDb() };
  const r = await stampPostProvenance(env, {
    postId: 'sp_1', ruleIds: ['rul_1', 'rul_2'], briefId: 'brf_9', category: 'menu', format: 'single', slideCount: 1,
  });
  assert.equal(r.ok, true);

  const p = await getPostProvenance(env, 'sp_1');
  assert.equal(p.recorded, true);
  assert.deepEqual(p.ruleIds, ['rul_1', 'rul_2']);
  assert.equal(p.briefId, 'brf_9');
  assert.equal(p.category, 'menu');
  assert.equal(p.format, 'single');
  assert.equal(p.slideCount, 1);
});

test('a post that was never stamped reads as UNKNOWN — recorded:false, not zero rules', async () => {
  const env = { DB: makeProvenanceDb() };
  const p = await getPostProvenance(env, 'sp_never_stamped');
  assert.equal(p.recorded, false);
  // The unknown case must not accidentally carry an empty-array shape that looks like "confirmed
  // zero rules" — assert there is nothing to read at all, distinct from the next test.
  assert.equal(p.ruleIds, undefined);
});

test('stamping with an explicitly empty rule list is a KNOWN fact, distinct from never stamping', async () => {
  const env = { DB: makeProvenanceDb() };
  await stampPostProvenance(env, { postId: 'sp_2', ruleIds: [], briefId: null, category: 'promo' });
  const p = await getPostProvenance(env, 'sp_2');
  assert.equal(p.recorded, true, 'the row exists — this post has provenance recorded');
  assert.deepEqual(p.ruleIds, [], 'zero rules were active — a real, known fact');
  assert.equal(p.briefId, null, 'no brief directed it — also a known fact, because the row exists');
});

test('a later partial stamp fills in format without erasing rules/brief recorded earlier', async () => {
  const env = { DB: makeProvenanceDb() };
  await stampPostProvenance(env, { postId: 'sp_3', ruleIds: ['rul_5'], briefId: 'brf_1', category: 'catering' });
  // Format is decided later — once Creative Studio actually builds the carousel.
  await stampPostProvenance(env, { postId: 'sp_3', format: 'carousel', slideCount: 4 });

  const p = await getPostProvenance(env, 'sp_3');
  assert.deepEqual(p.ruleIds, ['rul_5'], 'the second call must not blank out the first call\'s rule ids');
  assert.equal(p.briefId, 'brf_1');
  assert.equal(p.category, 'catering');
  assert.equal(p.format, 'carousel');
  assert.equal(p.slideCount, 4);
});

test('an explicit null overwrites a previously known field, distinguishing it from omitting the field', async () => {
  const env = { DB: makeProvenanceDb() };
  await stampPostProvenance(env, { postId: 'sp_4', briefId: 'brf_1', category: 'menu' });
  // Omitting category leaves it as-is; explicitly nulling briefId clears it to "confirmed none".
  await stampPostProvenance(env, { postId: 'sp_4', briefId: null });
  const p = await getPostProvenance(env, 'sp_4');
  assert.equal(p.briefId, null, 'explicit null must overwrite the earlier value');
  assert.equal(p.category, 'menu', 'category was not touched by the second call and must survive');
});

test('an unrecognized format value is stored as null rather than garbage', async () => {
  const env = { DB: makeProvenanceDb() };
  await stampPostProvenance(env, { postId: 'sp_5', format: 'square' });
  const p = await getPostProvenance(env, 'sp_5');
  assert.equal(p.format, null);
});

test('stampPostProvenance never throws — missing postId, no DB, or a DB error all degrade to {ok:false}', async () => {
  assert.deepEqual(await stampPostProvenance({ DB: {} }, {}), { ok: false, reason: 'missing_args' });
  assert.deepEqual(await stampPostProvenance(null, { postId: 'x' }), { ok: false, reason: 'missing_args' });
  const throwingEnv = { DB: { prepare() { throw new Error('db is down'); } } };
  const r = await stampPostProvenance(throwingEnv, { postId: 'sp_6', category: 'menu' });
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'db_error');
});

test('getPostProvenance never throws — no DB or a query failure both degrade to recorded:false', async () => {
  assert.deepEqual(await getPostProvenance(null, 'sp_1'), { recorded: false });
  const throwingEnv = { DB: { prepare() { throw new Error('down'); } } };
  assert.deepEqual(await getPostProvenance(throwingEnv, 'sp_1'), { recorded: false });
});

test('migration: row presence is the unknown/known signal, and rule_ids is a nullable JSON column', () => {
  assert.match(MIG, /CREATE TABLE IF NOT EXISTS post_provenance/);
  assert.match(MIG, /post_id\s+TEXT PRIMARY KEY REFERENCES social_posts\(id\)/);
  assert.match(MIG, /rule_ids\s+TEXT/);
  assert.match(MIG, /format\s+TEXT CHECK \(format IS NULL OR format IN \('single', 'carousel'\)\)/);
});
