import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../../public/hub/owner/assets/marketing-photo-picker.js', import.meta.url), 'utf8');
const tick = () => new Promise((r) => setTimeout(r,0));
function harness(responses) {
  const nodes = [], calls = []; let restored = false;
  function node(tag) { const n = { tag, children: [], value: '', style: {}, isConnected: true, listeners: {}, setAttribute(k,v) { this[k] = v; }, append(...els) { this.children.push(...els); }, prepend(e) { this.children.unshift(e); }, replaceChildren() { this.children=[]; }, querySelectorAll() { return nodes.filter((n) => n.tag === 'input' || n.tag === 'button'); }, addEventListener(k,v) { this.listeners[k]=v; }, showModal() { this.open=true; }, close() { this.open=false; }, remove() { this.isConnected=false; }, focus() { this.focused=true; } }; nodes.push(n); return n; }
  const body=node('body'), previous={isConnected:true,focus(){restored=true;}};
  const ctx={window:{},document:{body,activeElement:previous,createElement:node},Hub:{api:async(path,opts)=>{calls.push({path,opts});return responses.shift();}},Set,Image:class{}};
  vm.runInNewContext(source,ctx);
  return {window:ctx.window,open:ctx.window.MarketingPhotoPicker.open,nodes,calls,get restored(){return restored;}};
}
const photo={media_key:'marketing-library/a.jpg',content_type:'image/jpeg',url:'/api/hub/media/marketing-library/a.jpg',name:'<food>.jpg',folder:'Birthday'};
test('JPEG selection returns private photo and invokes caller without post mutations',async()=>{
 const h=harness([{ok:true,photos:[photo],cursor:null}]);let chosen;
 const result=h.open({onSelect:async p=>{chosen=p;}});await tick();
 assert.equal(h.nodes.find(n=>n.tag==='strong').textContent,'<food>.jpg');
 h.nodes.find(n=>n.textContent==='Use photo').onclick();await tick();
 assert.equal((await result).media_key,photo.media_key);assert.equal(chosen,photo);assert.equal(h.calls.length,1);assert.equal(h.restored,true);
});
test('Escape cancels and restores focus with no callback',async()=>{
 const h=harness([{ok:true,photos:[],cursor:null}]);let selected=false;
 const result=h.open({onSelect:()=>{selected=true;}});await tick();
 h.nodes.find(n=>n.tag==='dialog').listeners.cancel({preventDefault(){}});
 assert.equal(await result,null);assert.equal(selected,false);assert.equal(h.restored,true);
});
test('failed fetch offers retry and does not claim empty collection',async()=>{
 const h=harness([{error:'Storage unavailable'},{ok:true,photos:[photo],cursor:'next'}]);const result=h.open();await tick();
 assert.ok(h.nodes.some(n=>n.textContent==='Storage unavailable'));
 assert.equal(h.nodes.find(n=>n.textContent==='Retry loading').hidden,false);
 h.nodes.find(n=>n.textContent==='Retry loading').onclick();await tick();
 assert.equal(h.nodes.find(n=>n.textContent==='Load more').hidden,false);
 h.nodes.find(n=>n.textContent==='Cancel').onclick();await result;
});
test('search is loaded-only and enhancement closes picker before handing off original',async()=>{
 const h=harness([{ok:true,photos:[photo],cursor:null}]);let enhanced;
 const result=h.open({onEnhance:async p=>{enhanced=p;assert.equal(h.nodes.find(n=>n.tag==='dialog').open,false);}});await tick();
 const search=h.nodes.find(n=>n.tag==='input');search.value='birthday';search.oninput();
 h.nodes.filter(n=>n.textContent==='Enhance a copy').at(-1).onclick();await tick();
 assert.equal(await result,null);assert.equal(enhanced,photo);assert.equal(h.calls.length,1);
});
test('conversion is private and original is not overwritten',()=>{
 const jpeg=source.slice(source.indexOf('async function jpeg'),source.indexOf('function open'));
 assert.match(jpeg,/marketing-library/);assert.match(jpeg,/instagram-copy/);assert.doesNotMatch(jpeg,/social-upload|DELETE|photo\.media_key\s*=/);
});

test('saved AI copies have visible label and require explicit review before selection',async()=>{
 const enhanced={...photo,ai_enhanced:true,source_key:'marketing-library/original.jpg'};
 const h=harness([{ok:true,photos:[enhanced],cursor:null}]);let chosen=0,allow=false;
 h.window.confirm=()=>allow;const result=h.open({onSelect:()=>{chosen++;},onEnhance:()=>{throw new Error('Must not re-enhance');}});await tick();
 assert.ok(h.nodes.some(n=>n.textContent==='AI-enhanced · Review required'));
 assert.ok(h.nodes.some(n=>n.alt==='Original for comparison'));
 assert.ok(!h.nodes.some(n=>n.textContent==='Enhance a copy'));
 h.nodes.find(n=>n.textContent==='Use photo').onclick();await tick();assert.equal(chosen,0);
 allow=true;h.nodes.find(n=>n.textContent==='Use photo').onclick();await tick();assert.equal(chosen,1);await result;
});
