// STANDING RULE (Dayan, 2026-06-23): training is a LIVING part of the product. Whenever a HUB
// feature is built or changed, the matching role module in training.html AND the quick card in
// training-card.html are updated in the SAME work, in EN + ES for the staff roles.
//
// The rule was written down and then broken the first busy day: seven owner-facing features
// shipped before anyone noticed the tutorials still described the old HUB. Stale training is worse
// than none — staff confidently do it the old way, and the training is also how food-safety and
// brand standards propagate.
//
// So the rule is a TEST now, not a note. Each entry below is a shipped capability an owner or a
// staff member has to be told about; adding a feature without a line here is the thing this file
// exists to make impossible to forget.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MODULES = readFileSync(new URL('../../public/hub/training.html', import.meta.url), 'utf8');
const CARD = readFileSync(new URL('../../public/hub/training-card.html', import.meta.url), 'utf8');

// Shipped feature → a phrase the OWNER module must contain.
const OWNER_MODULE = {
  'onboarding a contract account': /Onboard a new account/,
  'adding a second location': /Add a location/,
  'editing every contract term': /k:'Changing terms'/,
  'pausing a location': /Accepting head counts/,
  'the announcement QUEUE': /a slot holds a QUEUE/,
  'announcement scheduling states': /queued behind another/,
  'editing the legal pages': /k:'Legal pages'/,
  'Ask the HUB': /k:'Ask the HUB'/,
  'QuickBooks': /k:'QuickBooks'/,
  'signed-out vs a quiet day': /A blank HUB means signed out/,
  'bar vs pop-up placement': /k:'Bar or pop-up'/,
};

for (const [feature, re] of Object.entries(OWNER_MODULE)) {
  test(`the owner module teaches: ${feature}`, () => {
    assert.match(MODULES, re, `training.html must cover "${feature}" — see the standing rule at the top of this file`);
  });
}

test('the owner quick card carries the new day-to-day actions', () => {
  for (const re of [/Onboard a new account/, /Edit terms/, /Site copy/, /Ask the HUB/]) {
    assert.match(CARD, re);
  }
});

test('every role is warned that an empty screen may mean signed out', () => {
  // This one is not an owner nicety: a cook prepping to a blank board, or a driver assuming there
  // is no work, is a real operational failure caused purely by a lapsed session.
  for (const role of ['kitchen', 'driver', 'vendor']) {
    const start = MODULES.indexOf(`  ${role}: [`);
    const end = MODULES.indexOf('\n  ],', start);
    const block = MODULES.slice(start, end === -1 ? undefined : end);
    assert.match(block, /signed out/i, `${role} module must warn about a lapsed session`);
  }
  assert.match(CARD, /signed in/i, 'and the printed cards must say it too');
});

test('the staff additions are bilingual, not English bolted onto a Spanish module', () => {
  // Staff modules are EN/ES throughout; a step with no t2/z2 renders English text to a Spanish
  // reader, which is the exact defect the language work existed to fix.
  for (const role of ['kitchen', 'driver', 'vendor']) {
    const start = MODULES.indexOf(`  ${role}: [`);
    const end = MODULES.indexOf('\n  ],', start);
    const block = MODULES.slice(start, end === -1 ? undefined : end);
    const steps = block.split('S({').slice(1);
    for (const [i, s] of steps.entries()) {
      assert.ok(/t2:/.test(s) && /z2:/.test(s), `${role} step ${i + 1} is missing its Spanish`);
    }
  }
});

test('the owner card keeps its Spanish column in step with English', () => {
  // The card renders both; an EN bullet with no ES counterpart prints a half-translated card.
  const owner = CARD.slice(CARD.indexOf('owner:{'), CARD.indexOf('kitchen:{'));
  const en = (owner.match(/steps:\{en:\[([\s\S]*?)\],\s*\n?\s*es:/) || [])[1] || '';
  const es = (owner.match(/es:\[([\s\S]*?)\]\}/) || [])[1] || '';
  const count = (s) => (s.match(/','/g) || []).length;
  assert.equal(count(en), count(es), 'the EN and ES step lists must be the same length');
});
