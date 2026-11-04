import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/kitchen/inventory.js';

const COOKIE = 'anejo_sess=tok-kitchen';
const request = (body) => new Request('https://anejo.test/api/hub/kitchen/inventory', {
  method: 'POST', headers: { Cookie: COOKIE, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
async function post(env, body, options = {}) {
  return onRequestPost({ env, request: request(body), ...options });
}
function fixture() {
  const env = ownerEnv();
  env.DB.exec("INSERT INTO inventory_items(id,name,unit,on_hand,par_level,active,revision,created_at,updated_at) VALUES ('synthetic_beans','Synthetic beans','oz',5,2,1,0,1,1)");
  return env;
}

test('blank, null and boolean ingredient on-hand values reject without mutation', async () => {
  const env = fixture();
  for (const on_hand of [null, '', false, true]) {
    const response = await post(env, { action: 'count', id: 'synthetic_beans', on_hand });
    assert.equal(response.status, 400);
  }
  assert.equal(env.DB.one("SELECT on_hand,revision FROM inventory_items WHERE id='synthetic_beans'").on_hand, 5);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 0);
});

test('finished count requires exact revision and prepared read exposes promotion fields', async () => {
  const env = fixture();
  let response = await post(env, { action: 'menu_count', id: 'vida', stock_count: 4 });
  assert.equal(response.status, 409);
  response = await post(env, { action: 'menu_count', id: 'vida', stock_count: 4, expected_revision: 0 });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.persisted, true);
  assert.equal(saved.inventory_revision, 1);
  const prepared = saved.prepared.items.find(item => item.id === 'vida');
  assert.equal(prepared.inventory_revision, 1);
  assert.equal(prepared.name_es, prepared.name);
  assert.equal(prepared.active, true);
  assert.equal(typeof prepared.orderable, 'boolean');
  assert.ok(Object.hasOwn(prepared, 'image'));
});

test('count request replay returns the durable receipt once; changed replay conflicts', async () => {
  const env = fixture();
  const body = { action: 'count', id: 'synthetic_beans', on_hand: 3, expected_revision: 0, request_id: 'inventory-count-01' };
  const first = await (await post(env, body)).json();
  const replayResponse = await post(env, body);
  const replay = await replayResponse.json();
  assert.equal(replayResponse.status, 200);
  assert.equal(replay.replayed, true);
  assert.equal(replay.persisted, true);
  assert.equal(replay.change_id, first.change_id);
  assert.equal(replay.revision, 1);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 1);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM activity_log WHERE event='inventory.counted'").n, 1);
  const conflict = await post(env, { ...body, on_hand: 2 });
  assert.equal(conflict.status, 409);
  assert.equal(env.DB.one("SELECT on_hand FROM inventory_items WHERE id='synthetic_beans'").on_hand, 3);
});

test('ambiguous commit retry replays without repeating notifications', async () => {
  const env = fixture();
  let scheduled;
  const runtime = { waitUntil(promise) { scheduled = promise; } };
  const body = { action: 'menu_count', id: 'vida', stock_count: 2, expected_revision: 0, request_id: 'finished-count-01' };
  const firstResponse = await post(env, body, runtime);
  const first = await firstResponse.json();
  assert.equal(first.persisted, true);
  assert.equal(first.push_status, 'pending');
  await scheduled;
  const replay = await (await post(env, body)).json();
  assert.equal(replay.replayed, true);
  assert.equal(replay.change_id, first.change_id);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 1);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM activity_log WHERE event='menu.stock_counted'").n, 1);
});

test('create upsert request idempotency does not create duplicate items', async () => {
  const env = fixture();
  const body = { action: 'upsert', name: 'Synthetic cups', unit: 'ea', request_id: 'inventory-create-01' };
  const first = await (await post(env, body)).json();
  const replay = await (await post(env, body)).json();
  assert.equal(replay.replayed, true);
  assert.equal(replay.id, first.id);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_items WHERE name='Synthetic cups'").n, 1);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 1);
});

test('sale intent validates before count commit; story asset failure does not undo saved count', async () => {
  const env = fixture();
  for (const body of [
    { for_sale: 'true', stock_count: 5 },
    { for_sale: true, stock_count: 0 },
    { for_sale: true, stock_count: '' },
    { for_sale: true, stock_count: 5, sale_expires_at: Date.now() + 49 * 60 * 60 * 1000 },
    { for_sale: true, stock_count: 5, sale_expected_revision: 0 },
    { for_sale: true, stock_count: 5, locale: 'fr' },
  ]) {
    const response = await post(env, { action: 'menu_count', id: 'vida', expected_revision: 0, ...body });
    assert.equal(response.status, 400);
  }
  assert.equal(env.DB.one("SELECT stock_count FROM menu_items WHERE id='vida'").stock_count, null);

  const response = await post(env, { action: 'menu_count', id: 'vida', stock_count: '5', expected_revision: 0,
    for_sale: true, sale_expected_revision: null, locale: 'en', request_id: 'sale-intent-01' });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.persisted, true);
  assert.equal(saved.item.availability, 'available');
  assert.equal(saved.sales_status, 'error');
  assert.equal(env.DB.one("SELECT stock_count,inventory_revision,availability FROM menu_items WHERE id='vida'").stock_count, 5);
  assert.equal(env.DB.one("SELECT enabled FROM inventory_sale_offers WHERE menu_item_id='vida'").enabled, 1);
  assert.equal(env.DB.one("SELECT state FROM inventory_sale_promotions WHERE menu_item_id='vida'").state, 'error');
  assert.equal(JSON.parse(env.DB.one('SELECT after_json FROM inventory_changes WHERE id=?', saved.change_id).after_json).__sale_intent.locale, 'en');
});

test('false sale intent withdraws only the batch offer and replay reuses original sale timestamp', async () => {
  const env = fixture();
  const firstBody = { action: 'menu_count', id: 'vida', stock_count: 3, expected_revision: 0, for_sale: true,
    sale_expected_revision: null, request_id: 'sale-start-01' };
  const firstResponse = await post(env, firstBody);
  const first = await firstResponse.json();
  assert.equal(first.sales_status, 'error');
  const change = env.DB.one('SELECT created_at FROM inventory_changes WHERE id=?', first.change_id);
  const replay = await (await post(env, firstBody)).json();
  assert.equal(replay.replayed, true);
  assert.equal(env.DB.one('SELECT counted_at FROM inventory_sale_offers WHERE menu_item_id=?', 'vida').counted_at, change.created_at);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 1);

  const withdraw = await post(env, { action: 'menu_count', id: 'vida', stock_count: 0, expected_revision: 1,
    for_sale: false, sale_expected_revision: 1, request_id: 'sale-withdraw-01' });
  const result = await withdraw.json();
  assert.equal(result.persisted, true);
  assert.equal(env.DB.one("SELECT enabled FROM inventory_sale_offers WHERE menu_item_id='vida'").enabled, 0);
  assert.equal(env.DB.one("SELECT availability FROM menu_items WHERE id='vida'").availability, 'available');
  assert.equal(env.DB.one("SELECT state FROM inventory_sale_promotions WHERE menu_item_id='vida'").state, 'withdrawn');
});
