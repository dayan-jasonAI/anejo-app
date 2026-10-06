import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const page=readFileSync(new URL('../../public/order.html',import.meta.url),'utf8');
const code=page.slice(page.indexOf('async function applyPromo()'),page.indexOf('// ---- Campaign attribution'));
function setup(fetch){const nodes={promoInput:{value:'FIRSTORDERVITIAN'},promoApply:{disabled:false},custEmail:{value:'guest@example.test'},custPhone:{value:''}};const ctx={$:id=>nodes[id],fetch,appliedPromo:null,cartSubtotalCents:()=>5000,L:en=>en,showPromoMsg(){},renderCart(){ctx.renders++;},renders:0};vm.createContext(ctx);vm.runInContext(code,ctx);return ctx;}
test('delayed automatic account benefit cannot replace an explicitly applied checkout promo',async()=>{let resolve;const ctx=setup(()=>new Promise(r=>{resolve=r}));const pending=ctx.loadAutoPromo();ctx.appliedPromo={ok:true,code:'FIRSTORDERVITIAN',pct_off:10,auto:false};resolve({json:async()=>({ok:true,auto:true,code:'FOUND-TEST',points_mult:2})});await pending;assert.equal(ctx.appliedPromo.code,'FIRSTORDERVITIAN');assert.equal(ctx.renders,0);});
test('manual promo request carries guest identity and preserves exact returned code',async()=>{let payload;const ctx=setup(async(_url,args)=>{payload=JSON.parse(args.body);return {json:async()=>({ok:true,code:'FIRSTORDERVITIAN',pct_off:10})}});await ctx.applyPromo();assert.equal(payload.code,'FIRSTORDERVITIAN');assert.equal(payload.contact.email,'guest@example.test');assert.equal(ctx.appliedPromo.code,'FIRSTORDERVITIAN');assert.equal(ctx.renders,1);});
test('automatic benefit still appears when no explicit promo is selected',async()=>{const ctx=setup(async()=>({json:async()=>({ok:true,auto:true,code:'FOUND-TEST',points_mult:2})}));await ctx.loadAutoPromo();assert.equal(ctx.appliedPromo.code,'FOUND-TEST');assert.equal(ctx.renders,1);});
