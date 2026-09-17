import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const code=readFileSync(new URL('../../public/hub/owner/assets/marketing-photo-enhance.js',import.meta.url),'utf8');
const tick=()=>new Promise(r=>setTimeout(r,0));
function harness(replies,onUse){
 const nodes=[],calls=[],polishCalls=[];let focused=false;
 function node(tag){const n={tag,children:[],checked:false,disabled:false,hidden:false,isConnected:true,listeners:{},setAttribute(k,v){this[k]=v;},append(...els){els.forEach(e=>{e.parent=this;this.children.push(e);if(this.tag==='select'&&this.value===undefined)this.value=e.value;});},get lastChild(){return this.children.at(-1);},remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this);},showModal(){this.open=true;},close(){this.open=false;},addEventListener(k,v){this.listeners[k]=v;},focus(){focused=true;}};nodes.push(n);return n;}
 const ctx={document:{createElement:node,createTextNode:t=>({textContent:t}),body:node('body'),activeElement:{isConnected:true,focus(){focused=true;}}},window:{MarketingPhotoPolish:{create:async(photo,preset)=>{polishCalls.push({photo,preset});return {media_key:'polished.jpg',url:'/private/polished',method:'photographic'};}}},Hub:{api:async(path,opts)=>{calls.push({path,opts});const r=replies.shift();return typeof r==='function'?r():r;}}};
 vm.runInNewContext(code,ctx);const promise=ctx.window.MarketingPhotoEnhance.open({photo:{media_key:'marketing-library/original.jpg',url:'/private/original'},onUse});
 const initialMethod=nodes.find(n=>n['aria-label']==='Photo method').value;
 nodes.find(n=>n['aria-label']==='Photo method').value='ai';
 return{nodes,calls,polishCalls,initialMethod,promise,get focused(){return focused;},button(text){return nodes.find(n=>n.textContent===text);}};
}
const copy={media_key:'marketing-library/copy.jpg',url:'/private/copy',ai_enhanced:true};
test('generation never selects automatically; review checkbox gates explicit use',async()=>{
 let used=0;const h=harness([{ok:true,photo:copy}],()=>{used++;});
 await h.button('Generate a preview').onclick();assert.equal(used,0);
 const use=h.button('Use this copy'),checkbox=h.nodes.find(n=>n.type==='checkbox');
 assert.equal(use.hidden,false);assert.equal(use.disabled,true);await use.onclick();assert.equal(used,0);
 checkbox.checked=true;checkbox.onchange();assert.equal(use.disabled,false);await use.onclick();
 assert.equal(used,1);assert.equal(await h.promise,copy);assert.equal(h.focused,true);
 assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'/api/hub/owner/marketing-photo-enhance');
});
test('generation failure allows retry and successful regeneration resets review',async()=>{
 const h=harness([{error:'Provider unavailable'},{ok:true,photo:copy},{ok:true,photo:copy}]);
 const generate=h.button('Generate a preview');await generate.onclick();assert.equal(generate.disabled,false);assert.ok(h.nodes.some(n=>n.textContent==='Provider unavailable'));
 await generate.onclick();const check=h.nodes.find(n=>n.type==='checkbox');check.checked=true;check.onchange();
 await generate.onclick();assert.equal(check.checked,false);assert.equal(h.button('Use this copy').disabled,true);
 h.button('Close').onclick();assert.equal(await h.promise,null);
});
test('caller selection failure keeps preview open for retry, no extra generation',async()=>{
 let attempts=0;const h=harness([{ok:true,photo:copy}],()=>{if(++attempts===1)throw new Error('Could not attach');});
 await h.button('Generate a preview').onclick();const check=h.nodes.find(n=>n.type==='checkbox');check.checked=true;check.onchange();
 await h.button('Use this copy').onclick();assert.equal(h.nodes.find(n=>n.tag==='dialog').open,true);assert.equal(h.button('Use this copy').disabled,false);
 await h.button('Use this copy').onclick();assert.equal(await h.promise,copy);assert.equal(h.calls.length,1);
});
test('cancel during generation ignores late result and never selects',async()=>{
 let resolve,used=false;const h=harness([()=>new Promise(r=>{resolve=r;})],()=>{used=true;});
 const pending=h.button('Generate a preview').onclick();await tick();h.nodes.find(n=>n.tag==='dialog').listeners.cancel({preventDefault(){}});
 assert.equal(await h.promise,null);resolve({ok:true,photo:copy});await pending;assert.equal(used,false);assert.equal(h.focused,true);
});

test('photographic method previews original-pixel polish without AI call or AI checkbox, but requires explicit Use',async()=>{
 let used=0;const h=harness([],()=>{used++;});assert.equal(h.initialMethod,'photographic');
 h.nodes.find(n=>n['aria-label']==='Photo method').value='photographic';
 await h.button('Generate a preview').onclick();
 assert.equal(h.calls.length,0);assert.equal(h.polishCalls.length,1);assert.equal(h.polishCalls[0].preset,'natural');assert.equal(used,0);
 const check=h.nodes.find(n=>n.type==='checkbox');assert.equal(check.parent.hidden,true);assert.equal(h.button('Use this copy').disabled,false);
 await h.button('Use this copy').onclick();assert.equal(used,1);assert.equal((await h.promise).method,'photographic');
});
