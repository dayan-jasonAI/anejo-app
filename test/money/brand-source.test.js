// ONE brand source (functions/_lib/brand_source.js) for every AI surface that reasons about the
// brand: the Team Lead, the content planner, and the Brand Auditor. Before this file existed the
// Lead and the auditor each carried their own inline copy of "prefer D1, fall back to the
// compiled snapshot, strip unapproved Studio proposals" — the same logic, three chances to drift.
//
// These tests exercise loadBrand()/withoutProposals() directly, decoupled from any one caller, so
// a regression here is caught regardless of which surface's own test suite happens to run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBrand, withoutProposals } from '../../functions/_lib/brand_source.js';
import { BRAND_CONTEXT } from '../../functions/_lib/brand_context.js';

const SRC = readFileSync(new URL('../../functions/_lib/brand_source.js', import.meta.url), 'utf8');

function stubDb(docsRows = []) {
  return {
    prepare(sql) {
      return {
        bind() { return this; },
        async all() { return /FROM docs/.test(sql) ? { results: docsRows } : { results: [] }; },
        async first() { return null; },
        async run() { return { meta: { changes: 1 } }; },
      };
    },
  };
}

test('with a live brand doc in D1, loadBrand prefers it and reports source d1', async () => {
  const db = stubDb([{ title: 'Brand & Standards Brief', body: 'Live brief the owner approved in the HUB.' }]);
  const r = await loadBrand({ DB: db });
  assert.equal(r.source, 'd1');
  assert.match(r.text, /Live brief the owner approved/);
});

test('with no D1 doc at all (or no DB binding), the compiled snapshot is the floor — never an empty brief', async () => {
  const r1 = await loadBrand({ DB: stubDb([]) });
  assert.equal(r1.source, 'repo');
  assert.equal(r1.text, BRAND_CONTEXT);

  // No env.DB whatsoever (fresh install, or a caller that forgot to bind it) — must degrade the
  // same way, never throw.
  const r2 = await loadBrand({});
  assert.equal(r2.source, 'repo');
  assert.equal(r2.text, BRAND_CONTEXT);
});

test('an unapproved Studio proposal is stripped, but the ratified sections on both sides of it survive', () => {
  const body = [
    '## 11. Brand voice',
    'Warm, direct, never clinical.',
    '',
    '## Proposed Studio Brief Change / Cambio propuesto desde Studio',
    '',
    '### Precios oficiales',
    'LIGERO $21.99 · RAÍZ $20.99 · CONGREEN $22.99',
    '',
    '## 12. Non-negotiables',
    'Standard bowls are 16 oz.',
  ].join('\n');
  const cleaned = withoutProposals(body);
  assert.doesNotMatch(cleaned, /Proposed Studio Brief Change/);
  assert.doesNotMatch(cleaned, /21\.99/, 'the unapproved price is gone with its heading');
  assert.doesNotMatch(cleaned, /Precios oficiales/, 'and so are its own subsections');
  assert.match(cleaned, /Warm, direct, never clinical/, 'the section before the proposal stands');
  assert.match(cleaned, /Standard bowls are 16 oz/, 'the section after it comes straight back');
});

test('withoutProposals is a no-op when there is no proposal block at all', () => {
  const body = '## 1. Who we are\nAñejo Catering Co.\n\n## 2. Vision\nSee above.';
  assert.equal(withoutProposals(body), body.trim());
});

test('loadBrand strips proposals from the LIVE D1 read too, end to end', async () => {
  const db = stubDb([{ title: 'Brand & Standards Brief', body: [
    '## 11. Brand voice',
    'Warm, direct, never clinical.',
    '',
    '## Proposed Studio Brief Change',
    'LIGERO $21.99',
  ].join('\n') }]);
  const r = await loadBrand({ DB: db });
  assert.equal(r.source, 'd1');
  assert.doesNotMatch(r.text, /Proposed Studio Brief Change/);
  assert.doesNotMatch(r.text, /21\.99/);
  assert.match(r.text, /Warm, direct, never clinical/);
});

test('maxChars is the caller\'s own budget, and defaults sanely when omitted', async () => {
  const longBody = 'x'.repeat(50000);
  const db = stubDb([{ title: 'Long Brief', body: longBody }]);
  const capped = await loadBrand({ DB: db }, { maxChars: 100 });
  assert.ok(capped.text.length <= 200, 'the title/heading wrapper adds a little, but the body is capped');
  assert.equal(capped.source, 'd1');

  // No maxChars passed at all — must not throw, and must still return SOMETHING sane.
  const defaulted = await loadBrand({ DB: db });
  assert.equal(defaulted.source, 'd1');
  assert.ok(defaulted.text.length > 0);
});

test('a D1 read failure (missing/un-migrated docs table) degrades to the compiled snapshot, never throws', async () => {
  const throwingDb = { prepare() { throw new Error('no such table: docs'); } };
  const r = await loadBrand({ DB: throwingDb });
  assert.equal(r.source, 'repo');
  assert.equal(r.text, BRAND_CONTEXT);
});

test('every caller imports the SHARED module — no private copy left behind anywhere', () => {
  for (const [path, label] of [
    ['../../functions/_lib/team_lead.js', 'team_lead.js'],
    ['../../functions/_lib/automations.js', 'automations.js'],
    ['../../functions/_lib/governance.js', 'governance.js'],
  ]) {
    const src = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.match(src, /from '\.\/brand_source\.js'/, `${label} must import the shared loader`);
    assert.ok(!/function withoutProposals/.test(src), `${label} must not keep a private withoutProposals`);
    assert.ok(!/^async function loadBrand/m.test(src), `${label} must not keep a private loadBrand`);
  }
});

test('brand_source.js\'s query filters on doc_type only — no visibility gate that could hide a live doc from an internal AI surface', () => {
  assert.match(SRC, /WHERE active = 1 AND doc_type = 'brand'/);
  assert.ok(!/visibleToKitchen|role_scope\s*\)/.test(SRC), 'every caller here is an internal AI surface, not a staff-facing view');
});
