import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { readStudioInventory, buildStudioInventoryContext } from '../../functions/_lib/studio_inventory.js';
import { buildStudioSystem } from '../../functions/_lib/studio_context.js';

const requirements = [
  { inventory_id: 'inv_tuna', basis: 'on_hand', kind: 'ingredient', per_unit: 1, unit: 'lb' },
  { inventory_id: 'inv_pack', basis: 'count_quantity', kind: 'packaging', per_unit: 1, unit: null },
];
async function setup() {
  const env = ownerEnv(), at = Date.now(), db = env.DB;
  db.exec("INSERT INTO inventory_items(id,name,unit,on_hand,active,created_at,updated_at) VALUES ('inv_tuna','Tuna','lb',8,1,1,1),('inv_pack','Bowl packaging','ea',0,1,1,1)");
  await db.prepare('UPDATE inventory_items SET counted_at=?').bind(at).run();
  db.exec("UPDATE inventory_items SET count_quantity=6 WHERE id='inv_pack'");
  await db.prepare("INSERT INTO recipes(id,name,status,created_at,updated_at) VALUES ('rcp_test','Reviewed tuna recipe','published',?,?)").bind(at, at).run();
  await db.prepare("UPDATE menu_items SET stock_count=2,stock_counted_at=?,active=1 WHERE id='vida'").bind(at).run();
  await db.prepare("INSERT INTO inventory_production_policies(menu_item_id,recipe_id,recipe_updated_at,requirements_json,target_count,min_batch,max_batch,stock_max_age_hours,reviewed_by,reviewed_at) VALUES ('vida','rcp_test',?,?,10,1,5,24,'stf_owner',?)").bind(at, JSON.stringify(requirements), at).run();
  return { env, db, at };
}

test('Studio reads saved stock and deterministic reviewed batch suggestions without writes', async () => {
  const { env, db, at } = await setup();
  db.calls.length = 0;
  const snapshot = await readStudioInventory(env);
  assert.equal(snapshot.inventory_status, 'available');
  assert.equal(snapshot.production_status, 'available');
  const tuna = snapshot.inventory.find(item => item.id === 'inv_tuna');
  assert.equal(tuna.on_hand.quantity, 8);
  assert.equal(tuna.on_hand.counted_at, at);
  assert.equal(tuna.count_quantity.status, 'unknown');
  assert.equal(tuna.count_quantity.quantity, null);
  assert.equal(snapshot.production_suggestions[0].suggested_qty, 5);
  assert.equal(snapshot.production_suggestions[0].plan_enabled, false);
  assert.equal(snapshot.finished_items.find(item => item.id === 'vida').remaining_from_recorded_count, 2);
  assert.ok(db.calls.every(call => call.kind === 'all' && /^SELECT/.test(call.sql)));
  assert.equal(db.one('SELECT COUNT(*) n FROM inventory_production_tasks').n, 0);
});

test('approved photo never turns uncounted default stock into known usable quantity', async () => {
  const { env, db, at } = await setup();
  await db.prepare("UPDATE inventory_items SET counted_at=NULL,photo_status='approved',photo_reviewed_at=? WHERE id='inv_tuna'").bind(at).run();
  const snapshot = await readStudioInventory(env);
  const tuna = snapshot.inventory.find(item => item.id === 'inv_tuna');
  assert.equal(tuna.photo_status, 'approved');
  assert.equal(tuna.photo_reviewed_at, at);
  assert.equal(tuna.on_hand.quantity, null);
  assert.equal(tuna.on_hand.status, 'unknown');
  const suggestion = snapshot.production_suggestions[0];
  assert.equal(suggestion.eligible, false);
  assert.equal(suggestion.suggested_qty, null);
  assert.ok(suggestion.reasons.some(reason => /Fresh count needed: Tuna/.test(reason)));
});

test('stale, future, expired and changed recipe records block precise batch suggestions', async () => {
  for (const update of [
    "UPDATE inventory_items SET counted_at=1 WHERE id='inv_tuna'",
    `UPDATE inventory_items SET counted_at=${Date.now() + 86400000} WHERE id='inv_tuna'`,
    "UPDATE inventory_items SET expires_on='2000-01-01' WHERE id='inv_tuna'",
    "UPDATE recipes SET updated_at=updated_at+1 WHERE id='rcp_test'",
    "UPDATE menu_items SET stock_count=NULL WHERE id='vida'",
  ]) {
    const { env, db } = await setup();
    db.exec(update);
    const snapshot = await readStudioInventory(env);
    assert.equal(snapshot.production_suggestions[0].eligible, false, update);
    assert.equal(snapshot.production_suggestions[0].suggested_qty, null, update);
    assert.ok(snapshot.production_suggestions[0].reasons.length);
  }
});

