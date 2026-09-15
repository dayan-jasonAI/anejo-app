import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../../functions/api/catering-estimate.js';
const items = JSON.parse(readFileSync(new URL('../../docs/menu-2026-09/catalog.json', import.meta.url)));
const env = { DB: { prepare: sql => ({ all: async () => ({ results: sql.includes('menu_items') ? items : [] }) }) } };
const call = body => onRequestPost({ env, request: new Request('https://example.com/api/catering-estimate', {method:'POST', body:JSON.stringify(body)}) });
test('estimate API uses live price and no-store, without creating an order', async () => {
  const response = await call({products:[{id:'croqueta',quantity:25,flavor:'ham'}],needs_review:false});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  const data=await response.json();
  // Croquetas sell in boxes of ten from 2026-09, so 25 is two boxes and five singles.
  assert.equal(data.subtotal_cents,2*1000+5*150);
  assert.equal(data.checkout_eligible,true);
  assert.equal(data.minimum_notice_hours,48);
});
// Changed 2026-09-09 (Dayan): an event-level review flag no longer withholds a price and a
// checkout for the food that IS priced — that behaviour is what made his own $1,200 order show
// the customer nothing. What must still hold is that the unpriced line is never hidden and never
// silently sold: it is reported, and the cart contains only the SKUs that were actually priced.
test('priced food stays sellable while the unpriced line is reported, not omitted or sold', async () => {
  const a=await (await call({products:[{id:'croqueta',quantity:25}]})).json();
  assert.equal(a.checkout_eligible,true,'review defaulting on must not withhold standard food');
  // The STANDARD cajita used to stand in for "unpriceable" here. The 2026-09 menu publishes it
  // in trays of 10/25/50, so it prices now — the bespoke one is what still needs a person.
  const b=await (await call({products:[{id:'croqueta',quantity:25},{id:'cajita-custom',quantity:10,notes:'gold foil, her floral theme'}],needs_review:false})).json();
  assert.equal(b.checkout_eligible,true,'the croquetas are buyable even though the bespoke Cajita is not');
  assert.equal(b.needs_review,true,'and the request still says a human has work to do');
  assert.equal(b.unpriced[0].id,'cajita-custom');
  assert.ok(b.items.every(i=>i.id.includes('croq')),'the unpriced Cajita never reaches the cart');
});
test('estimate API rejects missing, malformed and excessive selections', async () => {
  for(const body of [null,{}, {products:[{id:'croqueta',quantity:5001}]}]) assert.equal((await call(body)).status,400);
});
