// Marketing settings HUB page — four owner-gated JSON APIs (social cadence, posting times,
// image provider order, intel) previously reachable only with curl. The whole point of this
// page is honesty: it must never claim Stories are being posted, never claim a "market" intel
// brief exists when nothing produces one, and never misreport a provider's API-key availability
// — configured, unconfigured and unknown must stay three distinct states. These tests pin those
// claims as literal strings so a future edit cannot quietly soften them into a fabricated default.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PAGE = readFileSync(new URL('../../public/hub/owner/marketing-settings.html', import.meta.url), 'utf8');
const INDEX = readFileSync(new URL('../../public/hub/owner/index.html', import.meta.url), 'utf8');

test('is private (noindex) like every other owner HUB page', () => {
  assert.match(PAGE, /<meta\s+name="robots"\s+content="noindex">/);
});

test('follows the shared HUB shell: hub.css, hub.js, owner.js, Owner.init', () => {
  assert.match(PAGE, /<link rel="stylesheet" href="\/hub\/assets\/hub\.css">/);
  assert.match(PAGE, /<script src="\/hub\/assets\/hub\.js"><\/script>/);
  assert.match(PAGE, /<script src="\/hub\/owner\/assets\/owner\.js"><\/script>/);
  assert.match(PAGE, /Owner\.init\('marketing-settings'/);
  assert.match(PAGE, /id="owner-nav"/, 'shares the bottom nav shell');
});

test('is reachable from the owner overview via a tile', () => {
  assert.match(INDEX, /href:\s*'\/hub\/owner\/marketing-settings\.html'/);
});

test('Stories cadence is labeled recorded-but-not-automated, never as if Stories post today', () => {
  assert.match(PAGE, /Recorded, not automated\./);
  assert.match(PAGE, /nothing in the product drafts or posts a Story today/);
  assert.doesNotMatch(PAGE, /Stories are (currently |)being posted/i);
});

test('the "market" intel kind is honestly empty — no sweep produces it, and the page says so', () => {
  assert.match(PAGE, /nothing in the product currently generates a "market" brief/);
});

// The gap this used to pin (the endpoint not reporting availability) is now CLOSED: the route
// maps each provider through providerAvailable(). What must stay pinned is the honesty of the
// three states — configured, not configured, and genuinely unknown must all render differently.
// Collapsing "unknown" into "fine" is the regression that would put us back where we started:
// a provider that never runs, looking exactly like one that does.
test('an unconfigured image provider is labelled, never silently ranked as if it worked', () => {
  assert.match(PAGE, /no API key/);
  assert.match(PAGE, /skipped on every call/);
});

test('unknown availability renders as unknown, not as available', () => {
  assert.match(PAGE, /av === false/);
  assert.match(PAGE, /av === null \|\| av === undefined/);
  assert.match(PAGE, /Owner\.badge\('unknown'/);
});

test('the page tolerates the older bare-string providers shape without rendering objects', () => {
  // A cached page from before the endpoint grew `available` must degrade to "unknown", not
  // print [object Object] where a provider name belongs.
  assert.match(PAGE, /\(p && typeof p === 'object'\) \? p : \{ name: p, available: null \}/);
});

test('posting-time save reloads from GET rather than trusting the client-typed value', () => {
  // The server silently clamps/reverts invalid hours (posting_times.js cleanSlots) — the UI
  // must show what was actually persisted, not an optimistic echo of what was typed.
  assert.match(PAGE, /loadTimes\(\);\s*\}\s*else/s);
});

test('every write goes through Hub.api / Owner.get, never a bespoke fetch', () => {
  const bodyOnly = PAGE.slice(PAGE.indexOf('<script>\n(function () {'));
  assert.doesNotMatch(bodyOnly, /\bfetch\(/, 'must reuse the shared session-aware client, not roll its own fetch');
});
