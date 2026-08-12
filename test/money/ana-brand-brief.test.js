// Aña reads the brand brief — the last agent that did not.
//
// Team Lead, the planner and the Brand Auditor all read the owner's brief through
// brand_source.js; the Studio reads it through its own loader. Aña did not, and she is the only
// one that speaks to a customer unattended. Her voice came from hand-written prose that was a
// second, drifting copy of §11: the owner could change the voice in the HUB and every surface
// moved except the one the customer actually hears.
//
// These tests pin the wiring, the SLICE (she gets the five sections that constrain her, not the
// plating geometry), and the two properties that make it safe to put a long document in front of
// a short-answer agent: live prices still win, and she never loses her voice to a D1 hiccup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { anaSystemPrompt, anaBrand, ANA_BRAND_BUDGET } from '../../functions/_lib/ana_social.js';
import { onlySections, loadBrand, CUSTOMER_FACING_SECTIONS } from '../../functions/_lib/brand_source.js';

const ANA = readFileSync(new URL('../../functions/_lib/ana_social.js', import.meta.url), 'utf8');
const CHAT = readFileSync(new URL('../../functions/api/chat.js', import.meta.url), 'utf8');

// A brief shaped like the live one: the sections she needs, and the ones she must not be charged
// tokens for.
const BRIEF = [
  '## 1. Who we are',
  'A Mediterranean-Cuban longevity bowl service in Palm Beach County.',
  '',
  '## 4. The Golden Rule',
  'Every bowl is 40% protein / 30% carbs / 30% fat.',
  '',
  '## 6. Menu',
  'LIGERO — $21.99. STALE PRICE PROSE THAT MUST NOT REACH HER.',
  '',
  '## 8. Allergens & dietary rules',
  'Allergen discipline is non-negotiable. Never claim a bowl is safe for an allergy.',
  '',
  '## 10. Plating & presentation',
  'Microgreens at the twelve-o-clock position, PLATING GEOMETRY she cannot use.',
  '',
  '## 11. Brand voice',
  'Warm, unhurried, never pushy. Never say "cultivate stillness" to a customer.',
  '',
  '## 12. Non-negotiables',
  'Standard a la carte bowls are 16 oz.',
  '',
  '## Proposed Studio Brief Change / Cambio propuesto desde Studio',
  'UNAPPROVED — pending the owner.',
].join('\n');

// loadMenu always returns all four maps; menuSection() reads bowls/nonBowls on the degraded path,
// so a bare { items: [] } is not a menu this code ever sees.
const MENU = { items: [{ id: 'ligero', kind: 'bowl', name: 'LIGERO', price_cents: 1999, active: 1 }], bowls: {}, nonBowls: {}, modifiers: {} };

const stubDb = (results) => ({
  prepare: () => ({
    bind: () => ({ all: async () => ({ results }), first: async () => results[0] ?? null }),
    all: async () => ({ results }),
    first: async () => results[0] ?? null,
  }),
});
const envWith = (body) => ({ DB: stubDb([{ title: 'Brand & Standards Brief', body }]) });

test('she gets the five sections that constrain her — and is not charged for the rest', () => {
  const slice = onlySections(BRIEF, CUSTOMER_FACING_SECTIONS);
  assert.match(slice, /Mediterranean-Cuban longevity/, '§1 who we are');
  assert.match(slice, /40% protein/, '§4 the Golden Rule');
  assert.match(slice, /Allergen discipline is non-negotiable/, '§8 allergens');
  assert.match(slice, /Warm, unhurried, never pushy/, '§11 voice');
  assert.match(slice, /16 oz/, '§12 non-negotiables');

  assert.doesNotMatch(slice, /PLATING GEOMETRY/, '§10 is not something a 400-char DM can use');
  assert.doesNotMatch(slice, /STALE PRICE PROSE/, '§6 is excluded — live menu_items is the price authority');
  assert.doesNotMatch(slice, /UNAPPROVED/, 'and an unnumbered proposal can never match a numbered selector');
});

