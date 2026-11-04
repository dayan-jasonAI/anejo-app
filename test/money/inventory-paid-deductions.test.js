import { normalizeQuoteLines } from '../../functions/_lib/catering_quote_lines.js';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { processInventoryDeductionJob, processPaidInventory } from '../../functions/_lib/inventory_deductions.js';
import { saveSaleOffer, saleOfferSnapshot } from '../../functions/_lib/inventory_sales.js';
import { remainingByBowl } from '../../functions/_lib/ondemand.js';

const HAM = 'traditional_croq-jamon';
const HAM_10 = 'catering_croq-jamon-10';

function fixture() { return ownerEnv(); }
function setStock(env, itemId, quantity, { basis = 'physical', countedAt = Date.now() - 60_000, revision = 1 } = {}) {
  env.DB.prepare('UPDATE menu_items SET stock_count=?,stock_count_basis=?,stock_counted_at=?,inventory_revision=?,last_inventory_change_id=NULL WHERE id=?')
    .bind(quantity, basis, countedAt, revision, itemId).run();
}
function order(env, { id, lines, status = 'pending', createdAt = Date.now(), inventoryPaidAt = null, basis = null, fulfillment = 'scheduled', date = '2026-11-04' }) {
  env.DB.prepare(`INSERT INTO orders(id,items,status,created_at,updated_at,fulfillment_mode,delivery_date,inventory_paid_at,inventory_paid_basis)
    VALUES(?,?,?,?,?,?,?,?,?)`).bind(id, JSON.stringify(lines), status, createdAt, createdAt, fulfillment, date, inventoryPaidAt, basis).run();
}
function markPaid(env, id, { at = Date.now(), basis = 'square_capture' } = {}) {
  env.DB.prepare("UPDATE orders SET status='paid',inventory_paid_at=?,inventory_paid_basis=?,updated_at=? WHERE id=?")
    .bind(at, basis, at, id).run();
}
function ledger(env, sourceId, saleId = HAM) {
  return env.DB.one('SELECT * FROM inventory_sale_deductions WHERE source_type=\'order\' AND source_id=? AND sale_item_id=?', sourceId, saleId);
}

test('paid Ham croqueta sale decrements the exact count once and retries are idempotent', async () => {
  const env = fixture();
  const countedAt = Date.now() - 5_000;
  setStock(env, HAM, 20, { countedAt });
  order(env, { id: 'paid-ham-10', lines: [{ id: HAM, name: 'Ham croqueta', qty: 10, price_cents: 150 }], createdAt: countedAt + 100 });
  markPaid(env, 'paid-ham-10', { at: countedAt + 200 });
  const result = await processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'paid-ham-10', actorId: 'test' });
  assert.equal(result.state, 'done');
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 10);
  assert.equal(ledger(env, 'paid-ham-10').deducted_qty, 10);
  const retry = await processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'paid-ham-10', actorId: 'retry' });
  assert.equal(retry.state, 'done');
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 10);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_deductions WHERE source_id='paid-ham-10'").n, 1);
});

test('concurrent processors record one movement for one paid source', async () => {
  const env = fixture();
  const at = Date.now();
  setStock(env, HAM, 20, { countedAt: at - 5000 });
  order(env, { id: 'paid-ham-race', lines: [{ id: HAM, qty: 7 }], createdAt: at - 100 });
  markPaid(env, 'paid-ham-race', { at });
  const results = await Promise.all([
    processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'paid-ham-race', actorId: 'worker-a' }),
    processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'paid-ham-race', actorId: 'worker-b' }),
  ]);
  assert.ok(results.every(result => result.ok));
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 13);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_deductions WHERE source_id='paid-ham-race'").n, 1);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_changes WHERE item_id=? AND action='paid_sale'", HAM).n, 1);
});

