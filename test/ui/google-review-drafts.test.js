import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../../public/hub/owner/assets/google-review-drafts.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function harness(replies){
 const nodes=[],calls=[];
 function node(tag){const n={tag,children:[],value:'',setAttribute(k,v){this[k]=v;},append(...children){this.children.push(...children);},replaceChildren(...children){this.children=children;},querySelectorAll(){return nodes.filter(n=>['button','input','textarea','select'].includes(n.tag));},reset(){nodes.forEach(n=>{if(['input','textarea','select'].includes(n.tag))n.value='';});},focus(){}};nodes.push(n);return n;}
 const root=node('main');root.id='owner-root';
 vm.runInNewContext(code,{document:{createElement:node,getElementById:id=>nodes.find(n=>n.id===id)},Owner:{MARKETING_DESK:['owner','marketing'],init:(name,fn)=>fn()},Hub:{api:async(path,options)=>{calls.push({path,options});return replies.shift();}},crypto:{randomUUID:()=> 'test-request-123456789'},window:{confirm:()=>false}});
 return{nodes,calls,field:id=>nodes.find(n=>n.id===id),button:text=>nodes.find(n=>n.textContent===text)};
}
test('storage failure is visible, failed save preserves proposed text and never attempts provider action',async()=>{
 const h=harness([{ok:false,error:'Storage offline'},{ok:false,error:'Draft could not save'}]);await tick();
 assert.equal(h.field('review-storage').textContent,'Storage offline');
 h.field('review_text').value='Sample feedback';h.field('proposed_reply').value='Proposed response';
 await h.field('review-form').onsubmit({preventDefault(){}});
 assert.equal(h.field('review-status').textContent,'Draft could not save');assert.equal(h.field('proposed_reply').value,'Proposed response');assert.equal(h.field('review-submit').disabled,false);
 assert.equal(h.calls.length,2);assert.ok(h.calls.every(c=>c.path==='/api/hub/owner/google-reviews'));assert.equal(h.calls[1].options.body.op,'create');
});
test('refresh failure removes obsolete list; starter respects rejection to replace typed text',async()=>{
 const h=harness([{ok:true,drafts:[]},{ok:false,error:'Refresh failed'}]);await tick();assert.equal(h.field('review-list').children.length,1);
 h.button('Refresh saved drafts').onclick();await tick();assert.equal(h.field('review-list').children.length,0);assert.equal(h.field('review-storage').textContent,'Refresh failed');
 h.field('proposed_reply').value='Keep this';h.button('Use a simple reply starter').onclick();assert.equal(h.field('proposed_reply').value,'Keep this');
});
