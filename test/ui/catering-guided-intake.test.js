import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { cateringProducts } from '../../public/assets/js/catering-products-catalog.js';
import { CAJITA_FLAVORS, CAJITA_DEFAULT_FLAVORS } from '../../functions/_lib/cajita-food-options.js';

const source = readFileSync(new URL('../../src/catering-products.js', import.meta.url), 'utf8')
  .replace(/^import .*;\n/gm, '').split("form.addEventListener('input', queueEstimate);")[0];
function fixture(lang='en') {
  class Element {
    constructor(tag='div') {this.tagName=tag;this.children=[];this.listeners={};this.attributes={};this.style={};this.value='';this.isConnected=true;this._text='';this.classList={add(){},remove(){}};}
    append(...nodes){this.children.push(...nodes);}
    replaceChildren(...nodes){this.children=nodes;}
    set textContent(v){this._text=v;this.children=[];}
    get textContent(){return String(this._text)+this.children.map(x=>x.textContent).join('');}
    setAttribute(k,v){this.attributes[k]=v;}
    addEventListener(k,fn){(this.listeners[k] ||= []).push(fn);}
    fire(k){for(const fn of this.listeners[k]||[])fn({stopPropagation(){}});}
    querySelectorAll(selector){return flatten(this).filter(x=>selector.startsWith('.')&&x.className?.split(' ').includes(selector.slice(1)));}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    scrollIntoView(){}
    focus(){this.focused=true;}
    insertAdjacentElement(_where,node){this.append(node);}
  }
  const flatten=node=>node.children.flatMap(x=>[x,...flatten(x)]);
  const nodes=new Map();
  const get=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
  get('guests').value='35';
  const form=get('cateringForm');
  const menuControls=[{value:'Cuban Food',disabled:false}];
  form.querySelectorAll=s=>s.includes('menu_option')?menuControls:[];
  const listeners={};
  const document={getElementById:get,createElement:tag=>new Element(tag),documentElement:{lang},head:new Element(),addEventListener:(type,fn)=>{(listeners[type] ||= []).push(fn);},dispatchEvent:event=>{for(const fn of listeners[event.type]||[])fn(event);}};
  const ctx=vm.createContext({document,cateringProducts,CAJITA_FLAVORS,CAJITA_DEFAULT_FLAVORS,Intl,setTimeout,clearTimeout,console,CustomEvent});
  vm.runInContext(source,ctx);
  ctx.originalRender=vm.runInContext('render',ctx);
  const full=readFileSync(new URL('../../src/catering-products.js',import.meta.url),'utf8');
  vm.runInContext(full.slice(full.indexOf("document.addEventListener('anejo:langchange'"),full.indexOf('// Deep link from the menu:')),ctx);
  vm.runInContext('render = () => {};',ctx); // Observe handlers without starting pricing requests.
  const run=code=>vm.runInContext(code,ctx);
  const catalog={live:true,deposit_pct:.5,products:[
    {id:'croqueta',custom:false,flavors:{ham:{from_cents:100,packs:[{size:10,cents:1000},{size:1,cents:150}]}}},
    {id:'lechon',from_cents:300,packs:[{size:10,cents:3000}]},
    {id:'congri',from_cents:100,packs:[{size:10,cents:1000}]},
    {id:'cup-fresa',from_cents:400,packs:[{size:10,cents:4000}]},
  ]};
  ctx.sampleCatalog=catalog;
  run('catalog=sampleCatalog;');
  return {get,run,flatten,Element,document,menuControls,find:(node,text)=>flatten(node).find(x=>x.tagName==='button'&&x.textContent.includes(text)),lang:next=>{document.documentElement.lang=next;}};
}

test('guest suggestion is explicit and never overwrites deliberately entered quantity, flavor or notes',()=>{
  const f=fixture();
  const panel=f.run("picker(productFor('croqueta'),catalogFor('croqueta'))");
  const qty=f.flatten(panel).find(x=>x.tagName==='input');
  assert.equal(qty.value,'');
  const use=f.find(panel,'Use guest count');use.fire('click');
  assert.equal(qty.value,'35');
  qty.value='12';qty.fire('input');
  const notes=f.flatten(panel).find(x=>x.tagName==='textarea');notes.value='Separate sauce';notes.fire('input');
  const select=f.flatten(panel).find(x=>x.tagName==='select');select.value='chicken';select.fire('change');
  f.get('guests').value='50';
  f.lang('es');
  const refreshed=f.run("picker(productFor('croqueta'),catalogFor('croqueta'))");
  assert.equal(f.flatten(refreshed).find(x=>x.tagName==='input').value,'12');
  assert.equal(f.flatten(refreshed).find(x=>x.tagName==='select').value,'chicken');
  assert.equal(f.flatten(refreshed).find(x=>x.tagName==='textarea').value,'Separate sauce');
  assert.ok(f.find(refreshed,'Usar número de invitados · 50'));
  assert.equal(f.run('cart.length'),0);
});

