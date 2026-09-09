import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCateringProducts } from '../../functions/_lib/catering-products.js';
import { cateringPayloadHash } from '../../functions/_lib/catering-request.js';

test('product list keeps duplicate products, different flavors and explicit event totals', () => {
  const result = normalizeCateringProducts([{ id: 'empanada', quantity: 20, flavor: 'guava-cheese' }, { id: 'empanada', quantity: 10, flavor: 'chicken' }, { id: 'congri', quantity: 10 }], ['Cuban Food']);
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 3);
  assert.equal(result.items[1].flavor, 'chicken');
  assert.match(result.summary, /20 pieces \/ unidades/);
  assert.match(result.summary, /Chicken \/ Pollo/);
  assert.match(result.summary, /2 cooked cups/);
});
test('product normalization rejects unknown products, mismatched categories, invalid quantities and flavors', () => {
  for (const input of [[], [{id:'fake',quantity:1}], [{id:'congri',quantity:0}], [{id:'congri',quantity:1.5}], [{id:'congri',quantity:5001}], [{id:'congri',quantity:'2'}], [{id:'empanada',quantity:1,flavor:'fake'}], [{id:'congri',quantity:1,flavor:'ham'}], [{id:'cajita-standard',quantity:1}], [{id:'custom-1',quantity:1}]]) {
    assert.equal(normalizeCateringProducts(input, ['Cuban Food']).ok, false, JSON.stringify(input));
  }
});
test('box variants retain requested changes without guessing kitchen substitutions', () => {
  const result = normalizeCateringProducts([{ id: 'cajita-standard', quantity: 20 }, { id: 'cajita-custom', quantity: 10, notes: 'Sin postre; dos croquetas de jamón.' }], ['Individual Cajitas']);
  assert.equal(result.ok, true);
  assert.match(result.summary, /Sin postre; dos croquetas/);
});
test('old builder submissions remain compatible; product edits change retry fingerprint', async () => {
  assert.equal(normalizeCateringProducts(undefined, []).ok, true);
  assert.notEqual(await cateringPayloadHash({products:[{id:'congri',quantity:1}]}), await cateringPayloadHash({products:[{id:'congri',quantity:2}]}));
});
