import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseInventoryCountCommand, previewInventoryCount } from '../../functions/_lib/operator_inventory.js';

test('exact English and Spanish commands retain quantity and unit without conversion', () => {
  assert.deepEqual(parseInventoryCountCommand('count inventory inv_beef: 2.5 lb'), { id: 'inv_beef', on_hand: 2.5, unit: 'lb' });
  assert.deepEqual(parseInventoryCountCommand('contar inventario inv-box: 0 ea'), { id: 'inv-box', on_hand: 0, unit: 'ea' });
});

test('ambiguous, compound, negative, oversized and invented command syntax is rejected', () => {
  for (const command of [null, '', 'count inventory beef: -2 lb', 'count inventory beef: +2 lb',
    'count inventory beef: 2e3 lb', 'count inventory beef: 1,000 lb',
    'count inventory beef: 2 lb and order more', 'count inventory beef: 2 lb\n',
    'count inventory beef: 2 lb; send notification', 'count inventory beef: 2',
    'count inventory beef: 1000001 lb', 'count inventory beef: 0.0000001 lb',
    'count inventory red pepper: 2 lb', 'count inventory ' + 'x'.repeat(300) + ': 1 ea']) {
    assert.equal(parseInventoryCountCommand(command), null, String(command));
  }
});

function fixture(item, fail = false) {
  return { DB: { prepare(sql) {
    assert.equal(sql, 'SELECT id,name,unit,on_hand,revision FROM inventory_items WHERE id=? AND active=1');
    return { bind(id) {
      assert.equal(id, 'inv_beef');
      return { first: async () => { if (fail) throw Error('db'); return item; } };
    } };
  } } };
}
const item = { id: 'inv_beef', name: 'Beef', unit: 'lb', on_hand: 5, revision: 8, count_quantity: 6, total_weight_grams: 99 };

test('read-only preview pins exact active id, revision and read time; no count or weight conversion', async () => {
  const result = await previewInventoryCount(fixture(item), 'count inventory inv_beef: 2.5 lb', 1234);
  assert.deepEqual(result, { ok: true, preview: { id: 'inv_beef', name: 'Beef', on_hand: 2.5, unit: 'lb', expected_revision: 8, read_at: 1234 }, previous_on_hand: 5 });
  assert.equal(result.preview.count_quantity, undefined);
  assert.equal(result.preview.total_weight_grams, undefined);
  assert.equal(item.count_quantity, 6);
});

test('no match, database failure, missing revision and nonmatching units fail closed', async () => {
  assert.equal((await previewInventoryCount(fixture(null), 'count inventory inv_beef: 2 lb')).error, 'inventory_item_not_found');
  assert.equal((await previewInventoryCount(fixture(item, true), 'count inventory inv_beef: 2 lb')).error, 'inventory_read_failed');
  for (const revision of [undefined, null, -1, 1.5, '8']) {
    assert.equal((await previewInventoryCount(fixture({ ...item, revision }), 'count inventory inv_beef: 2 lb')).error, 'inventory_revision_unavailable');
  }
  for (const unit of ['kg', 'LB', 'pounds', 'invented']) {
    assert.equal((await previewInventoryCount(fixture(item), 'count inventory inv_beef: 2 ' + unit)).error, 'inventory_unit_mismatch');
  }
});