test('signature suggestion uses a published flavor and exact live pack cost, adds only by explicit choice',()=>{
  const f=fixture();const box=new f.Element();f.run('renderGuidance')(box);
  assert.equal(f.run('cart.length'),0);
  const add=f.find(box,'Add 35 ham croquetas');assert.ok(add);assert.match(add.textContent,/\$37.50/);
  add.fire('click');
  assert.equal(f.run('cart[0].quantity'),35);
  assert.equal(f.run('cart[0].flavor'),'ham');
  assert.equal(f.run('cart[0].id'),'croqueta');
  const after=new f.Element();f.run('renderGuidance')(after);
  assert.ok(!f.find(after,'Add 35 ham croquetas'));
  add.fire('click');assert.equal(f.run('cart.length'),1,'stale button cannot add twice');
});

test('unpriced, unavailable and missing headcounts never invent a priced one-per-guest offer',()=>{
  const f=fixture();
  for(const setup of ['catalog.live=false','catalog.live=true;catalog.products[0].flavors.ham.packs=[]']) {
    f.run(setup);const box=new f.Element();f.run('renderGuidance')(box);assert.ok(!f.find(box,'Add 35'));
  }
  f.run('catalog=sampleCatalog;catalog.products[0].flavors.ham.packs=[{size:10,cents:1000}]');
  const unpriceable=new f.Element();f.run('renderGuidance')(unpriceable);assert.ok(!f.find(unpriceable,'Add 35'));
  f.get('guests').value='';const missing=new f.Element();f.run('renderGuidance')(missing);
  assert.ok(f.find(missing,'Explore croquetas'));assert.equal(f.run('cart.length'),0);
});

test('mixed-menu quantity difference is advisory and dessert/side exploration never adds food',()=>{
  const f=fixture();f.run("cart=[{uid:1,id:'lechon',category:'Cuban Food',quantity:10,notes:''}]");
  const summary=new f.Element();f.run('renderSummary')(summary);
  assert.match(summary.textContent,/10 total selected for this dish · 35 guests/);
  assert.match(summary.textContent,/may be intentional for a mixed menu/);
  const box=new f.Element();f.run('renderGuidance')(box);
  const dessert=f.find(box,'Optional sweet finish');assert.ok(dessert);dessert.fire('click');
  assert.equal(f.run('open'),'cup-fresa');assert.equal(f.run('cart.length'),1);
  assert.ok(f.find(box,'Explore a side'));
});

test('deposit action calls the existing booking handler and retains required-details guard',()=>{
  const f=fixture();f.run('estimate={checkout_eligible:true,total_cents:10000};');
  const box=new f.Element();f.run('renderPay')(box);
  const deposit=f.find(box,'Hold the date');assert.ok(deposit);
  assert.doesNotThrow(()=>deposit.fire('click'));
  assert.equal(f.get('name').focused,true);
  assert.match(deposit.textContent,/50% deposit, \$50.00/);
});


test('language refresh is allowed for incomplete Add-disabled picker but blocked for submission retry and payment',()=>{
  const f=fixture();
  f.run('globalThis.refreshes=0;render=()=>{refreshes++;};');
  const incomplete=f.run("picker(productFor('croqueta'),catalogFor('croqueta'))");
  assert.equal(f.find(incomplete,'Add to quote').disabled,true);
  f.get('quote-products').append(incomplete);
  f.document.dispatchEvent(new CustomEvent('anejo:langchange'));
  assert.equal(f.run('refreshes'),1,'an ordinary disabled Add action is not a submission lock');
  f.menuControls[0].disabled=true;
  f.document.dispatchEvent(new CustomEvent('anejo:langchange'));
  assert.equal(f.run('refreshes'),1,'uncertain submission keeps actual controls frozen');
  f.menuControls[0].disabled=false;
  for(const id of ['name','email','event-date','guests'])f.get(id).value=id==='guests'?'35':'test';
  f.run('fetch=()=>new Promise(()=>{});');
  const pay=new f.Element('button');f.run('bookDeposit')(pay);
  assert.equal(f.run('paymentPending'),true);
  f.document.dispatchEvent(new CustomEvent('anejo:langchange'));
  assert.equal(f.run('refreshes'),1,'in-flight deposit keeps controls frozen');
});

test('render emits one read-only cart refresh event and locked render emits none',()=>{
  const f=fixture();let events=0;let payload;
  f.document.addEventListener('anejo:catering-cartchange',e=>{events++;payload=e.detail.products;});
  f.run("queueEstimate=()=>{};cart=[{uid:1,id:'lechon',category:'Cuban Food',quantity:20,notes:''}];originalRender();");
  assert.equal(events,1);
  assert.equal(payload[0].id,'lechon');assert.equal(payload[0].quantity,20);
  payload[0].quantity=999;
  assert.equal(f.run('cart[0].quantity'),20,'event listeners receive a copy, never live cart objects');
  f.menuControls[0].disabled=true;f.run('originalRender();');assert.equal(events,1);
});
