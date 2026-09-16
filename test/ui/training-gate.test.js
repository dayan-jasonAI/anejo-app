// The surfaces of the training-update feature that are static assets, and so cannot be driven
// through a handler: the sign-in gate in the shared boot path, its curated Spanish, and the
// "What's new" section on the training page and printed card.
//
// STANDING RULE (see test/ui/training-current.test.js): training is a living part of the product, and
// every staff-facing string is EN + curated ES. A gate that stops a Spanish-reading cook and then
// talks to her in English is worse than no gate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HUB_JS = readFileSync(new URL('../../public/hub/assets/hub.js', import.meta.url), 'utf8');
const I18N = readFileSync(new URL('../../public/hub/assets/hub-i18n.js', import.meta.url), 'utf8');
const TRAINING = readFileSync(new URL('../../public/hub/training.html', import.meta.url), 'utf8');
const CARD = readFileSync(new URL('../../public/hub/training-card.html', import.meta.url), 'utf8');
const KITCHEN = readFileSync(new URL('../../public/hub/kitchen/index.html', import.meta.url), 'utf8');
const KITCHEN_JS = readFileSync(new URL('../../public/hub/kitchen/kitchen.js', import.meta.url), 'utf8');

test('the gate lives in the SHARED boot path, so it covers every role page and not just the kitchen', () => {
  assert.match(HUB_JS, /Hub\.trainingGate = function/, 'hub.js owns the gate');
  assert.match(HUB_JS, /function autoMount\(\)[\s\S]{0,200}Hub\.trainingGate\(\)/, 'and boot actually calls it');
  assert.match(HUB_JS, /\/api\/hub\/training\/status/, 'it asks the server, not a cached flag');
});

test('the kitchen board is covered by it — the page the cook actually lands on', () => {
  // kitchen/index.html loads hub.js, and Kitchen.boot() runs Hub.boot() — both halves of the path the
  // gate rides on. Neither is obvious from hub.js alone, and losing either silently un-gates her.
  assert.match(KITCHEN, /<script src="\/hub\/assets\/hub\.js"><\/script>/);
  assert.match(KITCHEN_JS, /Hub\.boot\(/);
  assert.match(KITCHEN, /<script src="\/hub\/kitchen\/kitchen\.js"><\/script>/);
});

test('the gate cannot be dismissed past, and its one control goes to the training', () => {
  const start = HUB_JS.indexOf('Hub.showTrainingGate = function');
  const end = HUB_JS.indexOf('// ---------- tracking ----------', start);
  const gate = HUB_JS.slice(start, end);
  assert.ok(start > -1 && end > start, 'the gate renderer is where this test thinks it is');
  assert.match(gate, /alertdialog/);
  assert.match(gate, /aria-modal/);
  assert.match(gate, /'\/hub\/training\?role='/, 'the only action opens their training');
  // Comments stripped: the prose explains why there is no "later", and would match the check itself.
  const code = gate.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /Later|Dismiss|Not now|Skip/i, 'no escape hatch — the owner asked for the training first');
});

test('the gate runs once, at page load, so it cannot eat half-finished work', () => {
  const start = HUB_JS.indexOf('Hub.trainingGate = function');
  const gate = HUB_JS.slice(start, HUB_JS.indexOf('Hub.showTrainingGate = function'));
  assert.match(gate, /Hub\._trainingGated/, 'guarded by a once-only flag');
  assert.doesNotMatch(gate, /setInterval|setTimeout/, 'never on a timer — a poll could fire mid-prep');
  assert.match(gate, /\/hub\/training'\) === 0\) return/, 'and it never blocks the training page it sends you to');
});

test('every string the gate puts on screen has curated Spanish', () => {
  for (const s of ['Training update', 'Something changed in how you work. Complete this training first.', 'Open my training']) {
    assert.ok(HUB_JS.includes(s), `the gate renders "${s}"`);
    assert.ok(I18N.includes(JSON.stringify(s)) || I18N.includes(`"${s}":`), `hub-i18n.js must translate "${s}"`);
  }
  assert.match(I18N, /"Training update": "Actualización de capacitación"/);
  assert.match(I18N, /"Open my training": "Abrir mi capacitación"/);
});

test('the training page shows "What\'s new" ABOVE the module, in both languages', () => {
  // Order matters: a cook sent here by the gate must meet the change before the walkthrough she has
  // already sat through once.
  const stage = TRAINING.indexOf('<div class="stage"');
  assert.ok(TRAINING.indexOf('id="whatsnew"') > stage, 'the block is inside the stage');
  assert.ok(TRAINING.indexOf('id="whatsnew"') < TRAINING.indexOf('class="modhead"'), 'and above the module head');
  assert.match(TRAINING, /whatsnew:\{en:"What's new",es:'Lo nuevo'\}/);
  assert.match(TRAINING, /wnRead:\{en:'Read this first[\s\S]*?es:'Lee esto primero/);
  assert.match(TRAINING, /module_update/, 'the bullets come from the server, not a second copy of the procedure');
});

test('the printed kitchen card carries the change too, EN and ES', () => {
  const kitchen = CARD.slice(CARD.indexOf('  kitchen:{'), CARD.indexOf('  driver:{'));
  assert.match(kitchen, /whatsnew:\{/, 'the kitchen card leads with what changed');
  assert.match(kitchen, /two photos are now required/);
  assert.match(kitchen, /se requieren dos fotos/);
  assert.match(kitchen, /envase cerrado y empacado/);
  assert.match(CARD, /whatsnew:\{en:"What's new",es:'Lo nuevo'\}/);
});

test('the owner view distinguishes the three states on screen, not just in the payload', () => {
  const OWNER = readFileSync(new URL('../../public/hub/owner/training-status.html', import.meta.url), 'utf8');
  assert.match(OWNER, /Never trained/);
  assert.match(OWNER, /Out of date/);
  assert.match(OWNER, /Up to date/);
  assert.match(OWNER, /i\.state === 'current'/, 'badged off the state, not off "has a completed_at"');
  assert.match(OWNER, /update_headline/, 'and it says why someone is behind');
});
