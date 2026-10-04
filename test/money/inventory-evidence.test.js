import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost, onRequestGet } from '../../functions/api/hub/kitchen/inventory.js';
import { onRequestPost as upload } from '../../functions/api/hub/kitchen/inventory-photo.js';

const KITCHEN = 'anejo_sess=tok-kitchen';
const jpeg = Buffer.concat([Buffer.from([255,216,255,224,0,16]), Buffer.alloc(120, 1), Buffer.from([255,217])]);
const req = (path, body, cookie = KITCHEN) => new Request(`https://anejo.test/api/hub/kitchen/${path}`, { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
async function setup() {
  const objects = new Map();
  const MEDIA = { async put(key, bytes, options) { objects.set(key, { bytes: Buffer.from(bytes), options }); } };
  const env = ownerEnv({ MEDIA });
  env.DB.exec("INSERT INTO inventory_items (id,name,unit,on_hand,par_level,active,created_at,updated_at) VALUES ('inv1','Tuna','lb',4,2,1,1,1)");
  return { env, objects };
}

test('inventory count and additive quantity/weight save with atomic durable before/after ledger', async () => {
  const { env } = await setup();
  const originalFetch = globalThis.fetch; let externalCalls = 0;
  globalThis.fetch = async () => { externalCalls++; throw new Error('network should not be called without push credentials'); };
  let r;
  try { r = await onRequestPost({ env, request: req('inventory', { action: 'upsert', id: 'inv1', name: 'Tuna', on_hand: 5, count_quantity: 3, total_weight_grams: 850, expected_revision: 0 }) }); }
  finally { globalThis.fetch = originalFetch; }
  assert.equal(r.status, 200); let b = await r.json(); assert.equal(b.change_id != null, true); assert.equal(b.push_status, 'noop');
  assert.equal(externalCalls, 0);
  assert.equal(env.DB.one("SELECT revision FROM inventory_items WHERE id='inv1'").revision, 1);
  let change = env.DB.one('SELECT * FROM inventory_changes WHERE id=?', b.change_id);
  assert.equal(change.action, 'upsert'); assert.equal(JSON.parse(change.before_json).on_hand, 4); assert.equal(JSON.parse(change.after_json).total_weight_grams, 850);
  r = await onRequestPost({ env, request: req('inventory', { action: 'count', id: 'inv1', on_hand: 7, expected_revision: 1 }) });
  b = await r.json(); assert.equal(r.status, 200); assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 2);
  assert.equal(env.DB.one('SELECT push_status FROM inventory_changes WHERE id=?', b.change_id).push_status, 'noop');
});

test('negative measurements and stale revisions reject without ledger mutation', async () => {
  const { env } = await setup();
  for (const value of [{ count_quantity: -1 }, { count_quantity: 1.5 }, { total_weight_grams: -0.1 }, { expires_on: '2026-02-30' }]) {
    const r = await onRequestPost({ env, request: req('inventory', { action: 'upsert', id: 'inv1', name: 'Tuna', ...value }) });
    assert.equal(r.status, 400);
  }
  const stale = await onRequestPost({ env, request: req('inventory', { action: 'count', id: 'inv1', on_hand: 9, expected_revision: 99 }) });
  assert.equal(stale.status, 409); assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 0);
});

test('stock mutation rolls back when its durable ledger row cannot be inserted', async () => {
  const { env } = await setup();
  env.DB.exec("CREATE TRIGGER reject_inventory_audit BEFORE INSERT ON inventory_changes BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  const r = await onRequestPost({ env, request: req('inventory', { action: 'count', id: 'inv1', on_hand: 99 }) });
  assert.equal(r.status, 409);
  assert.equal(env.DB.one("SELECT on_hand FROM inventory_items WHERE id='inv1'").on_hand, 4);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 0);
});

