// Runs the shipped menu module and the actual shared checkout function with DOM/HTTP doubles.
// These tests prove client behavior, not browser appearance, payment completion or production state.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../public/assets/js/shop-daily-lunch.js',import.meta.url),'utf8');
const order=readFileSync(new URL('../../public/order.html',import.meta.url),'utf8');
const menu={ok:true,today:'2026-10-01',settings:{preorder_cutoff:'19:00',same_day_cutoff:'11:00'},delivery_fee_cents:500,windows:{lunch_start:'11:00',lunch_end:'14:00'},days:[
 {date:'2026-09-30',product_id:'pechuguitas',name:'Pechuguitas',enabled:true,orderable:false,reason:'past'},
 {date:'2026-10-01',product_id:'papa',name:'Papa Añejo',description:'Potato',enabled:true,orderable:true,free_delivery:false,image_url:'/papa.png'},
 {date:'2026-10-02',product_id:null,enabled:false,orderable:false},
 {date:'2026-10-05',product_id:'fried_rice',name:'Añejo Fried Rice',enabled:true,orderable:true,free_delivery:true}
]};
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.style={};this.textContent='';this.value='';this.disabled=false;this.hidden=false;this.classList={add(){},remove(){}};}
 append(...c){this.children.push(...c);} replaceChildren(...c){this.children=c;} setAttribute(k,v){this[k]=v;} focus(){this.focused=true;}
}
const descendants=n=>n.children.flatMap(c=>[c,...descendants(c)]);
async function harness({confirm=true,failed=false,search='',response=menu}={}){
 const ids={},calls=[],mode=new Element();let confirmations=0,resets=0;
 const el=id=>ids[id]||(ids[id]=new Element());
 const ctx={URLSearchParams,document:{getElementById:el,createElement:tag=>new Element(tag),querySelector:()=>mode,querySelectorAll:()=>[]},$:el,L:en=>en,money:n=>'$'+n.toFixed(2),selectedCategory:'daily',bowls:[],addons:{},dailySelection:null,rewardsRedeemPts:0,appliedPromo:null,rewardsFreeDeliv:false,TAX_PCT:7,lastSubtotalCents:0,confirm:()=>{confirmations++;return confirm;},resetAddressConfirmation:()=>{resets++;ctx.addressConfirmed=false;},shopReview(){},applyMode(){ctx.renderCart();},renderCart(){if(ctx.dailySelection)ctx.renderDailyCart();},renderCatalog(){ctx.renderDailyCategory();},fetch:async(url,opts)=>{calls.push({url,opts});return {ok:!failed,json:async()=>structuredClone(response)};},location:{search},mode:'scheduled',addressConfirmed:false,anejoAttr:null,hideAddressCheck(){},loadAvailability(){},sessionStorage:{setItem(){},removeItem(){}}};
 ctx.window=ctx;vm.createContext(ctx);vm.runInContext(source,ctx);await new Promise(resolve=>setImmediate(resolve));
 return {ctx,el,calls,mode,confirmations:()=>confirmations,resets:()=>resets,all:()=>descendants(el('catalog'))};
}
const add=h=>h.all().find(e=>e.tagName==='button');
const dateSelect=h=>h.all().find(e=>e.tagName==='select');
test('Oct 1 selects Papa and renders exactly one dated meal card, with no unscheduled dates offered',async()=>{
 const h=await harness();assert.equal(h.all().filter(e=>e.tagName==='article').length,1);assert.equal(h.all().find(e=>e.tagName==='h2').textContent,'Papa Añejo');
 const select=dateSelect(h);assert.equal(select.value,'2026-10-01');assert.deepEqual(select.children.map(e=>e.value),['2026-10-01','2026-10-05']);
 select.value='2026-10-05';select.onchange();assert.equal(h.all().filter(e=>e.tagName==='article').length,1);assert.equal(h.all().find(e=>e.tagName==='h2').textContent,'Añejo Fried Rice');
});
test('shared cart accepts one $10 lunch below standard minimum and shows date, fee and tax',async()=>{
 const h=await harness();add(h).onclick();assert.equal(h.ctx.dailySelection.day.date,'2026-10-01');assert.equal(h.ctx.dailySelection.qty,1);
 assert.equal(h.el('cartSubtotal').textContent,'$10.00');assert.equal(h.el('cartFee').textContent,'$5.00');assert.equal(h.el('cartGrand').textContent,'$15.70');assert.equal(h.el('minNote').style.display,'none');assert.equal(h.el('checkoutBtn').disabled,false);assert.equal(h.mode.hidden,true);assert.equal(h.el('schedFields').hidden,true);
 const select=dateSelect(h);select.value='2026-10-05';select.onchange();add(h).onclick();assert.equal(h.el('cartFee').textContent,'Free');assert.equal(h.el('cartGrand').textContent,'$10.70');
});
test('declining replacement preserves bowls, addons and existing daily selection',async()=>{
 const h=await harness({confirm:false});h.ctx.bowls.push({key:'bowl'});h.ctx.addons.drink=2;const prior={day:{date:'2026-10-05'},qty:2};h.ctx.dailySelection=prior;
 add(h).onclick();assert.equal(h.confirmations(),1);assert.equal(h.ctx.bowls.length,1);assert.equal(h.ctx.addons.drink,2);assert.equal(h.ctx.dailySelection,prior);assert.equal(h.resets(),0);
 assert.equal(h.ctx.clearDailyForOther(),false);assert.equal(h.ctx.dailySelection,prior);
});
test('approved replacement clears competing cart and stale promotion/address state',async()=>{
 const h=await harness();h.ctx.bowls.push({key:'bowl'});h.ctx.addons.drink=2;h.ctx.rewardsRedeemPts=50;h.ctx.appliedPromo={code:'OLD'};h.ctx.addressConfirmed=true;
 add(h).onclick();assert.equal(h.confirmations(),1);assert.equal(h.ctx.bowls.length,0);assert.equal(Object.keys(h.ctx.addons).length,0);assert.equal(h.ctx.rewardsRedeemPts,0);assert.equal(h.ctx.appliedPromo,null);assert.equal(h.ctx.addressConfirmed,false);
 assert.equal(h.ctx.clearDailyForOther(),true);assert.equal(h.ctx.dailySelection,null);
});
test('invalid quantity and failed availability cannot create a daily cart',async()=>{
 const h=await harness();const input=h.all().find(e=>e.tagName==='input');input.value='1.5';add(h).onclick();assert.equal(h.ctx.dailySelection,null);assert.equal(input.focused,true);
 const failed=await harness({failed:true});assert.equal(failed.all().some(e=>e.tagName==='button'),false);assert.match(failed.el('catalog').children[0].textContent,/could not be confirmed/);
});
test('actual shared checkout sends dated daily-only payload and respects unchecked consents',async()=>{
 const h=await harness();add(h).onclick();
 for(const [id,value] of Object.entries({custName:'Test',custEmail:'test@example.com',custPhone:'',addrStreet:'1 Test St',addrUnit:'',addrCity:'West Palm Beach',addrState:'FL',addrZip:'33401',addrNotes:''}))h.el(id).value=value;
 h.el('smsConsent').checked=false;h.el('mktgSmsConsent').checked=false;
 const checkout=order.slice(order.indexOf('async function checkout(){'),order.indexOf('\nasync function loadRewards(){'));
 assert.ok(checkout.includes('payload.daily_lunch'));new vm.Script(checkout);vm.runInContext(checkout,h.ctx);
 let payload;h.ctx.fetch=async(url,opts)=>{assert.equal(url,'/api/checkout');payload=JSON.parse(opts.body);return {ok:true,status:200,json:async()=>({url:'https://example.com/test-checkout'})};};
 await h.ctx.checkout();assert.deepEqual(payload.items,[{id:'daily_lunch_papa',qty:1}]);assert.deepEqual(payload.daily_lunch,{date:'2026-10-01'});assert.deepEqual(payload.delivery,{date:'2026-10-01',window:'lunch'});assert.equal(payload.contact.sms_consent,false);assert.equal(payload.contact.marketing_sms_consent,false);assert.equal('address_confirmed' in payload,false);assert.equal(h.ctx.location.href,'https://example.com/test-checkout');
});

test('a future dated link fetches that date range and selects the requested lunch',async()=>{
 const response=structuredClone(menu);response.days=response.days.filter(d=>d.date==='2026-10-05');
 const h=await harness({search:'?category=daily&date=2026-10-05',response});
 assert.equal(h.calls[0].url,'/api/daily-lunch?start=2026-10-05');
 assert.equal(dateSelect(h).value,'2026-10-05');assert.equal(h.all().find(e=>e.tagName==='h2').textContent,'Añejo Fried Rice');
 add(h).onclick();assert.equal(h.ctx.dailySelection.day.date,'2026-10-05');assert.equal(h.el('cartFee').textContent,'Free');
});
test('a malformed date query cannot change the availability request range',async()=>{
 const h=await harness({search:'?category=daily&date=garbage%26start%3D2026-10-05'});
 assert.equal(h.calls[0].url,'/api/daily-lunch');assert.equal(dateSelect(h).value,'2026-10-01');
});
