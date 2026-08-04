// Marketing settings HUB page — four owner-gated JSON APIs (social cadence, posting times,
// image provider order, intel) previously reachable only with curl. The whole point of this
// page is honesty: it must never claim Stories are being posted, never claim a "market" intel
// brief exists when nothing produces one, and never claim to know a provider's API-key
// availability when the endpoint behind it does not report that. These tests pin those claims
// as literal strings so a future edit cannot quietly soften them into a fabricated default.
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

test('image provider availability gap is disclosed, not faked', () => {
  assert.match(PAGE, /cannot show whether a provider actually has its API key configured/);
  assert.match(PAGE, /the endpoint behind it does not return that/);
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
