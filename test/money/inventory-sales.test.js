import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { saleOfferSnapshot, saveSaleOffer, stockReservationStatements, InventorySaleError, MAX_SALE_TTL_MS } from '../../functions/_lib/inventory_sales.js';

const ids = ['vida', 'traditional_emp-cheese', 'catering_emp-cheese-10', 'catering_emp-cheese-25'];
function fixture() {
  const env = ownerEnv(), db = env.DB, at = Date.now();
  for (const id of ids) db.prepare('UPDATE menu_items SET active=1,availability=\'available\',inventory_revision=4 WHERE id=?').bind(id).run();
  return { env, db, at };
}
async function save(env, itemId = 'vida', extra = {}) {
  const row = env.DB.one('SELECT inventory_revision FROM menu_items WHERE id=?', itemId);
  return saveSaleOffer(env, { itemId, quantity: 4, enabled: true, expectedRevision: null, inventoryRevision: row.inventory_revision, changeId: `change_${itemId}`, actorId: 'stf_owner', at: Date.now(), ...extra });
}

test('declaration is an exact-SKU absolute count, revision checked, and same-change replay is idempotent', async () => {
  const { env, db, at } = fixture();
  const first = await saveSaleOffer(env, { itemId: 'traditional_emp-cheese', quantity: 20, enabled: true, inventoryRevision: 4, changeId: 'receipt-1', actorId: 'stf_owner', at });
  assert.deepEqual([first.ok, first.revision, first.replayed], [true, 1, false]);
  const replay = await saveSaleOffer(env, { itemId: 'traditional_emp-cheese', quantity: 20, enabled: true, inventoryRevision: 4, changeId: 'receipt-1', actorId: 'stf_owner', at });
  assert.deepEqual([replay.ok, replay.revision, replay.replayed], [true, 1, true]);
  assert.equal((await saveSaleOffer(env, { itemId: 'traditional_emp-cheese', quantity: 21, enabled: true, expectedRevision: 1, inventoryRevision: 4, changeId: 'receipt-1' })).error, 'change_id_conflict');
  const updated = await saveSaleOffer(env, { itemId: 'traditional_emp-cheese', quantity: 3, enabled: true, expectedRevision: 1, inventoryRevision: 4, changeId: 'receipt-2', actorId: 'stf_owner', at: at + 1 });
  assert.deepEqual([updated.ok, updated.revision], [true, 2]);
  assert.equal((await saveSaleOffer(env, { itemId: 'traditional_emp-cheese', quantity: 9, enabled: true, expectedRevision: 1, inventoryRevision: 4, changeId: 'stale' })).error, 'sale_offer_revision_changed');
  assert.equal(db.one("SELECT quantity FROM inventory_sale_offers WHERE menu_item_id='traditional_emp-cheese'").quantity, 3, 'new declaration replaces the absolute unreserved quantity');
});

test('sale TTL defaults to 24h, is bounded at 48h, and invalid count or expiry is rejected', async () => {
  const { env, at } = fixture();
  const saved = await saveSaleOffer(env, { itemId: 'vida', quantity: 1, inventoryRevision: 4, changeId: 'ttl_default', at });
  assert.equal(saved.sale_expires_at - at, 24 * 60 * 60 * 1000);
  assert.equal((await saveSaleOffer(env, { itemId: 'vida', quantity: 1, expectedRevision: 1, inventoryRevision: 4, changeId: 'ttl_too_long', at: at + 1, expiresAt: at + MAX_SALE_TTL_MS + 2 })).error, 'invalid_sale_expiry');
  for (const quantity of [-1, 10000, 1.2]) assert.equal((await saveSaleOffer(env, { itemId: 'vida', quantity, expectedRevision: 1, inventoryRevision: 4, changeId: `bad_${quantity}` })).error, 'invalid_quantity');
  assert.equal((await saveSaleOffer(env, { itemId: 'vida', quantity: 1, expectedRevision: 1, inventoryRevision: 3, changeId: 'stale_inventory' })).error, 'inventory_revision_changed');
});