test('failure to write the movement ledger rolls back stock and deduction together', async () => {
  const env = fixture();
  const at = Date.now();
  setStock(env, HAM, 12, { countedAt: at - 5000 });
  order(env, { id: 'paid-ham-rollback', lines: [{ id: HAM, qty: 4 }], createdAt: at - 100 });
  markPaid(env, 'paid-ham-rollback', { at });
  env.DB.exec("CREATE TRIGGER reject_paid_inventory_audit BEFORE INSERT ON inventory_changes WHEN NEW.action='paid_sale' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  await assert.rejects(processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'paid-ham-rollback' }));
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 12);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_deductions WHERE source_id='paid-ham-rollback'").n, 0);
  assert.equal(env.DB.one('SELECT state FROM inventory_sale_jobs WHERE source_id=?', 'paid-ham-rollback').state, 'pending');
});

test('paid movement reserves only any remaining live offer capacity, without double-counting prior hold', async () => {
  const env = fixture();
  const t = Date.now();
  setStock(env, HAM, 20, { countedAt: t - 60_000, revision: 1 });
  const first = await saveSaleOffer(env, { itemId: HAM, quantity: 20, enabled: true, inventoryRevision: 1, changeId: 'offer-before-hold', actorId: 'test', at: t - 30_000 });
  assert.equal(first.ok, true);
  order(env, { id: 'held-ham-order', lines: [{ id: HAM, qty: 10 }], createdAt: t - 20_000 });
  env.DB.prepare('INSERT INTO inventory_sale_reservations(order_id,menu_item_id,offer_revision,quantity,reserved_at) VALUES(?,?,?,?,?)')
    .bind('held-ham-order', HAM, first.revision, 10, t - 20_000).run();
  // The kitchen recounts the remaining unreserved units after that hold; it is an absolute new baseline.
  env.DB.prepare("UPDATE menu_items SET stock_count=20,stock_count_basis='unreserved',stock_counted_at=?,inventory_revision=2 WHERE id=?").bind(t - 5_000, HAM).run();
  const second = await saveSaleOffer(env, { itemId: HAM, quantity: 20, enabled: true, expectedRevision: first.revision, inventoryRevision: 2, changeId: 'offer-after-recount', actorId: 'test', at: t - 4_000 });
  assert.equal(second.ok, true);
  markPaid(env, 'held-ham-order', { at: t - 2_000 });
  const result = await processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'held-ham-order' });
  assert.equal(result.state, 'done');
  assert.equal(ledger(env, 'held-ham-order').state, 'covered_by_recount');
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 20);
  const snapshot = await saleOfferSnapshot(env);
  assert.equal(snapshot.offers.find(item => item.item_id === HAM).remaining, 20);
});

test('known package SKU count wins; only an uncounted exact pack can use its catalog retail mapping', async () => {
  const env = fixture();
  const at = Date.now();
  setStock(env, HAM, 30, { countedAt: at - 10_000 });
  setStock(env, HAM_10, 2, { countedAt: at - 10_000 });
  order(env, { id: 'paid-ham-pack-known', lines: [{ id: HAM_10, qty: 1 }], createdAt: at - 5000 });
  markPaid(env, 'paid-ham-pack-known', { at: at - 4000 });
  await processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'paid-ham-pack-known' });
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM_10).stock_count, 1);
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 30);
  assert.equal(ledger(env, 'paid-ham-pack-known', HAM_10).stock_item_id, HAM_10);
  assert.equal(ledger(env, 'paid-ham-pack-known', HAM_10).unit_factor, 1);

  const fallback = fixture();
  setStock(fallback, HAM, 30, { countedAt: at - 10_000 });
  order(fallback, { id: 'paid-ham-pack-fallback', lines: [{ id: HAM_10, qty: 1 }], createdAt: at - 5000 });
  markPaid(fallback, 'paid-ham-pack-fallback', { at: at - 4000 });
  await processInventoryDeductionJob(fallback, { sourceType: 'order', sourceId: 'paid-ham-pack-fallback' });
  assert.equal(fallback.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 20);
  assert.equal(ledger(fallback, 'paid-ham-pack-fallback', HAM_10).stock_item_id, HAM);
  assert.equal(ledger(fallback, 'paid-ham-pack-fallback', HAM_10).unit_factor, 10);
  assert.equal(ledger(fallback, 'paid-ham-pack-fallback', HAM_10).requested_qty, 10);
});

