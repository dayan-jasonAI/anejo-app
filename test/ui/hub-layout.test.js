// The fixed bottom nav must never sit on top of content.
//
// It did: body's padding-bottom was EXACTLY --nav-h, so the last row of every HUB page ended flush
// against the bar — cut off in practice and awkward to tap. And the driver's route action sheet was
// pinned at a hard `bottom:16px`, which put the buttons a driver taps at every stop UNDERNEATH the
// nav entirely.
//
// 2026-08-04: the owner reported the bar STILL covering content on the phone even after the fix
// above. Measured live: body's padding-bottom was correct (84px) but three text nodes rendered
// 5-14px INTO the nav anyway. Root cause was a different rule entirely — `html, body { height:
// 100% }` (border-box) gives body a FIXED box; the padding-bottom is carved out of that box. Every
// owner page is taller than one screen, so real content overflows the fixed box, and overflowing
// content ignores a box's own padding — it lands flush against the viewport edge instead of
// clearing it. The fix is `min-height`, which lets the box grow with content (padding included).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../../public/hub/assets/hub.css', import.meta.url), 'utf8');
const ROUTE = readFileSync(new URL('../../public/hub/driver/route.html', import.meta.url), 'utf8');
const OPERATOR = readFileSync(new URL('../../public/hub/owner/assets/operator.js', import.meta.url), 'utf8');

const varPx = (name) => {
  const m = CSS.match(new RegExp('--' + name + ':\\s*(\\d+)px'));
  assert.ok(m, `--${name} must be defined`);
  return parseInt(m[1], 10);
};

test('content clears the nav with real breathing room, not flush against it', () => {
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

test('html/body use min-height, not a fixed height — or padding-bottom stops protecting content', () => {
  // `height: 100%` on a border-box element gives it a FIXED box; content taller than one screen
  // (every owner page) overflows that box, and overflowing content ignores the box's own
  // padding-bottom. min-height lets the box grow with content so the reserved clearance is real
  // no matter how long the page is. This is the regression test for the live 2026-08-04 bug.
  const rootRule = CSS.match(/html,\s*body\s*\{[\s\S]*?\}/);
  assert.ok(rootRule, 'a combined html, body rule must exist');
  assert.ok(/min-height:\s*100%/.test(rootRule[0]), 'must be min-height so content can grow past one screen');
  assert.ok(!/(?<!min-)height:\s*100%/.test(rootRule[0]),
    'a plain `height: 100%` here caps the box and swallows the padding-bottom reservation');
});

// 2026-08-11 — "fix the home bar that's now floating". On the phone the bottom nav detached from
// the bottom of the screen mid-scroll and sat over the middle of the owner's tile grid, with the
// Æ FAB floating by the same offset beside it. Both are `position: fixed`; on iOS a fixed box that
// is not on its own compositor layer is repainted only after the scroll gesture settles, so during
// the gesture it is drawn at its pre-scroll offset. The nav made this worse by ALSO being a
// legacy touch-scroller (`overflow-x:auto` + `-webkit-overflow-scrolling:touch`), which is the
// slowest repositioning path iOS has.
test('the bottom nav is not a scroller — that is what let it float away from the viewport', () => {
  // Match against DECLARATIONS only: the rule carries a comment naming the properties it must
  // never use again, and a raw text search would read that explanation as the violation.
  const navRule = CSS.replace(/\/\*[\s\S]*?\*\//g, '').match(/\.hub-nav\s*\{[\s\S]*?\n\}/)[0];
  assert.ok(!/-webkit-overflow-scrolling/.test(navRule),
    'a fixed bar must never use the legacy touch-scrolling path — it repositions after the gesture, not with it');
  assert.ok(!/overflow(-x|-y)?:\s*(auto|scroll)/.test(navRule),
    'the bar must not scroll; a role that outgrows it puts destinations in the More sheet instead');
});

test('every bottom-pinned chrome element is promoted to its own compositor layer', () => {
  const navRule = CSS.match(/\.hub-nav\s*\{[\s\S]*?\n\}/)[0];
  assert.ok(/translateZ\(0\)|will-change:\s*transform/.test(navRule),
    'the nav must be composited so it tracks the visual viewport during a scroll');
  const fabRule = OPERATOR.match(/\.aop-fab\{[^}]*\}/)[0];
  assert.ok(/will-change:\s*transform/.test(fabRule),
    'the FAB floated by the same offset as the nav and needs the same promotion');
});

test('nav slots divide the bar evenly, so hiding overflow can never clip a destination', () => {
  // With `overflow: hidden` on the bar, content-sized slots (`flex: 1 0 auto` + a min-width) would
  // be silently cut off instead of scrolled into reach. Even shares always fit.
  const itemRule = CSS.match(/\.hub-nav a, \.hub-nav-more \{[\s\S]*?\n\}/)[0];
  assert.match(itemRule, /flex:\s*1 1 0/, 'slots must share the bar width, not be sized to their labels');
  assert.match(itemRule, /min-width:\s*0/, 'a min-width larger than a share reintroduces the overflow');
  // The tap target is now carried by arithmetic rather than a min-width, so pin the arithmetic:
  // the narrowest supported phone, split across the six slots every role renders.
  const NARROWEST = 320, SLOTS = 6;
  assert.ok(NARROWEST / SLOTS >= 44, 'six slots at 320px must still clear the 44pt Apple HIG floor');
  assert.match(itemRule, /min-height:\s*44px/);
});

test('long nav labels ellipsis rather than spilling into the neighbouring slot', () => {
  assert.match(CSS, /\.hub-nav a > span:not\(\.nav-ico\)[\s\S]*?text-overflow:\s*ellipsis/);
});

test('the Æ operator FAB/hint clear the nav by the same margin real content does', () => {
  // The FAB/hint used to hard-code bottom:22px/38px, oblivious to --nav-h — on the owner HUB that
  // put the FAB ON TOP of the nav bar (measured live: fab bottom 1031 vs nav top 993). They must
  // derive from the nav height, not a literal that drifts the moment --nav-h changes.
  const fabRule = OPERATOR.match(/\.aop-fab\{[^}]*\}/);
  assert.ok(fabRule, '.aop-fab rule must exist');
  assert.ok(!/bottom:\s*\d+px/.test(fabRule[0]), 'no literal bottom offset — that is what put it on the nav');
  assert.ok(/bottom:\s*var\(--aop-base/.test(fabRule[0]), 'must derive from the shared nav-clearance base');
  assert.ok(/--nav-h/.test(OPERATOR), 'the shared base must itself reference --nav-h');
});
