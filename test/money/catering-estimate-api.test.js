import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../../functions/api/catering-estimate.js';
const items = JSON.parse(readFileSync(new URL('../../docs/menu-launch/catalog.json', import.meta.url)));
const env = { DB: { prepare: sql => ({ all: async () => ({ results: sql.includes('menu_items') ? items : [] }) }) } };
const call = body => onRequestPost({ env, request: new Request('https://example.com/api/catering-estimate', {method:'POST', body:JSON.stringify(body)}) });
test('estimate API uses live price and no-store, without creating an order', async () => {
  const response = await call({products:[{id:'croqueta',quantity:25,flavor:'ham'}],needs_review:false});
  assert.equal(response.status,200);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  const data=await response.json();
  assert.equal(data.subtotal_cents,4000);
  assert.equal(data.checkout_eligible,true);
  assert.equal(data.minimum_notice_hours,48);
});
test('custom review defaults closed and unpriced Cajita is not silently omitted', async () => {
  const a=await (await call({products:[{id:'croqueta',quantity:25}]})).json();
  assert.equal(a.checkout_eligible,false);
  const b=await (await call({products:[{id:'croqueta',quantity:25},{id:'cajita-standard',quantity:10}],needs_review:false})).json();
  assert.equal(b.checkout_eligible,false);
  assert.equal(b.unpriced[0].id,'cajita-standard');
});
test('estimate API rejects missing, malformed and excessive selections', async () => {
  for(const body of [null,{}, {products:[{id:'croqueta',quantity:5001}]}]) assert.equal((await call(body)).status,400);
});