test('no fuzzy custom-name deduction; null baselines stay null; shortages clamp at zero and report', async (t) => {
  await t.test('fuzzy custom name', async () => {
    const env = fixture(); const at = Date.now(); setStock(env, HAM, 20, { countedAt: at - 5000 });
    order(env, { id: 'custom-ham-name', lines: [{ name: 'Ham croqueta', qty: 10 }], createdAt: at - 100 }); markPaid(env, 'custom-ham-name', { at });
    const result = await processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'custom-ham-name' });
    assert.equal(result.state, 'review'); assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 20);
    assert.equal(env.DB.one('SELECT reason FROM inventory_sale_exceptions WHERE source_id=?', 'custom-ham-name')?.reason?.includes('Exact catalog item'), true);
  });
  await t.test('null baseline', async () => {
    const env = fixture(); const at = Date.now(); setStock(env, HAM, null, { countedAt: at - 5000 });
    order(env, { id: 'uncounted-ham-sale', lines: [{ id: HAM, qty: 2 }], createdAt: at - 100 }); markPaid(env, 'uncounted-ham-sale', { at });
    const result = await processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'uncounted-ham-sale' });
    assert.equal(result.state, 'review'); assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, null);
    assert.equal(ledger(env, 'uncounted-ham-sale').state, 'uncounted');
  });
  await t.test('shortage', async () => {
    const env = fixture(); const at = Date.now(); setStock(env, HAM, 3, { countedAt: at - 5000 });
    order(env, { id: 'short-ham-sale', lines: [{ id: HAM, qty: 5 }], createdAt: at - 100 }); markPaid(env, 'short-ham-sale', { at });
    const result = await processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'short-ham-sale' });
    assert.equal(result.state, 'review'); assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 0);
    assert.equal(ledger(env, 'short-ham-sale').deducted_qty, 3); assert.equal(ledger(env, 'short-ham-sale').shortage_qty, 2);
    assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_sale_exceptions WHERE source_id=?', 'short-ham-sale').n, 1);
  });
});

test('fully paid catering quote queues and deducts exact catalog lines only', async () => {
  const env = fixture(); const at = Date.now(); setStock(env, HAM, 20, { countedAt: at - 5000 });
  const normalized=normalizeQuoteLines([{ name:'Ham croqueta',pricing_mode:'catalog',product_id:HAM,qty:4,unit_cents:150,cents:600 }]);
  assert.equal(normalized.ok,true);
  assert.equal(normalized.lines[0].qty,'4','the real quote normalizer stores quantities as text');
  const quoteJson = JSON.stringify({ lines:normalized.lines,delivery_fee_cents:400 });
  env.DB.prepare(`INSERT INTO catering_quotes(id,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,balance_status,terms_version,terms_json,quote_json,created_at,updated_at)
    VALUES('quote-ham-paid',1,1000,0.25,250,750,'unpaid','due','v1','{}',?,?,?)`).bind(quoteJson, at - 4000, at - 4000).run();
  env.DB.prepare("UPDATE catering_quotes SET deposit_status='paid',balance_status='paid',deposit_paid_at=?,balance_paid_at=?,updated_at=? WHERE id='quote-ham-paid'").bind(at - 1000, at, at).run();
  assert.equal(env.DB.one("SELECT state FROM inventory_sale_jobs WHERE source_type='quote' AND source_id='quote-ham-paid'").state, 'pending');
  const result = await processPaidInventory(env);
  assert.equal(result.ok, true); assert.equal(result.processed, 1);
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 16);
  assert.equal(env.DB.one("SELECT sale_qty FROM inventory_sale_deductions WHERE source_type='quote' AND source_id='quote-ham-paid'").sale_qty, 4);
});

