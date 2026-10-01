import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const scope={};vm.runInNewContext(readFileSync(new URL('../../public/assets/js/shop-families.js',import.meta.url),'utf8'),scope);const {group}=scope.AnejoShop;
const items=JSON.parse(readFileSync(new URL('../../docs/menu-launch/live-catalog.json',import.meta.url),'utf8'));const more=JSON.parse(readFileSync(new URL('../../docs/shop-redesign/new-items.json',import.meta.url),'utf8'));const all=[...items.bowls,...items.drinks,...items.addons,...more];const groups=group(all);
test('all purchasable SKUs remain reachable exactly once after grouping',()=>{const ids=groups.flatMap(g=>g.variants.map(i=>i.id));assert.equal(new Set(ids).size,all.length);assert.equal(ids.length,all.length)});
test('flavors collapse into one retail product and one catering product',()=>{assert.equal(groups.filter(g=>g.key==='croquetas').length,1);assert.equal(groups.find(g=>g.key==='croquetas').variants.length,6);assert.equal(groups.find(g=>g.key==='empanadas').variants.length,10);assert.equal(groups.find(g=>g.key==='catering-empanadas').variants.length,20)});
test('sauces and desserts do not clutter meals or Fit',()=>{for(const g of groups){for(const i of g.variants){if(i.id.includes('dip-')||i.id==='sauce_extra')assert.equal(g.category,'sauces');if(i.id.startsWith('traditional_cup-')||i.id.startsWith('traditional_cake-'))assert.equal(g.category,'desserts')}}});
test('meal images and pricing stay attached to their exact SKU',()=>{const ropa=groups.find(g=>g.key==='ropa-vieja-meal');assert.equal(ropa.category,'meals');assert.equal(ropa.variants[0].price_cents,1995);assert.match(ropa.variants[0].image,/ropa-vieja-meal/)});

test('$10 menu filters individual variants by exact live price, without changing product IDs',()=>{
 const rows=[{id:'traditional_meal-tacos-pollo',name:'Chicken tacos',price:10},{id:'traditional_meal-tacos-lechon',name:'Pork tacos',price:12},{id:'traditional_fria',name:'Other',price:9.99},{id:'fit_bad',name:'Unknown',price:NaN}];
 const groups=scope.AnejoShop.tenDollarGroups(rows);
 assert.equal(groups.length,1);assert.deepEqual(Array.from(groups[0].variants,x=>x.id),['traditional_meal-tacos-pollo']);assert.equal(groups[0].variants[0].price,10);
});