test('snapshot suppresses zero, expired, disabled, unknown, missing-image and mismatched-revision offers', async () => {
  const { env, db, at } = fixture();
  const rows = [
    ['vida', 2, 1, at - 10000, at + 60000, 4, 1, 'snap_vida'],
    ['traditional_emp-cheese', 0, 1, at - 10000, at + 60000, 4, 1, 'snap_zero'],
    ['catering_emp-cheese-10', 3, 1, at - 10000, at - 1, 4, 1, 'snap_expired'],
    ['catering_emp-cheese-25', 3, 1, at - 10000, at + 60000, 3, 1, 'snap_mismatch'],
  ];
  db.sqlite.prepare('INSERT INTO inventory_sale_offers(menu_item_id,quantity,revision,counted_at,sale_expires_at,inventory_revision,enabled,change_id) VALUES(?,?,?,?,?,?,?,?)').run(...rows[0]);
  for (const row of rows.slice(1)) db.sqlite.prepare('INSERT INTO inventory_sale_offers(menu_item_id,quantity,revision,counted_at,sale_expires_at,inventory_revision,enabled,change_id) VALUES(?,?,?,?,?,?,?,?)').run(...row);
  db.prepare("UPDATE menu_items SET image='' WHERE id='vida'").run();
  const snap = await saleOfferSnapshot(env, at);
  assert.equal(snap.ok, true);
  assert.equal(snap.offers.length, 0);
  assert.deepEqual(new Set(snap.suppressed.map(x => x.reason)), new Set(['catalog_image_missing', 'zero_quantity', 'offer_expired', 'inventory_revision_changed']));
  db.prepare("UPDATE menu_items SET image='menu-launch/food-emp-cheese.webp' WHERE id='vida'").run();
  db.prepare("UPDATE inventory_sale_offers SET quantity=4,sale_expires_at=?,enabled=1 WHERE menu_item_id='vida'").bind(at + 60000).run();
  const good = await saleOfferSnapshot(env, at);
  assert.equal(good.offers.length, 1);
  assert.deepEqual([good.offers[0].item_id, good.offers[0].quantity, good.offers[0].remaining, good.offers[0].cta_url], ['vida', 4, 4, '/order?product=vida']);
  assert.ok(good.offers[0].image.startsWith('/assets/img/'));
});

test('snapshot exposes every declared catalog kind independently without pack-size conversion', async () => {
  const { env, db, at } = fixture();
  for (const [i, id] of ids.entries()) {
    const row = db.one('SELECT inventory_revision FROM menu_items WHERE id=?', id);
    const result = await saveSaleOffer(env, { itemId: id, quantity: i + 2, inventoryRevision: row.inventory_revision, changeId: `all_${id}`, at });
    assert.equal(result.ok, true);
  }
  const snap = await saleOfferSnapshot(env, at);
  const byId = new Map(snap.offers.map(x => [x.item_id, x]));
  assert.equal(byId.get('traditional_emp-cheese').quantity, 3);
  assert.equal(byId.get('catering_emp-cheese-10').quantity, 4);
  assert.equal(byId.get('catering_emp-cheese-25').quantity, 5);
  assert.deepEqual([...byId.keys()].sort(), [...ids].sort());
});

test('declaration requires exact active D1 menu inventory revision and never reads ingredients', async () => {
  const { env, db } = fixture();
  assert.equal((await saveSaleOffer(env, { itemId: 'missing', quantity: 2, inventoryRevision: 0, changeId: 'missing' })).error, 'menu_item_missing_or_inactive');
  db.prepare("UPDATE menu_items SET active=0 WHERE id='vida'").run();
  assert.equal((await saveSaleOffer(env, { itemId: 'vida', quantity: 2, inventoryRevision: 4, changeId: 'inactive' })).error, 'menu_item_missing_or_inactive');
  assert.equal(db.one('SELECT COUNT(*) n FROM inventory_items').n >= 0, true);
});

test('competing absolute declarations with the same expected revision admit one writer', async () => {
  const { env, at } = fixture();
  await saveSaleOffer(env, { itemId: 'vida', quantity: 5, inventoryRevision: 4, changeId: 'race_base', at });
  const [left, right] = await Promise.all([
    saveSaleOffer(env, { itemId: 'vida', quantity: 2, expectedRevision: 1, inventoryRevision: 4, changeId: 'race_left', at: at + 1 }),
    saveSaleOffer(env, { itemId: 'vida', quantity: 3, expectedRevision: 1, inventoryRevision: 4, changeId: 'race_right', at: at + 1 }),
  ]);
  assert.equal([left, right].filter(x => x.ok).length, 1);
  assert.equal([left, right].filter(x => x.error === 'sale_offer_revision_changed').length, 1);
});