test('a renumbered brief gives her the WHOLE document, never an empty one', async () => {
  // The failure that matters: someone renumbers the brief, the selector matches nothing, and a
  // customer-facing agent quietly loses its allergen rules. Falling back to everything is the only
  // safe direction to fail in.
  const renumbered = '## A. Who we are\nStill the brand.\n\n## B. Allergens\nStill the rules.';
  const b = await loadBrand(envWith(renumbered), { maxChars: 8000, sections: CUSTOMER_FACING_SECTIONS });
  assert.match(b.text, /Still the rules/, 'the allergen rules must survive a renumbering');
  assert.equal(b.source, 'd1');
});

test('with no brand doc at all she still gets the compiled brief, sliced the same way', async () => {
  const b = await loadBrand({ DB: stubDb([]) }, { maxChars: ANA_BRAND_BUDGET, sections: CUSTOMER_FACING_SECTIONS });
  assert.equal(b.source, 'repo');
  assert.match(b.text, /Allergen discipline is non-negotiable/, '§8 survives in the snapshot too');
  assert.ok(b.text.length <= ANA_BRAND_BUDGET, 'and the floor respects her budget');
});

test('the standards reach the prompt, under a heading that says who owns them', async () => {
  const brand = await anaBrand(envWith(BRIEF));
  const prompt = anaSystemPrompt(MENU, brand);
  assert.match(prompt, /AÑEJO BRAND STANDARDS/, 'the block is present');
  assert.match(prompt, /Dayan maintains in the HUB/, 'and names its authority, so she does not treat it as her own opinion');
  assert.match(prompt, /Allergen discipline is non-negotiable/);
});

test('live prices outrank the brief, in words, inside the prompt', async () => {
  // The one way adding a long document could make her WORSE: quoting a price out of prose that
  // lags the menu. The instruction has to be in the prompt, not just in our heads.
  const prompt = anaSystemPrompt(MENU, await anaBrand(envWith(BRIEF)));
  assert.match(prompt, /PRICES AND AVAILABILITY EARLIER IN THIS PROMPT WIN/);
  assert.match(prompt, /still 2–5 sentences/, 'and a long brief must not turn a DM into an essay');
});

test('no brief means the prompt she has always had — not a broken one', () => {
  const bare = anaSystemPrompt(MENU);
  assert.doesNotMatch(bare, /AÑEJO BRAND STANDARDS/, 'no empty scaffolding when there is nothing to put in it');
  assert.match(bare, /You are "Aña"/, 'and she is still herself');
  assert.equal(anaSystemPrompt(MENU, '   '), bare, 'whitespace is not a brief');
});

test('a D1 outage drops her to the compiled brief, not to no brief', async () => {
  // Written expecting '' and corrected to match the code, which is the better behaviour: rows()
  // swallows the throw, no D1 row is found, and loadBrand returns the deploy-time snapshot. An
  // outage costs her the owner's LATEST wording; it never costs her the allergen rules entirely.
  const broken = { DB: { prepare() { throw new Error('D1 down'); } } };
  const brand = await anaBrand(broken);
  assert.match(brand, /Allergen discipline is non-negotiable/, 'the floor still holds');
  assert.ok(brand.length <= ANA_BRAND_BUDGET, 'and is still sliced to her budget');
  assert.doesNotThrow(() => anaSystemPrompt(MENU, brand));
});

test('BOTH her mouths load it — one loader, or they drift again', () => {
  assert.match(ANA, /const brand = await anaBrand\(env\)/, 'the Instagram drafter');
  assert.match(ANA, /anaSystemPrompt\(menu, brand\)/, 'and passes it');
  assert.match(CHAT, /anaBrand/, 'the website chat imports the same loader');
  assert.match(CHAT, /anaSystemPrompt\(menu, brand\)/, 'and passes it too');
});

test('her budget is a fraction of the full brief — she answers in 400 characters', () => {
  assert.ok(ANA_BRAND_BUDGET <= 8000, 'the whole 25k document would be 3.8x the tokens for context she cannot use');
  assert.ok(ANA_BRAND_BUDGET >= 6701, 'but must clear the five sections measured against the live doc');
});
