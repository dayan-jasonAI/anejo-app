// The fixed bottom nav must never sit on top of content.
//
// It did: body's padding-bottom was EXACTLY --nav-h, so the last row of every HUB page ended flush
// against the bar — cut off in practice and awkward to tap. And the driver's route action sheet was
// pinned at a hard `bottom:16px`, which put the buttons a driver taps at every stop UNDERNEATH the
// nav entirely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../public/hub/assets/hub.css', import.meta.url), 'utf8');
const ROUTE = readFileSync(new URL('../../public/hub/driver/route.html', import.meta.url), 'utf8');

const varPx = (name) => {
  const m = CSS.match(new RegExp('--' + name + ':\\s*(\\d+)px'));
  assert.ok(m, `--${name} must be defined`);
  return parseInt(m[1], 10);
};

test('content clears the nav with real breathing room, not flush against it', () => {
  const nav = varPx('nav-h');
  const gap = varPx('nav-gap');
  assert.ok(gap >= 16, `--nav-gap is ${gap}px; anything less reads as touching the bar`);

  // There is more than one `body` rule (a height reset comes first), so take the one that actually
  // declares the padding rather than the first match.
  const rules = [...CSS.matchAll(/\bbody\s*\{[\s\S]*?\}/g)].map((m) => m[0]);
  const bodyRule = rules.find((r) => r.includes('padding-bottom'));
  assert.ok(bodyRule, 'a body rule must pad for the nav');
  const decl = bodyRule.split('\n').find((l) => l.includes('padding-bottom'));
  assert.ok(decl, 'padding-bottom declaration present');
  assert.ok(decl.includes('--nav-h'), 'padding tracks the nav height');
  assert.ok(decl.includes('--nav-gap'), 'and adds clearance — this is the bug that was fixed');
  assert.ok(decl.includes('safe-area-inset-bottom'), 'and the iOS home indicator');
});

test('there is a shared offset for anything a page pins to the bottom', () => {
  assert.ok(/\.hub-above-nav\s*\{[^}]*bottom:\s*calc\([^)]*--nav-h/.test(CSS.replace(/\n/g, ' ')),
    '.hub-above-nav must derive from --nav-h so it cannot drift when the nav resizes');
});

test('the driver action sheet sits above the nav, not under it', () => {
  const sheet = ROUTE.match(/<div id="sheet"[^>]*>/);
  assert.ok(sheet, 'the sheet exists');
  assert.ok(/hub-above-nav/.test(sheet[0]), 'uses the shared offset');
  assert.ok(!/bottom:\s*\d+px/.test(sheet[0]),
    'no hard-coded bottom — that is what put the delivery buttons behind the nav');
});

test('the nav height and its padding stay in sync', () => {
  // Both the bar's height and the body padding read --nav-h, so changing it moves them together.
  const navRule = CSS.match(/\.hub-nav\s*\{[\s\S]*?\}/)[0];
  assert.ok(navRule.includes('--nav-h'), 'nav height is derived, not literal');
  assert.ok(navRule.includes('safe-area-inset-bottom'));
});
