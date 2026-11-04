// Synthetic manual-order SKU linkage tests. SQLite is local; no provider or production access.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { onRequestPost } from '../../functions/api/hub/owner/orders.js';
import { readFileSync } from 'node:fs';

function fixture() {
  const { DB, SESSIONS } = ownerEnv();
  DB.sqlite.prepare(`INSERT INTO menu_items (id,kind,name,name_es,price_cents,sort,active,created_at,updated_at)
    VALUES ('exact_sku','addon','Synthetic bowl','Tazón sintético',1999,999,1,?,?)`).run(Date.now(), Date.now());
  DB.sqlite.prepare(`INSERT INTO menu_items (id,kind,name,name_es,price_cents,sort,active,created_at,updated_at)
    VALUES ('inactive_sku','addon','Inactive bowl','Tazón inactivo',999,1000,0,?,?)`).run(Date.now(), Date.now());
  return { DB, SESSIONS };
}

function post(env, items, status = 'paid') {
  return onRequestPost({ env, request: new Request('https://example.test/api/hub/owner/orders', {
    method: 'POST', headers: { Cookie: 'anejo_sess=tok-owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ customer_name: 'Synthetic customer', status, items,
      delivery_date: '2026-12-01', delivery_window: 'lunch' }),
  }) });
}

test('manual order preserves exact catalog SKU and records paid inventory basis at insert', async () => {
  const { DB, SESSIONS } = fixture();
  const response = await post({ DB, SESSIONS }, [{ id: 'exact_sku', name: 'forged label', qty: 2, price_cents: 1800 }]);
  assert.equal(response.status, 200);
  const { order } = await response.json();
  assert.deepEqual(order.items[0], { id: 'exact_sku', catalog_price_cents: 1999, name: 'Synthetic bowl', qty: 2, price_cents: 1800 });
  const row = DB.sqlite.prepare('SELECT inventory_paid_at,inventory_paid_basis,status FROM orders').get();
  assert.equal(row.status, 'paid');
  assert.ok(Number.isSafeInteger(row.inventory_paid_at));
  assert.equal(row.inventory_paid_basis, 'owner_paid');
});

test('manual custom lines remain without a guessed SKU and pending orders have no paid basis', async () => {
  const { DB, SESSIONS } = fixture();
  const response = await post({ DB, SESSIONS }, [{ name: 'One-off catering tray', qty: 1, price_cents: 5000 }], 'pending');
  assert.equal(response.status, 200);
  const row = DB.sqlite.prepare('SELECT items,inventory_paid_at,inventory_paid_basis FROM orders').get();
  assert.deepEqual(JSON.parse(row.items)[0], { name: 'One-off catering tray', qty: 1, price_cents: 5000 });
  assert.equal(row.inventory_paid_at, null);
  assert.equal(row.inventory_paid_basis, null);
});

test('unknown or inactive exact SKU is rejected without creating an order', async () => {
  const { DB, SESSIONS } = fixture();
  for (const id of ['not_a_sku', 'inactive_sku']) {
    const response = await post({ DB, SESSIONS }, [{ id, name: 'Anything', qty: 1, price_cents: 100 }]);
    assert.equal(response.status, 409);
  }
  assert.equal(DB.sqlite.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
});

test('manual order picker is a searchable catalog datalist and sends the selected exact id', () => {
  const html = readFileSync(new URL('../../public/hub/owner/customers.html', import.meta.url), 'utf8');
  assert.match(html, /list="o-catalog-options"/);
  assert.match(html, /SKU '\s*\+ it\.id/);
  assert.match(html, /line\.id = sku/);
  assert.match(html, /var selected = orderCatalogByLabel\.get/);
  assert.match(html, /document\.addEventListener\('anejo:langchange', renderOrderCatalog\)/);
});
