import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCateringDB } from './catering-outbox-fixture.js';
import { markKitchenReady } from '../../functions/_lib/kitchen-ready.js';
import { onRequestPost } from '../../functions/api/hub/kitchen/orders.js';
import { onRequestGet } from '../../functions/api/hub/owner/ready-orders.js';
import { hashPin } from '../../functions/_lib/pin.js';

async function fixture(status = 'prep') {
  const DB = makeCateringDB();
  DB.sqlite.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY,status TEXT,delivery_date TEXT,
    delivery_window TEXT,customer_name TEXT,kitchen_cleared_at INTEGER,created_at INTEGER,updated_at INTEGER);
    CREATE TABLE order_bowls (id TEXT PRIMARY KEY,order_id TEXT,prep_state TEXT,seq INTEGER,
      prep_by TEXT,prep_at INTEGER,updated_at INTEGER);
    CREATE TABLE staff (id TEXT PRIMARY KEY,name TEXT,role TEXT,active INTEGER,pin_hash TEXT,pin_salt TEXT);
    CREATE TABLE routes (id TEXT PRIMARY KEY,driver_id TEXT,status TEXT,offer_status TEXT,created_at INTEGER);
    CREATE TABLE route_stops (order_id TEXT,route_id TEXT);`);
  const pinHash = await hashPin('123456', 'test-salt');
  DB.sqlite.prepare('INSERT INTO staff VALUES (?,?,?,?,?,?)').run('cook','Test cook','kitchen',1,pinHash,'test-salt');
  DB.sqlite.prepare('INSERT INTO staff VALUES (?,?,?,?,?,?)').run('owner','Test owner','owner',1,null,null);
  const order = { id: 'order_test', status, delivery_date: '2026-12-25' };
  DB.sqlite.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)')
    .run(order.id, status, order.delivery_date, 'lunch', 'Synthetic customer', null, 100, 200);
  DB.sqlite.exec("INSERT INTO order_bowls VALUES ('bowl_test','order_test','done',1,NULL,NULL,200)");
  const env = { DB, SESSIONS: { get: async (key) => key === 'session:valid' ? JSON.stringify({type:'staff',uid:'cook',role:'kitchen',la:Date.now()}) : null } };
  return { DB, env, order };
}
const action = (env, patch = {}) => onRequestPost({env,request:new Request('https://example.test/api/hub/kitchen/orders', {
  method:'POST',headers:{Cookie:'anejo_sess=valid','Content-Type':'application/json'},
  body:JSON.stringify({id:'order_test',action:'mark_ready',pin:'123456',...patch}),
})});

test('real SQL: concurrent ready actions persist one alert and one transition, even after acknowledgement', async () => {
  const { DB, env, order } = await fixture();
  const receipts = await Promise.all([markKitchenReady(env,order,300),markKitchenReady(env,order,301)]);
  assert.equal(receipts.filter((r) => r.changed).length,1);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM alerts').get().n,1);
  const alert = DB.sqlite.prepare('SELECT * FROM alerts').get();
  assert.equal(alert.alert_type,'kitchen_ready_delivery');
  assert.equal(alert.ref_id,order.id);
  assert.match(alert.title,/Cocina/);
  assert.equal(DB.sqlite.prepare('SELECT status FROM orders').get().status,'ready');
  DB.sqlite.exec("UPDATE alerts SET status='acknowledged'");
  assert.equal((await markKitchenReady(env,order,400)).changed,false);
});

test('real SQL: alert insertion outage rolls readiness back so a retry is safe', async () => {
  const { DB, env, order } = await fixture();
  DB.sqlite.exec("CREATE TRIGGER fail_alert BEFORE INSERT ON alerts BEGIN SELECT RAISE(ABORT,'synthetic outage'); END;");
  await assert.rejects(markKitchenReady(env,order,300));
  assert.equal(DB.sqlite.prepare('SELECT status FROM orders').get().status,'prep');
  assert.equal((await action(env)).status,503);
  DB.sqlite.exec('DROP TRIGGER fail_alert');
  assert.equal((await action(env)).status,200);
});

test('real SQL: unpaid, canceled, uncompleted bowls and invalid PIN cannot create ready alerts', async () => {
  for (const state of ['pending','canceled','fulfilled']) {
    const {env,DB,order} = await fixture(state);
    assert.equal((await action(env)).status,409);
    assert.equal((await markKitchenReady(env,order,300)).changed,false);
    assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM alerts').get().n,0);
  }
  const {env,DB,order} = await fixture();
  assert.equal((await action(env,{pin:'000000'})).status,401);
  for (const state of ['pending',null]) {
    DB.sqlite.prepare('UPDATE order_bowls SET prep_state=?').run(state);
    assert.equal((await markKitchenReady(env,order,300)).changed,false);
    assert.equal((await action(env)).status,409);
  }
});

test('ready endpoint retries are idempotent and cannot regress ready to prep or undo a bowl', async () => {
  const {env,DB} = await fixture();
  assert.equal((await action(env)).status,200);
  const replay = await (await action(env)).json();
  assert.equal(replay.already,true);
  assert.equal((await action(env,{action:'prep_start'})).status,409);
  assert.equal((await action(env,{action:'bowl_undo',bowl_id:'bowl_test'})).status,409);
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM alerts').get().n,1);
});

test('bowl identifier from another order cannot be checked through this order', async () => {
  const {env,DB} = await fixture();
  DB.sqlite.exec("INSERT INTO order_bowls VALUES ('other_bowl','other_order','pending',1,NULL,NULL,200)");
  assert.equal((await action(env,{action:'bowl_done',bowl_id:'other_bowl'})).status,404);
  assert.equal(DB.sqlite.prepare("SELECT prep_state FROM order_bowls WHERE id='other_bowl'").get().prep_state,'pending');
});

test('owner readiness source includes kitchen-cleared and future/overdue ready orders, distinguishes accepted routes', async () => {
  const {env,DB} = await fixture('ready');
  env.SESSIONS.get = async () => JSON.stringify({type:'staff',uid:'owner',role:'owner',la:Date.now()});
  DB.sqlite.exec(`UPDATE orders SET kitchen_cleared_at=250;
    INSERT INTO orders VALUES ('ready_two','ready','2025-01-01','dinner','Test2',NULL,100,200);
    INSERT INTO orders VALUES ('not_ready','paid','2026-12-25','dinner','Test3',NULL,100,200);
    INSERT INTO routes VALUES ('route_test','owner','assigned','pending',100);
    INSERT INTO route_stops VALUES ('order_test','route_test');`);
  const get = () => onRequestGet({env,request:new Request('https://example.test/api/hub/owner/ready-orders',{headers:{Cookie:'anejo_sess=valid'}})});
  let res = await get();
  assert.equal(res.headers.get('Cache-Control'),'no-store');
  let data = await res.json();
  assert.equal(data.total,2); assert.equal(data.awaiting_driver,2);
  assert.equal(data.items.find((o) => o.id==='order_test').route_id,'route_test');
  DB.sqlite.exec("UPDATE routes SET offer_status='accepted'");
  data = await (await get()).json();
  assert.equal(data.awaiting_driver,1);
  DB.sqlite.exec('DROP TABLE routes');
  assert.equal((await get()).status,503,'storage failure must not report a false empty queue');
});

test('readiness feed and kitchen transitions require appropriate roles', async () => {
  const {env} = await fixture();
  const request = new Request('https://example.test/api/hub/owner/ready-orders',{headers:{Cookie:'anejo_sess=valid'}});
  assert.equal((await onRequestGet({env,request})).status,403);
  env.SESSIONS.get = async () => null;
  assert.equal((await onRequestGet({env,request})).status,401);
  assert.equal((await action(env)).status,401);
});
