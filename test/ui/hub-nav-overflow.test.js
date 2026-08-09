// 2026-08-04 — the owner's bottom nav had 15 destinations crammed into one horizontally-scrolling
// row: "the menu bar in the bottom is covering information in a lot of pages, specially in the
// phone version." Icons and labels collided at desktop width; on a phone the bar was unusable.
//
// Fix: 5 primary destinations stay in the bar (Overview, Deliveries, Kitchen, Marketing, Finance —
// the ones an owner opens daily), everything else moves behind a "More" sheet. Nothing was
// dropped — every one of the original 15 destinations must still resolve to a real href.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const OWNER = readFileSync(new URL('../../public/hub/owner/assets/owner.js', import.meta.url), 'utf8');
const CSS = readFileSync(new URL('../../public/hub/assets/hub.css', import.meta.url), 'utf8');
const HUB_I18N = readFileSync(new URL('../../public/hub/assets/hub-i18n.js', import.meta.url), 'utf8');

// Pull the NAV array's item literals out by hand — owner.js is plain ES5, no bundler/AST here,
// same convention as the other test/ui/*.test.js files in this repo.
const navBlock = OWNER.match(/var NAV = \[([\s\S]*?)\n {2}\];/);
assert.ok(navBlock, 'owner.js must define a NAV array');
const items = [...navBlock[1].matchAll(/\{\s*view:\s*'([\w-]+)',\s*href:\s*'([^']+)'[^}]*?label:\s*'([^']+)'(,\s*primary:\s*true)?\s*\}/g)]
  .map((m) => ({ view: m[1], href: m[2], label: m[3], primary: !!m[4] }));

// 2026-08-09: a 16th destination — the catering deposit desk (/hub/owner/catering.html). It went
// into the More sheet, not the bar: the 5 primary slots are what the owner opens daily and a
// catering quote is a weekly job. The bar itself is unchanged, which is the property this file
// exists to protect.
test('sanity: the NAV literal parses to all 16 destinations', () => {
  assert.equal(items.length, 16, 'a destination was dropped or the parser regex is stale');
});

test('the catering deposit desk is IN the nav — the endpoint had no screen at all before it', () => {
  const catering = items.find((i) => i.view === 'catering');
  assert.ok(catering, 'catering must be a real nav destination, not an orphan page');
  assert.equal(catering.href, '/hub/owner/catering.html');
  assert.equal(catering.primary, false, 'it belongs in More, not in the 5-slot bar');
});

test('exactly 5 primary tabs, matching what the owner opens daily', () => {
  const primary = items.filter((i) => i.primary).map((i) => i.view);
  assert.equal(primary.length, 5, 'the bar must show 5 primary tabs, not more (that was the bug) or fewer');
  assert.deepEqual(primary, ['overview', 'deliveries', 'kitchen', 'finance', 'marketing']);
});

test('every non-primary destination still has a real href — nothing was dropped from the app, only from the bar', () => {
  const overflow = items.filter((i) => !i.primary);
  assert.equal(overflow.length, 11);
  for (const i of overflow) {
    assert.match(i.href, /^\//, `${i.view} must still resolve to a real path`);
  }
});

test('renderNav builds a "More" trigger with sheet semantics, not a plain link', () => {
  assert.match(OWNER, /aria-haspopup="dialog"/);
  assert.match(OWNER, /aria-expanded/);
  assert.match(OWNER, /class="hub-nav-more/);
});

test('the More sheet is a labelled dialog with a working close path (click, Escape, backdrop)', () => {
  assert.match(OWNER, /role="dialog"/);
  assert.match(OWNER, /aria-modal="true"/);
  assert.match(OWNER, /e\.key === 'Escape'/, 'Escape must close the sheet');
  assert.match(OWNER, /e\.target === backdrop/, 'a backdrop tap (not a tap on the sheet itself) must close it');
  assert.match(OWNER, /trigger\.focus\(\)/, 'closing must return focus to the control that opened it (WCAG 2.4.3)');
});

test('the active view is highlighted whether it is a primary tab or inside More', () => {
  assert.match(OWNER, /activeIsOverflow/);
  assert.match(OWNER, /aria-current="page"/);
});

// ---------- style: match the existing design language, meet the 44pt tap-target floor ----------

test('.hub-nav-more shares the same base styling as the primary tab links (one visual family)', () => {
  assert.match(CSS, /\.hub-nav a,\s*\.hub-nav-more\s*\{/);
});

test('nav items and More-sheet rows both declare the 44pt Apple HIG touch-target floor', () => {
  const navRule = CSS.match(/\.hub-nav a, \.hub-nav-more \{[\s\S]*?\}/)[0];
  assert.match(navRule, /min-height:\s*44px/);
  const sheetRowRule = CSS.match(/\.hub-more-sheet \.row \{[\s\S]*?\}/)[0];
  assert.match(sheetRowRule, /min-height:\s*44px/);
});

test('the More sheet respects the iPhone home-indicator safe area', () => {
  const sheetRule = CSS.match(/\.hub-more-sheet\s*\{[\s\S]*?\}/)[0];
  assert.match(sheetRule, /env\(safe-area-inset-bottom/);
});

test('the sheet backdrop renders above the Æ operator FAB (z-index 9998) so the FAB cannot poke through it', () => {
  const backdropRule = CSS.match(/\.hub-more-backdrop\s*\{[\s\S]*?\}/)[0];
  const z = Number(backdropRule.match(/z-index:\s*(\d+)/)[1]);
  assert.ok(z > 9998, `backdrop z-index (${z}) must exceed the FAB's 9998`);
});

test('the sheet respects prefers-reduced-motion', () => {
  assert.match(CSS, /prefers-reduced-motion:\s*reduce\)\s*\{\s*\.hub-more-sheet/);
});

// ---------- bilingual ----------

test('"More" — the one new visible string this change introduces — has a Spanish entry', () => {
  assert.match(HUB_I18N, /"More":\s*"Más"/);
});
