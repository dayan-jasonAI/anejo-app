import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ownerEnv } from '../helpers/sqlite-d1.js';
import { onRequestGet } from '../../functions/api/hub/inventory-availability.js';
import { onRequestPost } from '../../functions/api/hub/kitchen/inventory.js';
const request = (query='',role='marketing') => new Request('https://anejo.test/api/hub/inventory-availability'+query,{headers:{Cookie:'anejo_sess=tok-'+role}});
function setup() {
 const env=ownerEnv(),at=Date.now()-1000;
 env.DB.exec("INSERT INTO inventory_items(id,name,unit,on_hand,par_level,active,unit_cost_cents,counted_at,created_at,updated_at) VALUES ('a','Beef','lb',2,3,1,999,"+at+",1,1),('b','Rice','lb',80,2,1,888,NULL,1,1),('c','Rice 100%','lb',4,2,1,777,"+(Date.now()+999999)+",1,1)");
 return env;
}
test('staff reader paginates all records without exposing costs, contacts or history',async()=>{
 const env=setup();let response=await onRequestGet({env,request:request('?limit=1')});
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);
 let body=await response.json();assert.equal(body.next_offset,1);assert.equal(body.items[0].name,'Beef');assert.equal(body.items[0].on_hand.quantity,2);assert.ok(body.read_at);
 const serial=JSON.stringify(body);for(const secret of ['unit_cost_cents','vendor_id','changes','before_json','photo_key','999'])assert.ok(!serial.includes(secret));
 response=await onRequestGet({env,request:request('?limit=2&offset=1')});body=await response.json();assert.equal(body.items.length,2);assert.equal(body.next_offset,null);assert.equal(body.items[0].on_hand.quantity,null);assert.equal(body.items[1].on_hand.status,'invalid_future_count');assert.equal(body.items[1].on_hand.quantity,null);
});
test('literal wildcard and vendor search, parameter bounds and read-only role enforcement',async()=>{
 const env=setup();env.DB.exec("INSERT INTO staff(id,name,email,role,active,created_at,updated_at) VALUES ('v','Restaurant Depot','depot@example.test','vendor',1,1,1);UPDATE inventory_items SET vendor_id='v' WHERE id='a'");
 let response=await onRequestGet({env,request:request('?q=%25')});assert.deepEqual((await response.json()).items.map(x=>x.id),['c']);
 response=await onRequestGet({env,request:request('?q=Depot')});assert.deepEqual((await response.json()).items.map(x=>x.id),['a']);
 for(const q of ['?limit=101','?offset=-1','?section=receipts','?q='+ 'x'.repeat(101)])assert.equal((await onRequestGet({env,request:request(q)})).status,400);
 const write=new Request('https://anejo.test/api/hub/kitchen/inventory',{method:'POST',headers:{Cookie:'anejo_sess=tok-marketing','Content-Type':'application/json'},body:JSON.stringify({action:'count',id:'a',on_hand:99})});assert.equal((await onRequestPost({env,request:write})).status,403);assert.equal(env.DB.one("SELECT on_hand FROM inventory_items WHERE id='a'").on_hand,2);
 assert.equal((await onRequestGet({env,request:new Request('https://anejo.test/api/hub/inventory-availability')})).status,401);
 const at=Date.now();env.SESSIONS.store.set('session:tok-client',JSON.stringify({type:'client',email:'client@example.test',la:at,created:at}));assert.equal((await onRequestGet({env,request:request('','client')})).status,403);
});
test('inventory filtering preserves dirty input nodes and item history while matching vendors',()=>{
 const html=fs.readFileSync(new URL('../../public/hub/kitchen/inventory.html',import.meta.url),'utf8');
 const functionSource=html.slice(html.indexOf('  function filterInventory()'),html.indexOf("  $('#inventory-search').addEventListener"));
 const cards=['a','b'].map(id=>({hidden:false,getAttribute:()=>id}));
 const status={textContent:''};const context={currentItems:[{id:'a',name:'Beef',vendor_name:'Depot'},{id:'b',name:'Rice',vendor_name:'BJ'}],dirtyCards:new Set(['b']),document:{querySelectorAll:selector=>selector==='[data-card]'?cards:[]},$:id=>id==='#inventory-search'?{value:'Depot'}:status};
 vm.runInNewContext(functionSource+'; filterInventory();',context);assert.equal(cards[0].hidden,false);assert.equal(cards[1].hidden,false);assert.match(status.textContent,/Unsaved edits/);
 context.dirtyCards.clear();vm.runInNewContext('filterInventory();',context);assert.equal(cards[1].hidden,true);assert.equal(cards[0].hidden,false);
});
test('supplier counterparties never create staff logins; create and switch preserve historical vendor compatibility',async()=>{
 const env=setup();assert.equal(env.DB.one("SELECT COUNT(*) n FROM staff WHERE role='vendor'").n,0);
 assert.deepEqual(env.DB.rows('SELECT id FROM inventory_suppliers ORDER BY id').map(x=>x.id),['supplier_bjs','supplier_restaurant_depot']);
 const post=body=>onRequestPost({env,request:new Request('https://anejo.test/api/hub/kitchen/inventory',{method:'POST',headers:{Cookie:'anejo_sess=tok-owner','Content-Type':'application/json'},body:JSON.stringify(body)})});
 let response=await post({action:'upsert',name:'Cheese',unit:'oz',vendor_id:'supplier_bjs'});assert.equal(response.status,200);const item=(await response.json()).item;assert.equal(item.supplier_id,'supplier_bjs');assert.equal(item.vendor_id,null);
 response=await post({action:'upsert',id:item.id,name:'Cheese',vendor_id:'supplier_restaurant_depot',expected_revision:0});assert.equal(response.status,200);assert.equal(env.DB.one('SELECT supplier_id FROM inventory_items WHERE id=?',item.id).supplier_id,'supplier_restaurant_depot');
 response=await onRequestGet({env,request:request('?q=Restaurant')});assert.equal((await response.json()).items[0].name,'Cheese');
 assert.equal((await post({action:'upsert',name:'Unknown',vendor_id:'missing'})).status,404);
});
test('historical receipt import is replay-safe and never fabricates current stock',()=>{
 const env=setup(), sql=fs.readFileSync(new URL('../../docs/evidence/inventory-receipts-2026-10-05/bjs9538-cost-import.sql',import.meta.url),'utf8');env.DB.exec(sql);env.DB.exec(sql);
 assert.equal(env.DB.one('SELECT COUNT(*) n FROM inventory_purchase_costs').n,3);assert.equal(env.DB.one('SELECT SUM(paid_line_cents) n FROM inventory_purchase_costs').n,2888);
 for(const item of env.DB.rows("SELECT * FROM inventory_items WHERE id LIKE 'inv_bjs_%'")){assert.equal(item.on_hand,null);assert.equal(item.counted_at,null);assert.equal(item.count_quantity,null);}
 assert.equal(env.DB.one("SELECT on_hand FROM inventory_items WHERE id='a'").on_hand,2);
});
test('paid cost sheet exposes actual numerator/denominators only to kitchen and owner',async()=>{
 const env=setup(),sql=fs.readFileSync(new URL('../../docs/evidence/inventory-receipts-2026-10-05/bjs9538-cost-import.sql',import.meta.url),'utf8');env.DB.exec(sql);
 const {onRequestGet:read}=await import('../../functions/api/hub/kitchen/inventory.js');
 for(const role of ['owner','kitchen']){
  const response=await read({env,request:request('',role)});assert.equal(response.status,200);
  const sheet=(await response.json()).cost_sheet;assert.equal(sheet.status,'available');assert.equal(sheet.lines.length,3);
  const potato=sheet.lines.find(x=>x.item_name.includes('Potatoes'));assert.equal(potato.per_pack_dollars,3.15);assert.equal(potato.per_unit_dollars,0.315);assert.equal(potato.paid_line_cents,1260);assert.equal(potato.current_stock,'unknown_from_receipt');
  const oil=sheet.lines.find(x=>x.item_name.includes('Oil'));assert.equal(oil.per_unit_dollars,null);assert.equal(oil.per_pack_dollars,12.99);
 }
 assert.equal((await read({env,request:request('','marketing')})).status,403);
 const publicRead=await onRequestGet({env,request:request()});assert.ok(!JSON.stringify(await publicRead.json()).includes('paid_line_cents'));
});
