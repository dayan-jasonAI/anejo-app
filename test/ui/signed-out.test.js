// A lost session must not look like an empty business.
//
// This is the diagnosis behind "AI Ops shows nothing". agent_runs was NOT empty — production has
// 248 rows and every scheduled job is on time. What happens is that each owner endpoint answers an
// expired session with 401 { error }, with no `ok` field, so every panel's own `if (!d || !d.ok)`
// branch fires and renders its EMPTY state:
//
//   AI Ops     → "No runs yet." · "No forecast yet." · "NEVER RUN" on every scheduled job
//   Contracts  → "No contract accounts yet."
//   Suggestions→ "No pending suggestions."
//
// Nothing anywhere said "sign in". A signed-out owner saw a company with no automations, no
// accounts and no data, all of it false, and no way to tell that from the real thing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const HUB = readFileSync(new URL('../../public/hub/assets/hub.js', import.meta.url), 'utf8');
const ROLES = readFileSync(new URL('../../functions/_lib/roles.js', import.meta.url), 'utf8');

test('a 401 from ANY call raises the signed-out notice', () => {
  assert.match(HUB, /if \(r\.status === 401\) Hub\.sessionLost/,
    'handled centrally in Hub.api, not per panel');
});

test('it is handled once, centrally — not in each panel', () => {
  // ~30 panels across the HUB; the next one added would forget.
  assert.match(HUB, /Hub\.sessionLost = function/);
});

test('eight panels loading at once produce ONE notice', () => {
  assert.match(HUB, /if \(Hub\._signedOut\) return;/, 'guarded against repeats');
});

test('the notice carries the control that fixes it', () => {
  assert.match(HUB, /a\.href = '\/login'/, 'a way back in, not just a complaint');
  assert.match(HUB, /Sign in again/);
});

test('it says the empty panels behind it are FALSE', () => {
  // The whole failure is an owner believing what the page shows. Saying "signed out" alone still
  // leaves "…and also we have no contract accounts?" on the screen unexplained.
  assert.match(HUB, /not because there is nothing there/);
});

test('the notice blocks rather than sits in a corner', () => {
  assert.match(HUB, /position:fixed;inset:0/, 'covers the false empty states');
  assert.match(HUB, /aria-modal/, 'and announces itself to a screen reader');
  assert.match(HUB, /role', 'alertdialog/);
});

test('a WRONG ROLE is not treated as signed out', () => {
  // requireRole separates them: 401 not signed in, 403 wrong role. A kitchen user opening an owner
  // page IS signed in — bouncing them to /login would be a lie and a loop.
  assert.match(ROLES, /'Not signed in\.' \}, 401/);
  assert.match(ROLES, /'Forbidden for this role\.' \}, 403/);
  assert.ok(!/status === 403.*sessionLost/.test(HUB), '403 must not raise the signed-out notice');
});

test('the DOM is built with textContent, never innerHTML', () => {
  // The 401 body is server text; it lands in this card. Same rule as the announcement bar.
  const fn = HUB.slice(HUB.indexOf('Hub.sessionLost = function'), HUB.indexOf('// ---------- session'));
  assert.ok(!/innerHTML/.test(fn), 'no markup path for server-supplied text');
  assert.match(fn, /p\.textContent =/);
});

test('it survives being raised before the body exists', () => {
  // Hub.api can resolve during head-script execution on a slow paint.
  assert.match(HUB, /document\.addEventListener\('DOMContentLoaded', mount\)/);
});
