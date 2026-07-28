// The activity feed should say who did what, in words.
//
// It rendered the raw event key with the actor's ROLE underneath — three consecutive rows reading
// "user.signed_in / kitchen · 49d ago". That is the database talking to itself: it never says WHO,
// and "recipe_session.ai_assist_used" is not a sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventLabel, displayName, actorLabel } from '../../functions/_lib/activity_labels.js';

test('names render as first name + last initial', () => {
  assert.equal(displayName('Jorge Avila'), 'Jorge A.');
  assert.equal(displayName('Vitian Perez'), 'Vitian P.');
  assert.equal(displayName('Arianne Plasencia'), 'Arianne P.');
});

test('a middle name does not break the initial', () => {
  assert.equal(displayName('Maria Del Carmen Vega'), 'Maria V.', 'initial comes from the LAST name');
});

test('a single name is left alone', () => {
  assert.equal(displayName('Liuvys'), 'Liuvys');
});

test('a missing name never renders as blank or "undefined"', () => {
  assert.equal(displayName(''), 'Someone');
  assert.equal(displayName(null), 'Someone');
  assert.equal(displayName('  '), 'Someone');
  assert.equal(displayName(undefined, 'Añejo system'), 'Añejo system');
});

test('untidy input is normalized', () => {
  assert.equal(displayName('  jorge   avila  '), 'jorge a.'.replace('a.', 'A.'));
});

test('known events read as plain sentences', () => {
  assert.equal(eventLabel('user.signed_in'), 'Signed in');
  assert.equal(eventLabel('shift.clocked_out'), 'Clocked out');
  assert.equal(eventLabel('eod_report.missed'), 'Missed an end-of-day report');
  assert.equal(eventLabel('recipe_session.ai_assist_used'), 'Asked the Studio AI for help');
});

test('an unmapped event is humanized, never shown raw or hidden', () => {
  // A new event type must still be readable without someone remembering to add it here.
  const out = eventLabel('recipe_session.brief_generated');
  assert.ok(!out.includes('_'), 'no snake_case leaks through');
  assert.ok(/^[A-Z]/.test(out), 'sentence-cased');
  assert.equal(eventLabel(''), 'Activity', 'never empty');
  assert.equal(eventLabel(null), 'Activity');
});

test('non-human actors are named, not left blank', () => {
  assert.equal(actorLabel({ actor_type: 'system' }), 'Añejo system');
  assert.equal(actorLabel({ actor_type: 'ai' }), 'Añejo AI');
  assert.equal(actorLabel({ actor_role: 'client' }), 'A customer');
  assert.equal(actorLabel({}), 'Someone');
});

test('a real person outranks their role', () => {
  // The old feed showed "kitchen" for everyone on the kitchen team, identifying nobody.
  assert.equal(actorLabel({ actor_name: 'Jorge Avila', actor_role: 'kitchen' }), 'Jorge A.');
});
