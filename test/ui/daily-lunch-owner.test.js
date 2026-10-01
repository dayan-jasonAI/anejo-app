// Executes the actual owner editor. Minimal DOM doubles cover event/state behavior,
// not browser appearance, authentication, HTTP persistence, or live acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../public/hub/owner/assets/daily-lunch.js',import.meta.url),'utf8');
const base={products:[{id:'fried_rice',name:'Rice',description:'House rice',image_url:null},{id:'papa',name:'Papa',description:'Potato',image_url:null}],settings:{same_day_cutoff:'11:00',preorder_cutoff:'19:00'},weekdays:[{dow:1,product_id:'fried_rice',enabled:true},{dow:2,product_id:'papa',enabled:true}],dates:[{date:'2026-10-05',product_id:'papa',enabled:false,sold_out:true}]};
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.value='';this.disabled=false;this.textContent='';}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
}
const descendants=n=>n.children.flatMap(c=>[c,...descendants(c)]);
async function harness(){
 const ids={};for(const id of ['editor','products','weekdays','dates','same-cutoff','pre-cutoff','status','add-product','add-weekday','new-weekday','add-date','assign','assign-week','reload','save'])ids[id]=new Element(['same-cutoff','pre-cutoff','assign-week','new-weekday'].includes(id)?'input':['reload','save','add-product','add-weekday','add-date','assign'].includes(id)?'button':'div');
 ids.editor.append(...Object.entries(ids).filter(([id])=>id!=='editor'&&id!=='status').map(([,el])=>el));
 let load,resolvePost;const calls=[],events={};let confirmCount=0;
 const controls=()=>descendants(ids.editor).filter(n=>['input','select','textarea','button'].includes(n.tagName));
 vm.runInNewContext(source,{document:{getElementById:id=>ids[id],createElement:tag=>new Element(tag),createTextNode:text=>Object.assign(new Element('text'),{textContent:text}),querySelectorAll:()=>controls()},Option:function(text,value){const e=new Element('option');e.textContent=text;e.value=value;return e;},Owner:{init(_section,fn){load=fn();}},Hub:{api:async(url,opts)=>{calls.push({url,opts:opts?structuredClone(opts):null});if(!opts)return {ok:true,version:3,config:structuredClone(base)};return await new Promise(resolve=>{resolvePost=resolve;});}},window:{addEventListener:(name,fn)=>events[name]=fn},confirm:()=>{confirmCount++;return false;},Date,Error,Number});
 await load;return {ids,calls,events,controls,finish:r=>resolvePost(r),confirmCount:()=>confirmCount};
}
function nameField(h){return h.ids.products.children[0].children[1].children[0];}
test('save locks all editor controls while pending, then renders saved revision and unlocks replacement controls',async()=>{
 const h=await harness();const input=nameField(h);input.value='Updated rice';input.oninput();
 const saving=h.ids.save.onclick();assert.ok(h.controls().length>10);assert.equal(h.controls().every(n=>n.disabled),true);assert.equal(h.calls.length,2);
 await h.ids.save.onclick();assert.equal(h.calls.length,2,'second save must not issue a competing request');
 const sent=h.calls[1].opts.body;assert.equal(sent.version,3);assert.equal(sent.config.products[0].name,'Updated rice');
 h.finish({ok:true,version:4,config:sent.config});await saving;
 assert.match(h.ids.status.textContent,/Saved revision 4/);assert.equal(h.controls().every(n=>!n.disabled),true);assert.equal(nameField(h).value,'Updated rice');
 let prevented=false;h.events.beforeunload({preventDefault(){prevented=true;}});assert.equal(prevented,false,'only verified save clears dirty state');
});
test('conflict response preserves editable unsaved content and dirty protection without claiming success',async()=>{
 const h=await harness();nameField(h).value='Unsaved family recipe';nameField(h).oninput();const saving=h.ids.save.onclick();
 h.finish({error:'Menu changed. Reload before saving.'});await saving;
 assert.equal(nameField(h).value,'Unsaved family recipe');assert.match(h.ids.status.textContent,/Save not verified/);assert.equal(h.controls().every(n=>!n.disabled),true);
 let prevented=false;h.events.beforeunload({preventDefault(){prevented=true;}});assert.equal(prevented,true);
 h.ids.reload.onclick();assert.equal(h.confirmCount(),1);assert.equal(h.calls.length,2,'declining discard does not fetch or replace unsaved state');
});
test('assigning a template week preserves existing date exceptions and stable IDs are not editable',async()=>{
 const h=await harness();h.ids['assign-week'].value='2026-10-05';h.ids.assign.onclick();h.ids.assign.onclick();
 const editable=descendants(h.ids.products).filter(n=>['input','textarea','select'].includes(n.tagName));
 assert.equal(editable.some(n=>n.value==='fried_rice'||n.value==='papa'),false,'product IDs appear as labels, not fields');
 assert.equal(h.ids.products.children[0].children[0].textContent,'Meal ID: fried_rice');
 nameField(h).value='New display name';nameField(h).oninput();const saving=h.ids.save.onclick();const sent=h.calls[1].opts.body.config;
 assert.deepEqual(sent.dates,[{date:'2026-10-05',product_id:'papa',enabled:false,sold_out:true},{date:'2026-10-06',product_id:'papa',enabled:true,sold_out:false}]);
 assert.equal(sent.products[0].id,'fried_rice');assert.equal(sent.products[0].name,'New display name');
 h.finish({ok:true,version:4,config:sent});await saving;
});
