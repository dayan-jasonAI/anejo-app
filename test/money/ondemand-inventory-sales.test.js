import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { etParts, remainingByBowl } from '../../functions/_lib/ondemand.js';
import { saveSaleOffer, stockReservationStatements } from '../../functions/_lib/inventory_sales.js';

function fixture() {
  const env = ownerEnv();
  const at = Date.now();
  env.DB.prepare("UPDATE menu_items SET active=1,availability='available',inventory_revision=4,stock_count=20,stock_counted_at=? WHERE id='vida'").bind(at).run();
  env.DB.prepare("UPDATE menu_items SET active=1,availability='available',inventory_revision=4,stock_count=8,stock_counted_at=? WHERE id='fuego'").bind(at).run();
  env.DB.prepare("UPDATE menu_items SET active=1,availability='available',stock_count=NULL WHERE id='mar'").run();
  const date = etParts(new Date(at)).dateStr;
  const paidOrder = (id, items) => env.DB.prepare('INSERT INTO orders(id,items,delivery_date,status,fulfillment_mode,created_at,updated_at) VALUES(?,?,?,\'paid\',\'on_demand\',?,?)').bind(id, JSON.stringify(items), date, at - 1000, at - 1000).run();
  paidOrder('legacy_vida_ten', [{ id: 'vida', qty: 10 }]);
  paidOrder('legacy_fuego_two', [{ id: 'fuego', qty: 2 }]);
  paidOrder('legacy_mar_one', [{ id: 'mar', qty: 1 }]);
  return { env, at, date };
}

test('same-day remainder uses current unreserved sale quantities, reservations, and legacy fallback', async () => {
  const { env, at, date } = fixture();
  const fresh = await saveSaleOffer(env, { itemId:'vida', quantity:20, inventoryRevision:4, changeId:'sale_fresh_vida', actorId:'stf_owner', at });
  assert.equal(fresh.ok, true);
  // An expired declaration for fuego is not eligible to override its legacy count behavior.
  env.DB.prepare('INSERT INTO inventory_sale_offers(menu_item_id,quantity,revision,counted_at,sale_expires_at,inventory_revision,enabled,change_id) VALUES(?,?,?,?,?,?,?,?)')
    .bind('fuego',12,1,at-2000,at-1,4,1,'sale_expired_fuego').run();

  let remaining = await remainingByBowl(env, date, 10);
  assert.equal(remaining.vida, 20, 'paid order from before the absolute declaration is not subtracted twice');
  assert.equal(remaining.fuego, 6, 'expired offers use ordinary finished-count minus legacy orders');
  assert.equal(remaining.mar, 9, 'unpromoted bowls preserve the normal limit minus legacy orders');

  await env.DB.batch(await stockReservationStatements(env, { orderId:'sale_reservation_five', items:[{id:'vida',qty:5}], at:at+1 }));
  remaining = await remainingByBowl(env, date, 10);
  assert.equal(remaining.vida, 15, 'current offer reservations reduce only its unreserved sale quantity');

  await env.DB.batch(await stockReservationStatements(env, { orderId:'sale_reservation_rest', items:[{id:'vida',qty:15}], at:at+2 }));
  remaining = await remainingByBowl(env, date, 10);
  assert.equal(remaining.vida, 0, 'a fully reserved eligible offer is explicitly zero');
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_reservations WHERE menu_item_id='vida'").n, 2);
});
