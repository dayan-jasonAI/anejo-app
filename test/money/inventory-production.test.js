import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestGet, onRequestPost } from '../../functions/api/hub/kitchen/inventory-production.js';
import { etDateOf } from '../../functions/_lib/hub.js';

const KITCHEN_COOKIE = 'anejo_sess=tok-kitchen';
const path = 'https://anejo.test/api/hub/kitchen/inventory-production';
const req = (body, cookie = OWNER_COOKIE) => new Request(path, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const getReq = (cookie = OWNER_COOKIE) => new Request(path, { headers: { Cookie: cookie } });
async function post(env, body, cookie) {
  const response = await onRequestPost({ env, request: req(body, cookie) });
  return { response, body: await response.json() };
}
async function setup({ tuna = 10, packaging = 10, finished = 0, countAt = Date.now(), expiresOn = null } = {}) {
  const env = ownerEnv();
  const db = env.DB;
  const now = Date.now();
  db.exec("INSERT INTO inventory_items(id,name,unit,on_hand,par_level,active,created_at,updated_at) VALUES ('inv_tuna','Tuna','lb',0,0,1,1,1),('inv_pack','Bowl','ea',0,0,1,1,1)");
  await db.prepare('UPDATE inventory_items SET on_hand=?,counted_at=?,expires_on=? WHERE id=?').bind(tuna, countAt, expiresOn, 'inv_tuna').run();
  await db.prepare('UPDATE inventory_items SET count_quantity=?,counted_at=?,expires_on=? WHERE id=?').bind(packaging, countAt, expiresOn, 'inv_pack').run();
  await db.prepare("INSERT INTO recipes(id,name,status,created_at,updated_at) VALUES ('rcp_test','Test recipe','published',?,?)").bind(now, now).run();
  await db.prepare("UPDATE menu_items SET stock_count=?,stock_counted_at=?,active=1 WHERE id IN ('vida','fuego')").bind(finished, now).run();
  return { env, db, now };
}
const requirements = [
  { inventory_id: 'inv_tuna', basis: 'on_hand', kind: 'ingredient', per_unit: 1, unit: 'lb' },
  { inventory_id: 'inv_pack', basis: 'count_quantity', kind: 'packaging', per_unit: 1 },
];
function policy(menu_item_id = 'vida', extra = {}) {
  return { action: 'policy', reviewed: true, menu_item_id, recipe_id: 'rcp_test', requirements, target_count: 10, min_batch: 1, max_batch: 5, stock_max_age_hours: 24, assigned_staff_id: 'stf_k', enabled: true, auto_relist: false, ...extra };
}
async function configure(env, body = policy(), cookie = OWNER_COOKIE) {
  const result = await post(env, body, cookie);
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  return result.body;
}

test('production policy is owner reviewed and requires explicit ingredient plus packaging mapping', async () => {
  const { env, db } = await setup();
  assert.equal((await post(env, policy(), KITCHEN_COOKIE)).response.status, 403, 'kitchen cannot approve a policy');
  assert.equal((await post(env, policy('vida', { reviewed: false }))).response.status, 400, 'review is an explicit gate');
  assert.equal((await post(env, policy('vida', { requirements: [requirements[0]] }))).response.status, 400, 'both kinds are required');
  const saved = await configure(env, policy('vida', { enabled: false }));
  assert.equal(saved.revision, 1);
  const stored = db.one("SELECT * FROM inventory_production_policies WHERE menu_item_id='vida'");
  assert.equal(stored.reviewed_by, 'stf_owner');
  assert.equal(JSON.parse(stored.requirements_json).length, 2);
});

test('owner queue approves one batch for the named disabled reviewed plan without enabling it', async () => {
  const { env, db } = await setup({ tuna: 14, packaging: 14, finished: 0 });
  const now = Date.now();
  await db.prepare("INSERT INTO recipes(id,name,status,created_at,updated_at) VALUES ('rcp_fuego','Fuego recipe','published',?,?)").bind(now, now).run();
  await configure(env, policy('vida', { enabled: false, max_batch: 4 }));
  await configure(env, policy('fuego', { recipe_id: 'rcp_fuego', enabled: false, max_batch: 4 }));
  assert.equal(db.one('SELECT COUNT(*) n FROM inventory_production_tasks').n, 0, 'disabled plans do not auto-queue');

  const kitchen = await post(env, { action: 'queue', menu_item_id: 'vida' }, KITCHEN_COOKIE);
  assert.equal(kitchen.response.status, 403);
  const queued = await post(env, { action: 'queue', menu_item_id: 'vida' }, OWNER_COOKIE);
  assert.equal(queued.response.status, 200, JSON.stringify(queued.body));
  assert.equal(queued.body.created.length, 1);
  assert.equal(queued.body.created[0].qty, 4);
  const tasks = db.rows('SELECT menu_item_id,recipe_id,policy_revision,qty,status FROM inventory_production_tasks');
  assert.deepEqual(tasks.map(task => [task.menu_item_id,task.recipe_id,task.qty,task.status]), [['vida','rcp_test',4,'queued']]);
  assert.equal(db.one("SELECT enabled FROM inventory_production_policies WHERE menu_item_id='vida'").enabled, 0, 'one-off queue does not turn on automation');
  const event = db.one("SELECT actor_id,action,details_json FROM inventory_production_events WHERE task_id=?", queued.body.created[0].id);
  assert.equal(event.actor_id, 'stf_owner');
  assert.equal(event.action, 'queued');
  assert.equal(JSON.parse(event.details_json).recipe_id, 'rcp_test');

  const replay = await post(env, { action: 'queue', menu_item_id: 'vida' }, OWNER_COOKIE);
  assert.equal(replay.response.status, 409);
  assert.equal(db.one('SELECT COUNT(*) n FROM inventory_production_tasks').n, 1, 'replay cannot duplicate the open task');
  assert.equal(db.one("SELECT COUNT(*) n FROM inventory_production_tasks WHERE menu_item_id='fuego'").n, 0, 'one-off approval only targets the named policy');
});

test('fresh counts admit one queued task and live reservations limit another menu item sharing stock', async () => {
  const { env, db } = await setup({ tuna: 8, packaging: 8, finished: 0 });
  await db.prepare("INSERT INTO recipes(id,name,status,created_at,updated_at) VALUES ('rcp_second','Second recipe','published',?,?)").bind(Date.now(), Date.now()).run();
  const first = await configure(env, policy('vida'));
  assert.equal(first.production.created.length, 1);
  assert.equal(first.production.created[0].qty, 5);
  const second = await configure(env, policy('fuego', { recipe_id: 'rcp_second' }));
  const tasks = db.rows("SELECT menu_item_id,qty,status FROM inventory_production_tasks WHERE status IN ('queued','preparing') ORDER BY menu_item_id");
  const diagnostic = await (await onRequestGet({ env, request: getReq() })).json();
  assert.equal(tasks.length, 2, JSON.stringify({ first: first.production, second: second.production, tasks, opportunities: diagnostic.opportunities }));
  assert.deepEqual(tasks.map(x => [x.menu_item_id, x.qty]), [['fuego', 3], ['vida', 5]]);
  assert.equal(second.production.created.length, 1);
  const status = diagnostic;
  assert.ok(status.tasks.length === 2);
});

test('sold through finished stock includes today paid on-demand orders when setting production target', async () => {
  const { env, db } = await setup({ tuna: 20, packaging: 20, finished: 10 });
  const at = Date.now();
  await db.prepare(`INSERT INTO orders(id,items,delivery_date,delivery_window,status,fulfillment_mode,created_at,updated_at)
    VALUES ('ord_sold','[{"id":"vida","qty":8}]',?,'lunch','paid','on_demand',?,?)`).bind(etDateOf(at),at,at).run();
  const saved = await configure(env, policy('vida', { target_count: 10, max_batch: 5 }));
  assert.equal(saved.production.created.length, 1);
  assert.equal(saved.production.created[0].qty, 5, '8 committed orders make the effective deficit 8 even though stored finished stock is 10');
});

test('prior-day finished counts block production until physically recounted today', async () => {
  const { env, db } = await setup();
  await db.prepare("UPDATE menu_items SET stock_counted_at=? WHERE id='vida'").bind(Date.now() - 48 * 60 * 60 * 1000).run();
  await configure(env, policy('vida', { enabled: false }));
  const state = await (await onRequestGet({ env, request: getReq() })).json();
  assert.equal(state.opportunities[0].eligible, false);
  assert.ok(state.opportunities[0].reasons.some(x => /Recount finished portions today/.test(x)));
  assert.equal((await post(env, { action: 'queue', menu_item_id: 'vida' })).response.status, 409);
  assert.equal(db.one('SELECT COUNT(*) n FROM inventory_production_tasks').n, 0);
  await db.prepare("UPDATE menu_items SET stock_counted_at=? WHERE id='vida'").bind(Date.now()).run();
  assert.equal((await post(env, { action: 'queue', menu_item_id: 'vida' })).response.status, 200);
  assert.equal(db.one('SELECT COUNT(*) n FROM inventory_production_tasks').n, 1);
});

test('stale and expired stock, unknown finished count, and a changed recipe block admission', async () => {
  const oldAt = Date.now() - 4 * 60 * 60 * 1000;
  const stale = await setup({ countAt: oldAt });
  await configure(stale.env, policy('vida', { stock_max_age_hours: 1 }));
  let state = await (await onRequestGet({ env: stale.env, request: getReq() })).json();
  assert.equal(state.opportunities[0].eligible, false);
  assert.ok(state.opportunities[0].reasons.some(x => /Fresh count needed/.test(x)));
  assert.equal(stale.db.one('SELECT COUNT(*) n FROM inventory_production_tasks').n, 0);

  const expired = await setup({ expiresOn: '2000-01-01' });
  await configure(expired.env);
  state = await (await onRequestGet({ env: expired.env, request: getReq() })).json();
  assert.equal(state.opportunities[0].eligible, false);
  assert.ok(state.opportunities[0].reasons.some(x => /Past recorded expiry/.test(x)));

  const unknown = await setup({ finished: null });
  await configure(unknown.env);
  state = await (await onRequestGet({ env: unknown.env, request: getReq() })).json();
  assert.equal(state.opportunities[0].eligible, false);
  assert.ok(state.opportunities[0].reasons.some(x => /finished-item count/.test(x)));
  assert.equal(unknown.db.one('SELECT COUNT(*) n FROM inventory_production_tasks').n, 0);

  const changed = await setup();
  await configure(changed.env);
  const task = changed.db.one("SELECT * FROM inventory_production_tasks WHERE menu_item_id='vida'");
  await changed.db.prepare("UPDATE recipes SET updated_at=updated_at+1 WHERE id='rcp_test'").run();
  const start = await post(changed.env, { action: 'start', id: task.id, expected_version: task.version }, KITCHEN_COOKIE);
  assert.equal(start.response.status, 409);
  assert.equal(changed.db.one('SELECT status FROM inventory_production_tasks WHERE id=?', task.id).status, 'queued');
});

test('assignee starts production; completion consumes planned inputs, records actual yield, and cannot be replayed', async () => {
  const { env, db } = await setup({ tuna: 12, packaging: 12, finished: 1 });
  const t = Date.now();
  await db.prepare("INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES ('stf_k2','Other Cook','k2@test.example','kitchen',1,?,?)").bind(t,t).run();
  await env.SESSIONS.put('session:tok-k2', JSON.stringify({ type: 'staff', role: 'kitchen', uid: 'stf_k2', email: 'k2@test.example', la: t, created: t }));
  await configure(env, policy('vida', { max_batch: 4, target_count: 8 }));
  const task = db.one("SELECT * FROM inventory_production_tasks WHERE menu_item_id='vida'");
  assert.equal(task.qty, 4);
  let result = await post(env, { action: 'start', id: task.id, expected_version: task.version }, 'anejo_sess=tok-k2');
  assert.equal(result.response.status, 403, 'only the assigned cook or owner may start');
  result = await post(env, { action: 'start', id: task.id, expected_version: task.version }, KITCHEN_COOKIE);
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  result = await post(env, { action: 'complete', id: task.id, expected_version: task.version + 1, actual_qty: 3, note: 'One bowl failed quality check.' }, KITCHEN_COOKIE);
  assert.equal(result.response.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.actual_qty, 3);
  assert.equal(db.one("SELECT on_hand FROM inventory_items WHERE id='inv_tuna'").on_hand, 8, 'consume planned 4 lb, not actual yield 3');
  assert.equal(db.one("SELECT count_quantity FROM inventory_items WHERE id='inv_pack'").count_quantity, 8);
  assert.equal(db.one("SELECT stock_count FROM menu_items WHERE id='vida'").stock_count, 4, 'add actual yield to prior finished count');
  assert.equal(db.one("SELECT status FROM inventory_production_tasks WHERE id=?", task.id).status, 'completed');
  assert.equal(db.one("SELECT COUNT(*) n FROM inventory_changes WHERE action='batch_consumed'").n, 2);
  assert.equal(db.one("SELECT COUNT(*) n FROM inventory_changes WHERE action='batch_finished'").n, 1);
  const before = db.one('SELECT COUNT(*) n FROM inventory_changes').n;
  const duplicate = await post(env, { action: 'complete', id: task.id, expected_version: task.version + 1, actual_qty: 3, note: 'Duplicate.' }, KITCHEN_COOKIE);
  assert.equal(duplicate.response.status, 409);
  assert.equal(db.one('SELECT COUNT(*) n FROM inventory_changes').n, before, 'replay creates no phantom change records');
});

test('expired stock at completion cannot mint finished yield or consume ingredient ledger rows', async () => {
  const { env, db } = await setup({ tuna: 12, packaging: 12, finished: 0 });
  await configure(env, policy('vida', { max_batch: 4 }));
  const task = db.one("SELECT * FROM inventory_production_tasks WHERE menu_item_id='vida'");
  assert.equal((await post(env, { action: 'start', id: task.id, expected_version: task.version }, KITCHEN_COOKIE)).response.status, 200);
  await db.prepare("UPDATE inventory_items SET expires_on='2000-01-01' WHERE id='inv_tuna'").run();
  const response = await post(env, { action: 'complete', id: task.id, expected_version: task.version + 1, actual_qty: task.qty }, KITCHEN_COOKIE);
  assert.equal(response.response.status, 409);
  assert.equal(db.one("SELECT on_hand FROM inventory_items WHERE id='inv_tuna'").on_hand, 12);
  assert.equal(db.one("SELECT count_quantity FROM inventory_items WHERE id='inv_pack'").count_quantity, 12);
  assert.equal(db.one("SELECT stock_count FROM menu_items WHERE id='vida'").stock_count, 0);
  assert.equal(db.one("SELECT status FROM inventory_production_tasks WHERE id=?",task.id).status, 'preparing');
  assert.equal(db.one("SELECT COUNT(*) n FROM inventory_changes WHERE action LIKE 'batch_%'").n, 0);
});

test('recipe changed after start blocks completion and does not mint finished stock', async () => {
  const { env, db } = await setup({ tuna: 12, packaging: 12, finished: 0 });
  await configure(env, policy('vida', { max_batch: 4 }));
  const task = db.one("SELECT * FROM inventory_production_tasks WHERE menu_item_id='vida'");
  assert.equal((await post(env, { action: 'start', id: task.id, expected_version: task.version }, KITCHEN_COOKIE)).response.status, 200);
  await db.prepare("UPDATE recipes SET updated_at=updated_at+1 WHERE id='rcp_test'").run();
  const response = await post(env, { action: 'complete', id: task.id, expected_version: task.version + 1, actual_qty: task.qty }, KITCHEN_COOKIE);
  assert.equal(response.response.status, 409);
  assert.equal(db.one("SELECT stock_count FROM menu_items WHERE id='vida'").stock_count, 0);
  assert.equal(db.one("SELECT COUNT(*) n FROM inventory_changes WHERE action LIKE 'batch_%'").n, 0);
});
