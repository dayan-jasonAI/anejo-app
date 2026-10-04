import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv, OWNER_COOKIE } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/owner/menu.js';

const KITCHEN_COOKIE = 'anejo_sess=tok-kitchen';
function request(body, cookie = OWNER_COOKIE) {
  return new Request('https://anejo.test/api/hub/owner/menu', {
    method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}
async function invoke(env, body, cookie = OWNER_COOKIE) {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });
  try { return await onRequestPost({ env, request: request(body, cookie) }); }
  finally { globalThis.fetch = realFetch; }
}
function fixture() {
  const env = ownerEnv();
  env.DB.sqlite.prepare("UPDATE menu_items SET stock_count=NULL,stock_counted_at=NULL,inventory_revision=0,last_inventory_change_id=NULL WHERE id='vida'").run();
  return env;
}

test('owner menu stock count writes revisioned before/after inventory evidence and leaves price audit intact', async () => {
  const env = fixture();
  const response = await invoke(env, { op: 'update_item', id: 'vida', stock_count: 7, price_cents: 2499 });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  const row = env.DB.one("SELECT stock_count,stock_counted_at,inventory_revision,last_inventory_change_id FROM menu_items WHERE id='vida'");
  assert.equal(row.stock_count, 7);
  assert.ok(Number.isFinite(row.stock_counted_at));
  assert.equal(row.inventory_revision, 1);
  assert.equal(row.last_inventory_change_id, body.stock_change_id);
  assert.equal(body.push_status, 'noop', 'no VAPID credentials means a truthful no-op');
  const change = env.DB.one('SELECT * FROM inventory_changes WHERE id=?', body.stock_change_id);
  assert.equal(change.action, 'owner_menu_stock_count');
  assert.equal(change.actor_id, 'stf_owner');
  assert.equal(JSON.parse(change.before_json).stock_count, null);
  assert.equal(JSON.parse(change.after_json).stock_count, 7);
  assert.equal(change.push_status, 'noop');
  assert.equal(env.DB.one("SELECT price_cents FROM menu_items WHERE id='vida'").price_cents, 2499);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM menu_price_log WHERE item_id='vida' AND field='price_cents'").n, 1);
});

test('same count creates no new inventory event; stale expected revision is rejected', async () => {
  const env = fixture();
  let response = await invoke(env, { op: 'update_item', id: 'vida', stock_count: 4 });
  assert.equal(response.status, 200, await response.clone().text());
  const firstId = (await response.json()).stock_change_id;
  response = await invoke(env, { op: 'update_item', id: 'vida', stock_count: 4 });
  assert.equal(response.status, 200, await response.clone().text());
  assert.equal((await response.json()).stock_change_id, undefined);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 1);
  assert.equal(env.DB.one("SELECT inventory_revision FROM menu_items WHERE id='vida'").inventory_revision, 1);
  assert.ok(firstId);

  response = await invoke(env, { op: 'update_item', id: 'vida', stock_count: 9, expected_revision: 0 });
  assert.equal(response.status, 409);
  assert.equal(env.DB.one("SELECT stock_count FROM menu_items WHERE id='vida'").stock_count, 4);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 1);
});

test('an unauthorized kitchen session cannot change owner menu stock', async () => {
  const env = fixture();
  const response = await invoke(env, { op: 'update_item', id: 'vida', stock_count: 3 }, KITCHEN_COOKIE);
  assert.equal(response.status, 403);
  assert.equal(env.DB.one("SELECT stock_count FROM menu_items WHERE id='vida'").stock_count, null);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 0);
});

test('audit insert failure rolls back stock, price and price-log updates together', async () => {
  const env = fixture();
  env.DB.exec("CREATE TRIGGER reject_owner_menu_inventory_audit BEFORE INSERT ON inventory_changes BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  const oldPrice = env.DB.one("SELECT price_cents FROM menu_items WHERE id='vida'").price_cents;
  const response = await invoke(env, { op: 'update_item', id: 'vida', stock_count: 5, price_cents: oldPrice + 100 });
  assert.notEqual(response.status, 200);
  assert.equal(env.DB.one("SELECT stock_count FROM menu_items WHERE id='vida'").stock_count, null);
  assert.equal(env.DB.one("SELECT price_cents FROM menu_items WHERE id='vida'").price_cents, oldPrice);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 0);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM menu_price_log WHERE item_id='vida' AND field='price_cents'").n, 0);
});

test('a price-only edit cannot restore the stale stock count or revision read before a concurrent count', async () => {
  const env = fixture();
  env.DB.sqlite.prepare("UPDATE menu_items SET stock_count=3,stock_counted_at=?,inventory_revision=1,last_inventory_change_id='before' WHERE id='vida'").run(Date.now());
  const originalPrepare = env.DB.prepare.bind(env.DB);
  let injected = false;
  env.DB.prepare = (sql) => {
    const prepared = originalPrepare(sql);
    if (sql !== 'SELECT * FROM menu_items WHERE id = ?') return prepared;
    return {
      bind(...args) {
        const bound = prepared.bind(...args);
        return {
          first: async (...firstArgs) => {
            const row = await bound.first(...firstArgs);
            if (!injected) {
              injected = true;
              env.DB.sqlite.prepare("UPDATE menu_items SET stock_count=8,stock_counted_at=?,inventory_revision=2,last_inventory_change_id='concurrent-count' WHERE id='vida'").run(Date.now());
            }
            return row;
          },
        };
      },
    };
  };
  const response = await invoke(env, { op: 'update_item', id: 'vida', price_cents: 2399 });
  assert.equal(response.status, 200, await response.clone().text());
  const row = env.DB.one("SELECT stock_count,inventory_revision,last_inventory_change_id,price_cents FROM menu_items WHERE id='vida'");
  assert.equal(row.stock_count, 8);
  assert.equal(row.inventory_revision, 2);
  assert.equal(row.last_inventory_change_id, 'concurrent-count');
  assert.equal(row.price_cents, 2399);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 0, 'the price edit did not claim an inventory mutation');
});

test('a concurrent revision conflict leaves no stock, price-log or inventory audit phantom', async () => {
  const env = fixture();
  env.DB.exec("CREATE TRIGGER ignore_owner_menu_stock_update BEFORE UPDATE OF last_inventory_change_id ON menu_items BEGIN SELECT RAISE(IGNORE); END");
  const oldPrice = env.DB.one("SELECT price_cents FROM menu_items WHERE id='vida'").price_cents;
  const response = await invoke(env, { op: 'update_item', id: 'vida', stock_count: 5, price_cents: oldPrice + 100 });
  assert.equal(response.status, 409);
  assert.equal(env.DB.one("SELECT stock_count FROM menu_items WHERE id='vida'").stock_count, null);
  assert.equal(env.DB.one("SELECT price_cents FROM menu_items WHERE id='vida'").price_cents, oldPrice);
  assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_changes').n, 0);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM menu_price_log WHERE item_id='vida' AND field='price_cents'").n, 0);
});