test('legacy same-day orders are not counted twice after stock ledger deduction', async () => {
  const env = fixture(); const at = Date.now();
  const { dateStr } = await import('../../functions/_lib/ondemand.js').then(m => m.etParts(new Date(at)));
  setStock(env, HAM, 20, { countedAt: at - 5000 });
  order(env, { id: 'ondemand-ham-paid', lines: [{ id: HAM, qty: 10 }], status: 'paid', createdAt: at - 100, fulfillment: 'on_demand', date: dateStr });
  const adjusted = await processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'ondemand-ham-paid' });
  assert.equal(adjusted.state, 'done');
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 10);
  const remaining = await remainingByBowl(env, dateStr, 10);
  assert.equal(remaining[HAM], 10, 'paid quantity is already reflected in stock_count and must not be subtracted again');
});

test('refund metadata or cancellation does not automatically restock paid food', async () => {
  const env = fixture(); const at = Date.now(); setStock(env, HAM, 15, { countedAt: at - 5000 });
  order(env, { id: 'refund-ham-sale', lines: [{ id: HAM, qty: 5 }], createdAt: at - 100 }); markPaid(env, 'refund-ham-sale', { at });
  await processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'refund-ham-sale' });
  const items = JSON.parse(env.DB.one('SELECT items FROM orders WHERE id=?', 'refund-ham-sale').items);
  items.push({ id: 'meta', name: 'Refunded $7.50', qty: 0, price_cents: 0, meta: { action: 'refund', amount_cents: 750 } });
  env.DB.prepare('UPDATE orders SET items=?,updated_at=? WHERE id=?').bind(JSON.stringify(items), at + 1, 'refund-ham-sale').run();
  await processInventoryDeductionJob(env, { sourceType: 'order', sourceId: 'refund-ham-sale' });
  env.DB.prepare("UPDATE orders SET status='canceled',updated_at=? WHERE id=?").bind(at + 1, 'refund-ham-sale').run();
  assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?', HAM).stock_count, 10);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_deductions WHERE source_id='refund-ham-sale'").n, 1);
  assert.equal(env.DB.one("SELECT COUNT(*) n FROM inventory_sale_jobs WHERE source_id='refund-ham-sale'").n, 1);
});

test('documented meal-plan bowl ids map to their exact canonical catalog recipe', async () => {
  const env=fixture(),at=Date.now();setStock(env,'vida',20,{countedAt:at-1000});
  order(env,{id:'synthetic_plan_day',lines:[{id:'bowl_VIDA',name:'VIDA',qty:2}],createdAt:at});
  markPaid(env,'synthetic_plan_day',{at});
  const result=await processInventoryDeductionJob(env,{sourceType:'order',sourceId:'synthetic_plan_day'});
  assert.equal(result.state,'done');
  assert.equal(env.DB.one("SELECT stock_count FROM menu_items WHERE id='vida'").stock_count,18);
  assert.equal(env.DB.one("SELECT stock_item_id FROM inventory_sale_deductions WHERE source_id='synthetic_plan_day'").stock_item_id,'vida');
});

 test('negotiated catalog quote prices retain explicit stock units', async () => {
  const env=fixture(),at=Date.now();setStock(env,HAM,20,{countedAt:at-5000});
  const normalized=normalizeQuoteLines([{name:'Ham croqueta',pricing_mode:'custom',quantity_basis:'catalog_units',product_id:HAM,qty:6,cents:700}]);
  assert.equal(normalized.ok,true);
  const q=JSON.stringify({lines:normalized.lines});
  env.DB.prepare(`INSERT INTO catering_quotes(id,guests,total_cents,deposit_pct,deposit_cents,balance_cents,deposit_status,balance_status,terms_version,terms_json,quote_json,created_at,updated_at)
    VALUES('negotiated-stock',1,700,1,700,0,'paid','paid','v1','{}',?,?,?)`).bind(q,at,at).run();
  const result=await processInventoryDeductionJob(env,{sourceType:'quote',sourceId:'negotiated-stock'});
  assert.equal(result.state,'done');assert.equal(env.DB.one('SELECT stock_count FROM menu_items WHERE id=?',HAM).stock_count,14);
 });
