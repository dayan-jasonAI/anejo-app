import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { onRequestPost } from '../../functions/api/checkout.js';
import { makeD1 } from '../helpers/d1.js';
const catalog=JSON.parse(readFileSync(new URL('../../docs/menu-corrections/expected.json',import.meta.url)));
const rows=['bowls','drinks','addons'].flatMap((group)=>catalog[group].map(x=>({...x,kind:group==='bowls'?'bowl':group==='drinks'?'drink':'addon',price_cents:Math.round(x.price*100),active:1})));
test('every live catalog SKU reaches the Square adapter at server price and records an order (mock provider)',async()=>{
 const realFetch=globalThis.fetch;let payload;
 globalThis.fetch=async(url,init)=>{assert.match(String(url),/connect.squareupsandbox.com\/v2\/online-checkout\/payment-links$/);payload=JSON.parse(init.body);return new Response(JSON.stringify({payment_link:{id:'mock-link',order_id:'mock-order',url:'https://square.link/u/mock-only'}}));};
 try{for(const row of rows){
  const DB=makeD1([[/SELECT \* FROM menu_items/,()=>rows],[/SELECT key, cents FROM menu_modifier_prices/,()=>[]],[/SELECT key, value FROM app_settings/,()=>[]],[/^INSERT INTO orders/,()=>1]]);
  const d=new Date();d.setUTCDate(d.getUTCDate()+10);if(d.getUTCDay()===0)d.setUTCDate(d.getUTCDate()+1);
  payload=null;
  const body={items:[{id:row.id,qty:1,price_cents:1},{id:'vida',qty:2}],delivery:{date:d.toISOString().slice(0,10),window:'lunch'},contact:{first_name:'Test',email:'test@example.com'},address:{street:'123 Main St',city:'West Palm Beach',zip:'33401'}};
  const response=await onRequestPost({env:{DB,SQUARE_ENV:'sandbox',SQUARE_ACCESS_TOKEN:'mock-only',SQUARE_LOCATION_ID:'mock-only'},request:new Request('https://example.com/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})});
  const result=await response.json();assert.equal(response.status,200,row.id+': '+JSON.stringify(result));assert.equal(payload.order.line_items[0].base_price_money.amount,row.price_cents,row.id);assert.equal(result.url,'https://square.link/u/mock-only');assert.deepEqual(payload.checkout_options.accepted_payment_methods,{apple_pay:true,google_pay:true,cash_app_pay:true});assert.ok(DB.sqlLog().some(s=>s.startsWith('INSERT INTO orders')),row.id+' order log');
 }}finally{globalThis.fetch=realFetch;}
});
