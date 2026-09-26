// One shared migrated database across the real handlers; no provider or browser acceptance claim.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { hashPin } from '../../functions/_lib/pin.js';
import { createOrderReceipt } from '../../functions/_lib/order-receipt.js';
import { onRequestPost as payment } from '../../functions/api/webhooks/square.js';
import { onRequestGet as receipt } from '../../functions/api/order-receipt.js';
import { onRequestGet as kitchenBoard, onRequestPost as kitchenAction } from '../../functions/api/hub/kitchen/orders.js';
import { onRequestGet as readiness } from '../../functions/api/hub/owner/ready-orders.js';
import { onRequestPost as driverAction } from '../../functions/api/hub/driver/route.js';

test('one captured order stays confirmed through kitchen handoff and driver acceptance; authorization never releases it', async (t) => {
  // No credentials or provider bindings. Block every accidental outbound call, even if a
  // best-effort handler swallows its error; the final call-count assertion catches that too.
  const network = t.mock.method(globalThis, 'fetch', async () => { throw new Error('External calls forbidden in synthetic flow'); });
  const env = ownerEnv();
  const { DB, SESSIONS } = env;
  t.after(() => DB.sqlite.close());
  const at = Date.now();
  DB.sqlite.prepare('UPDATE staff SET pin_hash=?,pin_salt=? WHERE id=?')
    .run(await hashPin('123456', 'flow-salt'), 'flow-salt', 'stf_k');
  DB.sqlite.prepare("INSERT INTO staff (id,name,email,role,active,created_at,updated_at) VALUES ('flow_driver','Synthetic driver','driver@example.test','driver',1,?,?)").run(at, at);
  await SESSIONS.put('session:flow-driver', JSON.stringify({ type: 'staff', uid: 'flow_driver', role: 'driver', la: at, created: at }));
  DB.sqlite.prepare(`INSERT INTO orders (id,square_order_id,items,status,subtotal_cents,discount_cents,
    customer_name,delivery_date,delivery_window,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run('flow_order', 'flow_square', JSON.stringify([{ name: 'Synthetic meal', qty: 1 }]), 'pending', 4000, 500,
      'Synthetic customer', '2026-12-25', 'lunch', at, at);
  const token = await createOrderReceipt(env, 'flow_order');
  const get = (handler, path, cookie = OWNER_COOKIE) => handler({ env, request: new Request('https://example.test' + path, { headers: { Cookie: cookie } }) });
  const body = async response => { assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
  const confirm = async () => body(await receipt({ env, request: new Request('https://example.test/api/order-receipt', { headers: { Authorization: 'Bearer ' + token } }) }));
  const board = async () => (await body(await get(kitchenBoard, '/api/hub/kitchen/orders', 'anejo_sess=tok-kitchen'))).board;
  const ready = async () => body(await get(readiness, '/api/hub/owner/ready-orders'));
  const cook = (action, extra = {}) => kitchenAction({ env, request: new Request('https://example.test/api/hub/kitchen/orders', {
    method: 'POST', headers: { Cookie: 'anejo_sess=tok-kitchen', 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'flow_order', action, pin: '123456', ...extra }),
  }) });
  const webhook = status => payment({ env, request: new Request('https://example.test/api/webhooks/square', {
    method: 'POST', body: JSON.stringify({ type: 'payment.updated', data: { object: { payment: { order_id: 'flow_square', status } } } }),
  }) });

  assert.equal((await webhook('APPROVED')).status, 200);
  assert.deepEqual(await confirm(), { paid: false });
  assert.equal((await board()).pending.length, 0);
  assert.equal((await cook('prep_start')).status, 409);
  assert.equal((await ready()).total, 0);

  assert.equal((await webhook('COMPLETED')).status, 200);
  const confirmed = await confirm();
  assert.deepEqual(confirmed, { paid: true, transaction_id: 'flow_order', currency: 'USD', value: 35 });
  assert.deepEqual((await board()).pending.map(o => o.id), ['flow_order']);
  await body(await cook('prep_start'));
  assert.deepEqual((await board()).prep.map(o => o.id), ['flow_order']);
  const bowl = DB.one('SELECT id,prep_state FROM order_bowls WHERE order_id=?', 'flow_order');
  assert.equal(bowl.prep_state, 'pending');
  await body(await cook('bowl_done', { bowl_id: bowl.id }));
  assert.equal((await cook('mark_ready')).status, 409, 'missing retained photos still blocks the composed flow');
  // Photo upload/storage has separate coverage. Seed only its retained metadata; never call R2.
  for (const kind of ['contents', 'packed']) DB.sqlite.prepare('INSERT INTO kitchen_photos (id,order_id,kind,media_key,taken_at) VALUES (?,?,?,?,?)')
    .run('flow_' + kind, 'flow_order', kind, 'kitchen/synthetic/' + kind + '.jpg', Date.now());
  await body(await cook('mark_ready'));
  assert.equal((await ready()).awaiting_driver, 1);
  await body(await cook('kitchen_clear'));
  assert.equal((await board()).ready.length, 0);
  assert.equal((await ready()).awaiting_driver, 1, 'clearing kitchen does not erase the delivery obligation');

  // Dispatch creation has separate coverage. Seed the offered route, then use the driver handler.
  DB.sqlite.prepare("INSERT INTO routes (id,driver_id,status,offer_status,created_at,updated_at) VALUES ('flow_route','flow_driver','assigned','pending',?,?)").run(at, at);
  DB.sqlite.prepare("INSERT INTO route_stops (id,route_id,order_id,created_at,updated_at) VALUES ('flow_stop','flow_route','flow_order',?,?)").run(at, at);
  await body(await driverAction({ env, request: new Request('https://example.test/api/hub/driver/route', {
    method: 'POST', headers: { Cookie: 'anejo_sess=flow-driver', 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'accept', route_id: 'flow_route' }),
  }) }));
  const assigned = await ready();
  assert.equal(assigned.total, 1);
  assert.equal(assigned.awaiting_driver, 0);
  assert.equal(assigned.items[0].route_id, 'flow_route');
  assert.equal(assigned.items[0].offer_status, 'accepted');
  assert.equal((await webhook('COMPLETED')).status, 200);
  assert.deepEqual(await confirm(), confirmed, 'receipt stays paid after kitchen states and webhook replay');
  assert.equal(DB.one('SELECT status FROM orders WHERE id=?', 'flow_order').status, 'ready');
  assert.equal(DB.one("SELECT COUNT(*) n FROM alerts WHERE alert_type='new_paid_order' AND ref_id='flow_order'").n, 1);
  assert.equal(DB.one("SELECT COUNT(*) n FROM alerts WHERE alert_type='kitchen_ready_delivery' AND ref_id='flow_order'").n, 1);
  assert.equal(network.mock.callCount(), 0);
});
