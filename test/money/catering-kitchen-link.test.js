// The catering event and the kitchen that has to cook it.
//
// Dayan, 2026-09-25, the day before a paid thirty-guest event, with the kitchen already prepping:
// the owner's dashboard showed no catering anywhere, the owner's KITCHEN screen said "No open
// orders", the production plan was a 12px grey link at the bottom of a long card, seven recipes
// sat at 'draft' with no screen able to finish them, and the customer's own account told her to
// ask her trainer.
//
// Each of those is a join that was never made. These tests pin the joins.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ---------------------------------------------------------------- the owner can see the event

test('the owner KITCHEN screen shows booked events, not only the retail order board', () => {
  // "Orders open" on this page means meal-prep orders. A catering event is not one of them, so an
  // owner reading "No open orders" the day before a paid event was being told something false by
  // omission.
  const src = read('public/hub/owner/kitchen.html');
  assert.match(src, /\/api\/hub\/kitchen\/event/, 'it must ask for the events');
  assert.match(src, /id="events"/, 'and give them somewhere to land');
  assert.match(src, /hub\/kitchen\/event\.html\?id=/, 'each one linking to its production plan');
  assert.match(src, /plan\.gaps|\(plan && plan\.gaps\)/, 'with what is still unresolved on it');
});

test('the owner DASHBOARD carries catering at all', () => {
  // It had twenty-five tiles and not one of them was catering.
  const src = read('public/hub/owner/index.html');
  assert.match(src, /id="event-panel"/, 'a paid event inside the week belongs at the top');
  assert.match(src, /Catering & events/, 'and catering needs a tile like every other part of the business');
  assert.match(src, /\/api\/hub\/kitchen\/event/);
});

test('the production plan is a button, not a 12px line of grey text at the bottom', () => {
  const src = read('public/hub/owner/catering.html');
  const link = src.match(/[^\n]*hub\/kitchen\/event\.html[^\n]*/g) || [];
  assert.ok(link.length, 'the link still exists');
  assert.ok(link.some((l) => /class="btn/.test(l)), 'and it is a button');
  assert.ok(!link.some((l) => /class="row-sub lnk"/.test(l)),
    'never the small-print style used for raw payment URLs');
});

// ---------------------------------------------------------------- the drafts can be finished

test('a recipe can be edited from the kitchen, which was impossible before', async () => {
  // Studio could create a recipe and /publish could publish one. Between those two points nothing
  // could change a recipe at all, which is why seven catering recipes were still drafts on the
  // morning they were being cooked.
  const mod = await import('../../functions/api/hub/kitchen/recipe/draft.js');
  assert.equal(typeof mod.onRequestGet, 'function');
  assert.equal(typeof mod.onRequestPost, 'function');
});

test('ingredients are read the way a cook actually types them', async () => {
  const { ingredientsFrom } = await import('../../functions/api/hub/kitchen/recipe/draft.js');
  assert.deepEqual(ingredientsFrom('3 cups — garlic, mashed to a paste'),
    [{ qty: '3 cups', item: 'garlic, mashed to a paste' }], 'the dash form the screen shows');
  assert.deepEqual(ingredientsFrom('30 lb Bone-in pork shoulder'),
    [{ qty: '30 lb', item: 'Bone-in pork shoulder' }], 'and the form typed in a hurry');
  assert.deepEqual(ingredientsFrom('½ cup — Dried oregano'),
    [{ qty: '½ cup', item: 'Dried oregano' }], 'fractions survive');
  assert.deepEqual(ingredientsFrom('Salt to taste'), [{ qty: '', item: 'Salt to taste' }],
    'a line with no quantity is kept, not dropped');
  assert.deepEqual(ingredientsFrom('\n\n  \n'), [], 'blank lines are not ingredients');
  assert.deepEqual(ingredientsFrom([{ item: 'Yuca', qty: '20 lb' }]), [{ item: 'Yuca', qty: '20 lb' }],
    'and structured input passes through');
});

test('steps keep their order and drop their blanks', async () => {
  const { lines } = await import('../../functions/api/hub/kitchen/recipe/draft.js');
  assert.deepEqual(lines('Boil.\n\nDrain.\n  Rest 10 min.  ', 60), ['Boil.', 'Drain.', 'Rest 10 min.']);
  assert.equal(lines(Array.from({ length: 99 }, (_, i) => 'step ' + i), 60).length, 60, 'and are bounded');
});

test('the editor edits the MASTER recipe and says so', () => {
  // The catering recipes are written for 45 portions; the plan scales them to the event. If the
  // screen let the kitchen save the SCALED amounts back, the master would be silently rewritten to
  // one event's guest count and every later event would be wrong.
  const page = read('public/hub/kitchen/event.html');
  assert.match(page, /baseNote:/, 'the screen carries the warning');
  assert.match(page, /MASTER recipe/i);
  const api = read('functions/api/hub/kitchen/recipe/draft.js');
  assert.match(api, /BASE RECIPE/i, 'and the endpoint states the same rule where it is true');
});

test('confirming a recipe saves the edits first', () => {
  // Otherwise "Confirm" publishes the version the cook has just corrected away from.
  const page = read('public/hub/kitchen/event.html');
  const block = page.slice(page.indexOf('rx-confirm'));
  const save = block.indexOf('recipe/draft');
  const publish = block.indexOf('recipe/publish');
  assert.ok(save >= 0 && publish >= 0, 'both calls are there');
  assert.ok(save < publish, 'and the save happens before the publish');
});

// ---------------------------------------------------------------- her account is hers

test('a catering customer is never told to ask her trainer', () => {
  // Karina paid $485 in full, opened "View my account" from her payment confirmation, and was told
  // "No plan is linked to karinajuan2702@gmail.com yet. Ask your trainer to add you."
  for (const p of ['public/client/index.html', 'public/client/dashboard.html']) {
    const src = read(p);
    const trainer = src.indexOf('Ask your trainer to add you');
    assert.equal(trainer, -1, `${p} must not tell a paying catering customer to find a trainer`);
    // The interim card became a full account view in client-catering.js; what this test is
    // actually about is that her events reach the page at all.
    assert.match(src, /AnejoCatering\.render/, `${p} must render her events`);
  }
});

test('her events are read by the verified session email, never a supplied one', () => {
  const src = read('functions/api/client/me.js');
  assert.match(src, /FROM catering_quotes/, 'the account looks at catering at all');
  assert.match(src, /LOWER\(TRIM\(customer_email\)\) = \?/, 'matched on the customer email');
  assert.match(src, /\.bind\(String\(sess\.email\)/, 'and that email comes from the session, not the request');

  // Both exits carry it: the one for somebody who has only catering, and the one for a meal-plan
  // client who also books an event.
  const returns = src.match(/return json\(\{ authenticated: true[^\n]*/g) || [];
  assert.equal(returns.filter((r) => /catering/.test(r)).length, 2,
    'both populated responses must include her events');
});

test('a voided quote is not somebody’s event', () => {
  const src = read('functions/api/client/me.js');
  assert.match(src, /deposit_status != 'void'/);
});
