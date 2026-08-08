// The Creative Studio's brand grounding (functions/_lib/studio_context.js).
//
// The Studio is the last brand reader that kept its own loader rather than calling
// brand_source.js — it has to, because it also carries the role_scope-filtered SOP library that
// loadBrand() deliberately does not model. Keeping its own loader is fine; keeping its own ANSWER
// is not, so these tests pin the two places it must agree with everybody else: the size of the
// brief it accepts, and its refusal to read unapproved proposals as though they were standards.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildBrandContext } from '../../functions/_lib/studio_context.js';

const SRC = readFileSync(new URL('../../functions/_lib/studio_context.js', import.meta.url), 'utf8');

// Minimal D1 stub: one query, one result set.
const stubDb = (results) => ({
  prepare: () => ({ all: async () => ({ results }), first: async () => results[0] ?? null }),
});

test('the brand budget matches every other brand reader — 20000, not a fourth number', () => {
  assert.match(SRC, /const BRAND_BUDGET = 20000;/,
    'Team Lead, planner and Brand Auditor all budget 20000 via brand_source.js; the Studio must not be the odd one out');
});

test('the whole ratified brief fits — §13 is no longer cut in half', async () => {
  // §13 Kitchen production specs is what an 18000 cap severed, on the one surface a chef reads
  // mid-recipe. Body sized like the live doc: ratified content just under the cap.
  const body = '## 1. Who we are\n' + 'x'.repeat(19000) + '\n## 13. Kitchen production specs\nQuinoa base: 4 oz cooked.';
  const ctx = await buildBrandContext({ DB: stubDb([{ doc_type: 'brand', title: 'Brand & Standards Brief', body, role_scope: null }]) });
  assert.match(ctx, /## 13\. Kitchen production specs/, 'the production specs must survive the clamp');
  assert.match(ctx, /Quinoa base: 4 oz cooked\./, 'and survive to their last line, not just their heading');
});

test('an unapproved Studio proposal never reaches the chef as a standard', async () => {
  // brief.js appends these to doc_brand_main pending the owner's approval in the HUB. A raised
  // budget reaches them FIRST — they sit at the end of the document — so the cap growing is
  // exactly when this filter starts earning its keep.
  const body = [
    '## 6. Menu',
    'LIGERO — $19.99. Golden Turmeric chicken, quinoa, roasted sweet potato.',
    '',
    '## Proposed Studio Brief Change / Cambio propuesto desde Studio',
    '',
    'Title / Titulo: Precios oficiales',
    'LIGERO $21.99 — pending owner review',
    '',
    '### Sub-detail inside the proposal',
    'More unapproved pricing.',
  ].join('\n');
  const ctx = await buildBrandContext({ DB: stubDb([{ doc_type: 'brand', title: 'Brand & Standards Brief', body, role_scope: null }]) });
  assert.match(ctx, /LIGERO — \$19\.99/, 'the ratified price stays');
  assert.doesNotMatch(ctx, /\$21\.99/, 'the proposed price must not reach the Studio');
  assert.doesNotMatch(ctx, /Proposed Studio Brief Change/, 'nor the proposal heading');
  assert.doesNotMatch(ctx, /More unapproved pricing/, 'nor its ### subsections, which ride along with it');
});

test('a ratified section AFTER a proposal comes straight back', async () => {
  // Level-2 headings re-open the question, so a proposal cannot swallow the rest of the document.
  const body = [
    '## 6. Menu',
    'COCO — coconut-lime shrimp.',
    '',
    '## Proposed Studio Brief Change / Cambio propuesto desde Studio',
    'Unapproved.',
    '',
    '## 8. Allergens & dietary rules',
    'Allergen discipline is non-negotiable.',
  ].join('\n');
  const ctx = await buildBrandContext({ DB: stubDb([{ doc_type: 'brand', title: 'Brand & Standards Brief', body, role_scope: null }]) });
  assert.match(ctx, /Allergen discipline is non-negotiable\./, '§8 follows the proposal and must survive it');
  assert.doesNotMatch(ctx, /Unapproved\./, 'while the proposal itself does not');
});

test('SOP docs are left alone — proposals are only ever written into the brand doc', async () => {
  // brief.js writes to BRAND_DOC_ID and nothing else. Stripping the heading out of a manual would
  // be silently editing a kitchen document to solve a problem it does not have.
  const ctx = await buildBrandContext({
    DB: stubDb([{ doc_type: 'manual', title: 'Kitchen manual', body: '## Proposed Studio Brief Change\nKeep me — I am a manual, not the brief.', role_scope: null }]),
  });
  assert.match(ctx, /Keep me — I am a manual/, 'the SOP library is not filtered');
});
