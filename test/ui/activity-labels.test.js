// The activity feed should say who did what, in words.
//
// It rendered the raw event key with the actor's ROLE underneath — three consecutive rows reading
// "user.signed_in / kitchen · 49d ago". That is the database talking to itself: it never says WHO,
// and "recipe_session.ai_assist_used" is not a sentence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { eventLabel, displayName, actorLabel } from '../../functions/_lib/activity_labels.js';
import { onRequestGet as activityGet } from '../../functions/api/hub/owner/activity.js';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';

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


test('Spanish activity labels cover observed operational events without exposing machine keys', () => {
  const events = ['user.signed_in','user.invited','dashboard.viewed','doc.viewed','customer.viewed','shift.clocked_in','shift.clocked_out','eod_report.missed','eod_report.filed','training.completed','order.received','order.prep_started','order.bowl_checked','order.ready','order.canceled','order.refunded','delivery.picked','delivery.en_route','delivery.completed','delivery.failed','recipe_session.started','recipe_session.ai_assist_used','recipe_session.media_added','knowledge.document_indexed','alert.triggered','alert.acknowledged','automation.run','agent_task.completed','message.sent','staff.nudged','push.subscribed','contract.billing_contact_set','team_lead.message','sales.prospect_scored','social.post_scheduled','social.post_drafted','social.post_archived','social.post_published','sales.outreach_drafted','sales.organization_enriched'];
  for (const event of events) {
    const es = eventLabel(event, 'es');
    assert.notEqual(es, eventLabel(event));
    assert.notEqual(es, 'Actividad registrada', event);
    assert.doesNotMatch(es, /[._]/, event);
  }
  assert.equal(eventLabel('future.new_event', 'es'), 'Actividad registrada');
  assert.equal(eventLabel('', 'es'), 'Actividad');
});

test('Spanish actor display preserves real names and labels nonhuman or role fallbacks', () => {
  assert.equal(actorLabel({actor_name:'English',actor_role:'kitchen'}, 'es'), 'English');
  assert.equal(actorLabel({actor_type:'system'}, 'es'), 'Sistema de Añejo');
  assert.equal(actorLabel({actor_type:'ai'}, 'es'), 'IA de Añejo');
  assert.equal(actorLabel({actor_role:'client'}, 'es'), 'Un cliente');
  assert.equal(actorLabel({actor_role:'driver'}, 'es'), 'Conductor');
  assert.equal(actorLabel({actor_role:'future_role'}, 'es'), 'Una persona del equipo');
});


test('real owner activity GET adds reading labels while preserving source rows, filters and authentication', async () => {
  const env = ownerEnv(), at = Date.now();
  env.DB.exec("UPDATE staff SET name='English' WHERE id='stf_owner'");
  await env.DB.prepare('INSERT INTO activity_log(id,event,actor_id,actor_role,actor_type,team,properties,created_at) VALUES(?,?,?,?,?,?,?,?)').bind('act_fixture','user.signed_in','stf_owner','owner','staff','kitchen','{}',at).run();
  const original = env.DB.one('SELECT * FROM activity_log WHERE id=?','act_fixture');
  const request = new Request('https://test.example/api/hub/owner/activity?event=user.signed_in&team=kitchen&limit=1', {headers:{cookie:OWNER_COOKIE}});
  const response = await activityGet({request, env});
  assert.equal(response.status,200);
  const result = await response.json();
  assert.equal(result.items.length,1);
  assert.equal(result.items[0].event,'user.signed_in');
  assert.equal(result.items[0].label,'Signed in');
  assert.equal(result.items[0].label_es,'Inició sesión');
  assert.equal(result.items[0].actor,'English');
  assert.equal(result.items[0].actor_es,'English');
  assert.equal(result.items[0].team,'kitchen');
  assert.equal(result.next_before,at);
  assert.deepEqual(env.DB.one('SELECT * FROM activity_log WHERE id=?','act_fixture'),original);
  const unauthorized = await activityGet({request:new Request('https://test.example/api/hub/owner/activity'),env});
  assert.notEqual(unauthorized.status,200);
});
