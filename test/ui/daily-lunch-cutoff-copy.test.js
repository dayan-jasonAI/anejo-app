// Runs the standalone shipped page script; does not imply production availability.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../public/assets/js/daily-lunch.js',import.meta.url),'utf8');
class Element{
 constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';this.value='';this.hidden=false;this.elements={qty:{value:'1'}};}
 append(...children){this.children.push(...children);}replaceChildren(...children){this.children=children;}addEventListener(){}
}
const all=n=>[n,...n.children.flatMap(all)];
async function harness(settings){const ids={};const el=id=>ids[id]||(ids[id]=new Element());
 const data={ok:true,today:'2026-10-27',price_cents:1000,delivery_fee_cents:500,settings,days:[{date:'2026-10-28',product_id:'papa',name:'Papa Añejo',enabled:true,orderable:false,reason:'preorder_cutoff'}]};
 const context={document:{getElementById:el,createElement:tag=>new Element(tag)},fetch:async()=>({ok:true,json:async()=>data}),location:{search:''},URLSearchParams};vm.createContext(context);vm.runInContext(source,context);await new Promise(resolve=>setImmediate(resolve));return{el,text:()=>all(el('week-meals')).map(n=>n.textContent).join(' ')};}
test('standalone menu honors preorder-only cutoff without promising same-day recovery',async()=>{
 const h=await harness({same_day_cutoff:'00:00',preorder_cutoff:'22:00'});
 assert.match(h.el('cutoff-copy').textContent,/Order by 10:00 p\.m\. Eastern the day before/);
 assert.match(h.el('cutoff-copy').textContent,/Same-day ordering is unavailable/);
 assert.match(h.text(),/Ordering has closed for this delivery\. Choose another available date/);
 assert.doesNotMatch(h.text(),/Same-day ordering opens/);
});
test('standalone menu preserves existing same-day guidance when that mode is enabled',async()=>{
 const h=await harness({same_day_cutoff:'14:00',preorder_cutoff:'19:00'});
 assert.match(h.el('cutoff-copy').textContent,/Same-day orders close at 2:00 p\.m\./);
 assert.match(h.text(),/Same-day ordering opens/);
});