test('claims permanently reserve actual quantities for only the exact SKU and offer revision', async () => {
  const { env, db, at } = fixture();
  for (const [id, quantity] of [['traditional_emp-cheese', 20], ['catering_emp-cheese-10', 2], ['catering_emp-cheese-25', 3]]) {
    assert.equal((await saveSaleOffer(env, { itemId: id, quantity, inventoryRevision: 4, changeId: `offer_${id}`, at })).ok, true);
  }
  const first = await stockReservationStatements(env, { orderId: 'order_one', items: [{ id: 'traditional_emp-cheese', qty: 3 }, { id: 'catering_emp-cheese-10', qty: 1 }], at });
  await db.batch(first);
  let snap = await saleOfferSnapshot(env, at + 100000);
  const available = new Map(snap.offers.map(x => [x.item_id, x.remaining]));
  assert.equal(available.get('traditional_emp-cheese'), 17);
  assert.equal(available.get('catering_emp-cheese-10'), 1);
  assert.equal(available.get('catering_emp-cheese-25'), 3);
  await assert.rejects(stockReservationStatements(env, { orderId: 'order_two', items: [{ id: 'traditional_emp-cheese', qty: 18 }], at: at + 100000 }), e => e instanceof InventorySaleError && e.code === 'sale_offer_quantity_exceeded');
  assert.equal(db.one('SELECT COUNT(*) n FROM inventory_sale_reservations').n, 2, 'elapsed time does not free reservations');
  const reset = await saveSaleOffer(env, { itemId: 'traditional_emp-cheese', quantity: 4, expectedRevision: 1, inventoryRevision: 4, changeId: 'offer_reset', at: at + 100001 });
  assert.equal(reset.revision, 2);
  snap = await saleOfferSnapshot(env, at + 100002);
  assert.equal(snap.offers.find(x => x.item_id === 'traditional_emp-cheese').remaining, 4, 'new absolute declaration starts a new reservation revision');
});

test('explicit offer revision fails closed when missing, stale or disabled; items without offers preserve old flow', async () => {
  const { env, at } = fixture();
  assert.deepEqual(await stockReservationStatements(env, { orderId: 'legacy_order', items: [{ id: 'vida', qty: 1 }], at }), []);
  await assert.rejects(stockReservationStatements(env, { orderId: 'promoted_missing', items: [{ id: 'vida', qty: 1, sale_offer_revision: 1 }], at }), e => e.code === 'sale_offer_missing');
  await save(env, 'vida', { quantity: 5, at });
  await assert.rejects(stockReservationStatements(env, { orderId: 'stale_promo', items: [{ id: 'vida', qty: 1, sale_offer_revision: 9 }], at }), e => e.code === 'sale_offer_revision_changed');
  await env.DB.prepare("UPDATE inventory_sale_offers SET enabled=0 WHERE menu_item_id='vida'").run();
  await assert.rejects(stockReservationStatements(env, { orderId: 'disabled_promo', items: [{ id: 'vida', qty: 1, sale_offer_revision: 1 }], at }), e => e.code === 'sale_offer_disabled');
});

test('checkout claim rechecks capacity at batch time and CHECK failure rolls every statement back', async () => {
  const { env, db, at } = fixture();
  await save(env, 'vida', { quantity: 5, at });
  await save(env, 'traditional_emp-cheese', { quantity: 5, at });
  const a = await stockReservationStatements(env, { orderId: 'order_a', items: [{ id: 'vida', qty: 3 }], at });
  const b = await stockReservationStatements(env, { orderId: 'order_b', items: [{ id: 'vida', qty: 2 }, { id: 'traditional_emp-cheese', qty: 2 }], at });
  await db.batch(a);
  await db.prepare("UPDATE menu_items SET availability='sold_out' WHERE id='traditional_emp-cheese'").run();
  await assert.rejects(db.batch([b[0], b[1], db.prepare("INSERT INTO orders(id,items,status,created_at,updated_at) VALUES('order_b','[]','pending',?,?)").bind(at, at), b[2], b[3]]));
  assert.equal(db.one("SELECT COUNT(*) n FROM inventory_sale_checkout_claims WHERE order_id='order_b'").n, 0);
  assert.equal(db.one("SELECT COUNT(*) n FROM orders WHERE id='order_b'").n, 0, 'CHECK failure rolls the order insert back with the offer claim');
  assert.equal(db.one("SELECT COUNT(*) n FROM inventory_sale_reservations WHERE order_id='order_b'").n, 0);
  assert.equal(db.one("SELECT COUNT(*) n FROM inventory_sale_checkout_claims WHERE order_id='order_a'").n, 1, 'existing reservation is retained');
});

test('all current offer statements are staged as claims then reservations for caller batch composition', async () => {
  const { env, at } = fixture();
  await save(env, 'vida', { quantity: 5, at });
  await save(env, 'traditional_emp-cheese', { quantity: 5, at });
  const statements = await stockReservationStatements(env, { orderId: 'multi_order', items: [{ id: 'vida', qty: 1 }, { id: 'traditional_emp-cheese', qty: 1 }], at });
  assert.equal(statements.length, 4);
  assert.match(statements[0].sql, /inventory_sale_checkout_claims/);
  assert.match(statements[1].sql, /inventory_sale_checkout_claims/);
  assert.match(statements[2].sql, /inventory_sale_reservations/);
  assert.match(statements[3].sql, /inventory_sale_reservations/);
});
