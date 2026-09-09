import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { onRequestPost } from '../../functions/api/checkout.js';
import { loadMenu, publicCatalog } from '../../functions/_lib/menu.js';
const rows=JSON.parse(readFileSync(new URL('../../docs/menu-launch/catalog.json',import.meta.url),'utf8'));
const env={SQUARE_ACCESS_TOKEN:'test-only',SQUARE_LOCATION_ID:'test-only',SQUARE_ENV:'sandbox',DB:{prepare(sql){return {async all(){return {results:sql.includes('menu_items')?rows:[]};}};}}};
test('every launch SKU loads at its approved price and has a local product visual',async()=>{
 const menu=await loadMenu(env);const catalog=publicCatalog(menu);
 assert.equal(catalog.addons.length,rows.length);
 for(const r of rows){assert.equal(menu.nonBowls[r.id].price_cents,r.price_cents);assert.ok(existsSync(new URL('../../public/assets/img/'+r.image,import.meta.url)));}
 assert.equal(menu.nonBowls.traditional_fria.price_cents,550);
 assert.match(rows.find(r=>r.id==='traditional_fria').description,/6 oz/);
 assert.match(rows.find(r=>r.id==='traditional_tamal').description,/3 slices.*5.5 oz/);
 assert.match(rows.find(r=>r.id==='traditional_congri').description,/8 oz/);
});
test('new food SKUs reject same-day checkout before payment or order creation',async()=>{
 for(const id of ['traditional_fria','catering_croq-pollo-25','catering_combo-table10']){
 const res=await onRequestPost({env,request:new Request('https://example.com/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:[{id,qty:1,price_cents:1}],mode:'on_demand'})})});
 assert.equal(res.status,409);assert.match(JSON.stringify(await res.json()),/scheduled delivery/);
 }
});
test('new items fail closed during database outage rather than use stale prices',async()=>{
 const menu=await loadMenu({});assert.equal(menu.nonBowls.traditional_fria,undefined);
});
