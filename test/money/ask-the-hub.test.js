// The open-ended question box in AI Ops.
//
// Scope discipline first: AI Ops is a fixed suggestion queue (restock / route / payroll) that WORKS
// and is already a human-in-the-loop approval flow. This adds the one thing it could not do — an
// open question — WITHOUT building a second approval path. A proposed action goes into the SAME
// `suggestions` table the queue already renders.
//
// The dangerous failure here is not a wrong sentence, it is a confident wrong NUMBER about the
// owner's own business. So the figures are computed by deterministic SQL, the model answers only
// from that sheet, and the sheet is handed back to the caller so the answer can be checked against
// its source rather than believed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const API = readFileSync(new URL('../../functions/api/hub/owner/ask.js', import.meta.url), 'utf8');
const PAGE = readFileSync(new URL('../../public/hub/owner/aiops.html', import.meta.url), 'utf8');
const SUG = readFileSync(new URL('../../functions/api/hub/owner/suggestions.js', import.meta.url), 'utf8');

test('owner-only', () => {
  assert.match(API, /requireRole\(request, env, \['owner'\]\)/);
});

test('the model gets FACTS, never a query it can run', () => {
  // Read-only by construction: it cannot reach the database, only the sheet assembled here.
  assert.match(API, /async function factSheet/);
  assert.match(API, /FACT SHEET:/);
  assert.ok(!/request\.json\(\)[\s\S]*prepare\(.*\$\{/.test(API), 'no interpolated SQL anywhere near user input');
});

test('every figure comes from SQL in this file, not from the model', () => {
  for (const t of ['orders', 'subscriptions', 'contract_accounts', 'contract_sites', 'contract_orders', 'suggestions', 'agent_runs']) {
    assert.ok(new RegExp(`FROM ${t}\\b`).test(API), `${t} must be read directly`);
  }
});

test('the fact sheet is returned to the owner, not just consumed', () => {
  // An assistant that states a number about your business without showing its source is asking to
  // be believed on trust, and the one time it is wrong costs more than every time it was right.
  assert.match(API, /\n {4}facts,\n/);
  assert.match(PAGE, /function factLines/);
  assert.match(PAGE, /What this answer was based on/);
});

test('the model is told to refuse rather than estimate', () => {
  assert.match(API, /never estimate/);
  assert.match(API, /say plainly which fact is missing and stop/);
});

test('money is stated as cents to the model and converted for the owner', () => {
  // The whole codebase is integer cents; a model shown 600 and left to guess says $600.
  assert.match(API, /INTEGER CENTS/);
  assert.match(PAGE, /function money\(c\)/);
});

test('one failing table degrades one line, not the whole sheet', () => {
  assert.match(API, /catch \{ return null; \}/);
  assert.match(API, /catch \{ return \[\]; \}/);
});

test('a missing API key is reported as configuration, with the live numbers still returned', () => {
  // "Unavailable" with nothing in it would be a worse answer than the figures alone.
  assert.match(API, /res\.unavailable/);
  assert.match(API, /The figures above are live/);
  assert.match(API, /answer: null, facts/);
});

test('an empty question is refused before any spend', () => {
  assert.match(API, /if \(!question\) return bad\('Ask a question first\.'\)/);
});

test('the question is length-capped', () => {
  assert.match(API, /MAX_Q = 400/);
  assert.match(API, /slice\(0, MAX_Q\)/);
});

test('a proposed action is FILED into the existing queue, not a new one', () => {
  // Reusing the accept/dismiss flow is the entire point.
  assert.match(API, /INSERT INTO suggestions/);
  assert.match(API, /'owner_ask'/);
  assert.match(API, /'pending'/);
});

test('a failed queue write does not lose the answer', () => {
  assert.match(API, /catch \{ suggestion_id = null; \}/);
});

test('the existing accept path already tolerates the new type', () => {
  // It must not fall through into route/restock execution.
  assert.match(SUG, /forward-compatible: accept with no side effect/);
});

test('the desk does NOT imply the HUB will carry the action out', () => {
  // Every other suggestion type executes something on accept. This one has no executor, and
  // labelling it "Accept" beside a route that really does get created would be a lie.
  assert.match(PAGE, /var NO_EXECUTOR = \{ owner_ask: 1, payroll_prep: 1 \}/);
  assert.match(PAGE, /the HUB does not carry this out for you/);
  assert.match(PAGE, /\? 'Noted' : 'Accept'/);
});

test('the box says up front that it cannot change anything', () => {
  assert.match(PAGE, /It cannot change anything/);
});
