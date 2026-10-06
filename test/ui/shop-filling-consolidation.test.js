import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const data=JSON.parse(readFileSync(new URL('../../docs/evidence/menu-fillings-2026-10-05/catalog-before.json',import.meta.url),'utf8'));
const items=[...data.bowls,...data.drinks,...data.addons];
const families=readFileSync(new URL('../../public/assets/js/shop-families.js',import.meta.url),'utf8');
const scope={};vm.runInNewContext(families,scope);const shop=scope.AnejoShop,groups=shop.group(items);
test('one papa rellena card offers all seven actual fillings and preserves exact live prices and IDs',()=>{
 const retail=groups.filter(g=>g.category==='appetizers'&&g.key==='papa-rellena');assert.equal(retail.length,1);
 assert.deepEqual(Array.from(retail[0].variants,i=>i.flavor).sort(),['Beef','Cheese','Chicken','Chorizo','Ham','Ham & cheese','Hot dog'].sort());
 const trays=groups.find(g=>g.key==='catering-papa-rellena');assert.equal(trays.variants.length,21);
 for(const i of [...retail[0].variants,...trays.variants]){const original=items.find(x=>x.id===i.id);assert.equal(i.price_cents,original.price_cents);assert.equal(i.available,original.available)}
});
test('croqueta trays retain sauces and exact sizes separately from boxes and dressed croquetas',()=>{
 const tray=groups.find(g=>g.key==='catering-croqueta-platters');assert.equal(tray.variants.length,18);
 assert.deepEqual([...new Set(Array.from(tray.variants,i=>i.format))].sort(),['30 pieces · plated with sauces','60 pieces · plated with sauces','90 pieces · plated with sauces']);
 assert.ok(groups.find(g=>g.key==='catering-croquetas'));assert.ok(groups.find(g=>g.key==='catering-dressed-croquetas'));
});
test('bocadito bread formats and dessert pack counts stay distinct inside consolidated flavor cards',()=>{
 const boca=groups.find(g=>g.key==='bocadito');assert.equal(boca.variants.length,3);assert.equal(new Set(Array.from(boca.variants,i=>i.format)).size,2);
 const dessert=groups.find(g=>g.key==='tres-leches');assert.equal(dessert.variants.length,2);assert.equal(groups.find(g=>g.key==='tres-leches-cake').variants.length,2);
 const trays=groups.find(g=>g.key==='catering-tres-leches');assert.equal(trays.variants.length,6);
 assert.deepEqual([...new Set(Array.from(trays.variants,i=>i.format))].sort(),['10 dessert cups','25 dessert cups','50 dessert cups']);
 assert.equal(shop.resolveGroup(groups,'catering-tres-leches-fresa-cups').key,'catering-tres-leches');
 assert.equal(shop.resolveGroup(groups,'papa-res').key,'papa-rellena');
 assert.equal(groups.find(g=>g.key==='pizza').category,'meals');assert.equal(groups.find(g=>g.key==='pizza').variants.length,2);
});
test('every source SKU remains reachable once; sold-out fillings and prices remain source-controlled',()=>{
 const ids=Array.from(groups.flatMap(g=>g.variants),i=>i.id);assert.equal(ids.length,items.length);assert.equal(new Set(ids).size,items.length);
 const variant={...items.find(i=>i.id==='traditional_papa-res'),available:false,price:3.75,price_cents:375};const grouped=shop.group([variant,items.find(i=>i.id==='traditional_papa-pollo')]);assert.equal(grouped[0].variants[0].available,false);assert.equal(grouped[0].variants[0].price,3.75);
});
test('customizing a mixed-filling order keeps exact SKUs and quantities through add and cart editing',()=>{
 const nodes=new Map();const get=id=>{if(!nodes.has(id))nodes.set(id,{innerHTML:'',textContent:'',value:'',hidden:false,addEventListener(){},showModal(){this.open=true},close(){this.open=false}});return nodes.get(id)};
 const ctx={$:get,CATALOG:[{items:items.map(i=>({...i,descEs:i.desc_es}))}],PRICE:Object.fromEntries(items.map(i=>[i.id,i])),selectedCategory:'sides',isBowl:()=>false,mode:'scheduled',avail:null,addons:{},bowls:[],dailySelection:null,L:(en)=>en,esc:s=>s,escHtml:s=>s,money:n=>'$'+Number(n).toFixed(2),location:{search:''},URLSearchParams,setTimeout(){},document:{addEventListener(){},querySelector(){return {scrollIntoView(){}}}},renderCart(){},setMode(m){ctx.mode=m},remainingFor:()=>10};ctx.window=ctx;ctx.renderCatalog=()=>ctx.renderShopCatalog();
 vm.createContext(ctx);vm.runInContext(families,ctx);vm.runInContext(readFileSync(new URL('../../public/assets/js/shop-order.js',import.meta.url),'utf8'),ctx);
 ctx.openShop('papa-res');assert.match(get('shopApply').textContent,/0.00/);assert.equal(get('shopApply').disabled,true);assert.match(get('shopChoices').innerHTML,/Beef/);ctx.openShop('papa-rellena');assert.match(get('shopChoices').innerHTML,/Ham & cheese/);
 assert.match(get('shopApply').textContent,/0.00/);ctx.shopChange('traditional_papa-res',2);ctx.shopChange('traditional_papa-pollo',1);ctx.applyShop();
 assert.deepEqual(ctx.addons,{'traditional_papa-res':2,'traditional_papa-pollo':1});assert.equal(ctx.mode,'scheduled');
 ctx.editShopItem('traditional_papa-res');ctx.shopChange('traditional_papa-res',-1);ctx.applyShop();assert.deepEqual(ctx.addons,{'traditional_papa-res':1,'traditional_papa-pollo':1});
 ctx.CATALOG[0].items.find(i=>i.id==='traditional_papa-res').available=false;ctx.renderCatalog();ctx.PRICE['traditional_papa-res'].available=false;ctx.openShop('papa-rellena');ctx.shopChange('traditional_papa-res',1);assert.match(get('shopChoices').innerHTML,/Unavailable/);
});