test('finished-menu count uses the same atomic evidence ledger', async () => {
  const { env } = await setup();
  assert.equal((await onRequestPost({ env, request: req('inventory', { action: 'menu_count', id: 'vida', stock_count: 6.5 }) })).status, 400);
  assert.equal((await onRequestPost({ env, request: req('inventory', { action: 'menu_count', id: 'vida', stock_count: 6, expected_revision: 10 }) })).status, 409);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 0);
  const r = await onRequestPost({ env, request: req('inventory', { action: 'menu_count', id: 'vida', stock_count: 6 }) });
  assert.equal(r.status, 200);
  const body = await r.json(); assert.equal(body.change_id != null, true);
  assert.equal(env.DB.one("SELECT stock_count FROM menu_items WHERE id='vida'").stock_count, 6);
  const log = env.DB.one('SELECT * FROM inventory_changes WHERE id=?', body.change_id);
  assert.equal(log.action, 'menu_count'); assert.equal(JSON.parse(log.after_json).stock_count, 6);
});

test('zero-row revision CAS creates no phantom change record or notification', async () => {
  const { env } = await setup();
  env.DB.exec("CREATE TRIGGER skip_inventory_update BEFORE UPDATE ON inventory_items BEGIN SELECT RAISE(IGNORE); END");
  const r = await onRequestPost({ env, request: req('inventory', { action: 'count', id: 'inv1', on_hand: 99 }) });
  assert.equal(r.status, 409);
  assert.equal(env.DB.one("SELECT on_hand FROM inventory_items WHERE id='inv1'").on_hand, 4);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 0);
});

test('photo review binds exact pending key, kitchen cannot approve, replaced image cannot be approved', async () => {
  const { env, objects } = await setup();
  const data_url = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  const first = await (await upload({ env, request: req('inventory-photo', { id: 'inv1', data_url, expected_revision: 0 }) })).json();
  assert.equal(first.photo_status, 'pending'); assert.equal(first.flagged_pending, true); assert.equal(objects.has(first.photo_key), true);
  let r = await onRequestPost({ env, request: req('inventory', { action: 'review_photo', id: 'inv1', photo_key: first.photo_key, decision: 'approve' }, KITCHEN) });
  assert.equal(r.status, 403);
  const second = await (await upload({ env, request: req('inventory-photo', { id: 'inv1', data_url, expected_revision: 1 }) })).json();
  r = await onRequestPost({ env, request: req('inventory', { action: 'review_photo', id: 'inv1', photo_key: first.photo_key, decision: 'approve' }, OWNER_COOKIE) });
  assert.equal(r.status, 409); assert.equal(env.DB.one("SELECT photo_status FROM inventory_items WHERE id='inv1'").photo_status, 'pending');
  r = await onRequestPost({ env, request: req('inventory', { action: 'review_photo', id: 'inv1', photo_key: second.photo_key, decision: 'approve', expected_revision: 2 }, OWNER_COOKIE) });
  assert.equal(r.status, 200); assert.equal(env.DB.one("SELECT photo_status FROM inventory_items WHERE id='inv1'").photo_status, 'approved');
});

test('unauthorized access is rejected and GET returns latest change ledger and photo fields', async () => {
  const { env } = await setup();
  const denied = await onRequestPost({ env, request: req('inventory', { action: 'count', id: 'inv1', on_hand: 1 }, 'anejo_sess=tok-marketing') });
  assert.equal(denied.status, 403);
  await onRequestPost({ env, request: req('inventory', { action: 'count', id: 'inv1', on_hand: 3 }) });
  const response = await onRequestGet({ env, request: new Request('https://anejo.test/api/hub/kitchen/inventory', { headers: { Cookie: KITCHEN } }) });
  const body = await response.json(); assert.equal(body.items[0].revision, 1); assert.equal(body.items[0].photo_status, 'none'); assert.equal(body.changes.length, 1);
});

test('inventory history read failure returns unavailable instead of an empty success claim', async () => {
  const { env } = await setup();
  const originalPrepare = env.DB.prepare.bind(env.DB);
  env.DB.prepare = (sql) => /FROM inventory_changes/.test(sql)
    ? { all: async () => { throw new Error('simulated history read failure'); } }
    : originalPrepare(sql);
  const response = await onRequestGet({ env, request: new Request('https://anejo.test/api/hub/kitchen/inventory', { headers: { Cookie: KITCHEN } }) });
  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /unavailable/i);
});