test('open production is a reservation and makes same-item suggestion ineligible', async () => {
  const { env, db, at } = await setup();
  await db.prepare("INSERT INTO inventory_production_tasks(id,menu_item_id,recipe_id,policy_revision,recipe_updated_at,qty,requirements_json,stock_snapshot_json,status,created_by,created_at,updated_at) VALUES ('task_test','vida','rcp_test',1,?,3,?,'[]','queued','stf_owner',?,?)").bind(at, JSON.stringify(requirements), at, at).run();
  const snapshot = await readStudioInventory(env);
  assert.equal(snapshot.open_tasks[0].status, 'queued');
  assert.equal(snapshot.production_suggestions[0].suggested_qty, null);
  assert.ok(snapshot.production_suggestions[0].reasons.some(reason => /already reserves/.test(reason)));
  assert.equal(snapshot.finished_items.find(item => item.id === 'vida').count.quantity, 2);
});

test('known zero remains zero, while future and prior-day finished counts cannot imply sellable remaining', async () => {
  const { env, db, at } = await setup();
  db.exec("UPDATE inventory_items SET on_hand=0 WHERE id='inv_tuna'");
  let snapshot = await readStudioInventory(env);
  assert.equal(snapshot.inventory.find(item => item.id === 'inv_tuna').on_hand.quantity, 0);
  assert.equal(snapshot.production_suggestions[0].suggested_qty, null);
  await db.prepare("UPDATE inventory_items SET counted_at=? WHERE id='inv_tuna'").bind(at + 86400000).run();
  await db.prepare("UPDATE menu_items SET stock_counted_at=? WHERE id='vida'").bind(at - 86400000).run();
  snapshot = await readStudioInventory(env);
  const count = snapshot.inventory.find(item => item.id === 'inv_tuna').on_hand;
  assert.equal(count.status, 'invalid_future_count');
  assert.equal(count.quantity, null);
  assert.equal(count.age_hours, null);
  const finished = snapshot.finished_items.find(item => item.id === 'vida');
  assert.equal(finished.counted_today, false);
  assert.equal(finished.remaining_from_recorded_count, null);
});

test('unavailable production does not erase readable inventory or invent capacity', async () => {
  const { env, db } = await setup();
  const prepare = db.prepare;
  db.prepare = sql => {
    if (sql.includes('inventory_production_policies')) throw Error('table missing');
    return prepare(sql);
  };
  const snapshot = await readStudioInventory(env);
  assert.equal(snapshot.inventory_status, 'available');
  assert.equal(snapshot.production_status, 'unavailable');
  assert.deepEqual(snapshot.production_suggestions, []);
  const unavailable = await readStudioInventory({});
  assert.equal(unavailable.inventory_status, 'unavailable');
  assert.equal(unavailable.production_status, 'unavailable');
});

test('payload is bounded valid JSON, reports partial stock, and excludes costs/staff/private policy fields', async () => {
  const { env, db } = await setup();
  const name = 'x'.repeat(1000);
  for (let i = 0; i < 35; i++) await db.prepare('INSERT INTO inventory_items(id,name,unit,on_hand,active,created_at,updated_at) VALUES (?,?,?,1,1,1,1)').bind('extra_' + i, name, 'ea').run();
  const context = await buildStudioInventoryContext(env);
  const snapshot = JSON.parse(context.slice(context.indexOf('{')));
  assert.ok(JSON.stringify(snapshot).length <= 18000);
  assert.ok(snapshot.inventory.length <= 20);
  assert.equal(snapshot.omitted.inventory_more, true);
  assert.doesNotMatch(context, /unit_cost_cents|photo_key|assigned_staff_id|reviewed_by|requirements_json/);
  assert.match(context, /no inventory\/production write or approval tool/);
  assert.match(context, /Do not sum suggestions sharing ingredients/);
});

test('shared Studio prompt builder includes counts and snapshot safeguards', async () => {
  const { env } = await setup();
  const system = await buildStudioSystem(env);
  assert.match(system, /INVENTORY & PRODUCTION SNAPSHOT/);
  assert.match(system, /"name":"Tuna"/);
  assert.match(system, /"suggested_qty":5/);
  assert.match(system, /Photos, including owner-approved photos, do not establish quantity/);
});
