import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const page=readFileSync(new URL('../../public/hub/owner/marketing.html',import.meta.url),'utf8');
const source=page.slice(page.indexOf('  var draftRequestRestored='),page.indexOf('  function setComposerPhoto'));
const body={op:'draft',caption:'Food',media_key:'marketing-library/a.jpg',scheduled_at:null};
function harness(storage=new Map()){
 const calls=[],fields={cap:{value:'Owner edits'}};let result={_networkError:true,error:'Network dropped'};
 const ctx={DATA:{draft_actor:'owner1'},crypto:{randomUUID:()=> 'request_1234567890'},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},document:{getElementById:id=>fields[id]},Hub:{api:async(p,o)=>{calls.push(o.body);return result;},toast(){}}};vm.runInNewContext(source,ctx);
 return {ctx,calls,fields,storage,setResult:r=>{result=r;}};
}
test('lost response and reload retain identity and fields; confirmed replay clears receipt',async()=>{
 const h=harness();await assert.rejects(h.ctx.saveComposerRequest(body,{cap:'Food'}));
 const next=harness(h.storage);next.fields.cap.value='';next.ctx.restoreDraftRequest();assert.equal(next.fields.cap.value,'Food');next.setResult({ok:true,id:'post1'});
 await next.ctx.saveComposerRequest(body,{cap:'Food'});assert.equal(next.calls[0].request_id,h.calls[0].request_id);assert.equal(next.storage.size,0);
});
test('changed edits blocked until original recovery, with input preserved and no second operation',async()=>{
 const h=harness();await assert.rejects(h.ctx.saveComposerRequest(body,{cap:'Food'}));
 await assert.rejects(h.ctx.saveComposerRequest({...body,caption:'Changed'},{}),/Recover previous save/);assert.equal(h.calls.length,1);
 h.setResult({ok:true,id:'post1'});await h.ctx.recoverComposerRequest();assert.equal(h.calls.length,2);assert.equal(h.calls[1].caption,'Food');assert.equal(h.fields.cap.value,'Owner edits');
});
test('account switch never restores or recovers another actors pending request',async()=>{
 const h=harness();await assert.rejects(h.ctx.saveComposerRequest(body,{cap:'Food'}));
 const next=harness(h.storage);next.ctx.DATA.draft_actor='owner2';next.ctx.restoreDraftRequest();await next.ctx.recoverComposerRequest();assert.equal(next.calls.length,0);assert.equal(next.fields.cap.value,'Owner edits');
});
test('restore and explicit recovery never overwrite existing edited fields',async()=>{
 const h=harness();await assert.rejects(h.ctx.saveComposerRequest(body,{cap:'Food'}));const next=harness(h.storage);
 next.ctx.restoreDraftRequest();assert.equal(next.fields.cap.value,'Owner edits');next.setResult({ok:true,id:'post1',replayed:true});await next.ctx.recoverComposerRequest();assert.equal(next.fields.cap.value,'Owner edits');
});
test('resolve without retry clears only acknowledged receipt and never submits original draft',async()=>{
 const h=harness();await assert.rejects(h.ctx.saveComposerRequest(body,{cap:'Food'}));await assert.rejects(h.ctx.resolveComposerRequest());assert.equal(h.storage.size,1);
 h.setResult({ok:true,found:true,abandoned:true});await h.ctx.resolveComposerRequest();assert.equal(h.calls.at(-1).op,'draft_abandon');assert.equal(h.storage.size,0);assert.equal(h.fields.cap.value,'Owner edits');
});
test('pending save blocks resolve and another save without changing request identity',async()=>{
 const h=harness();let finish;h.ctx.Hub.api=async(p,o)=>{h.calls.push(o.body);return new Promise(resolve=>{finish=resolve;});};
 const first=h.ctx.saveComposerRequest(body,{cap:'Food'}),snapshot=[...h.storage.values()][0];
 await assert.rejects(h.ctx.resolveComposerRequest(),/still in progress/);await assert.rejects(h.ctx.saveComposerRequest({...body,caption:'Other'},{}),/still in progress/);
 assert.equal(h.calls.length,1);assert.equal([...h.storage.values()][0],snapshot);assert.equal(h.fields.cap.value,'Owner edits');
 finish({error:'Lost response'});await assert.rejects(first);assert.equal([...h.storage.values()][0],snapshot);
 h.setResult({ok:true});h.ctx.Hub.api=async()=>({ok:true});await h.ctx.saveComposerRequest(body,{});assert.equal(h.storage.size,0);
});
test('pending resolution blocks save, retaining identity until resolution acknowledgment',async()=>{
 const h=harness();await assert.rejects(h.ctx.saveComposerRequest(body,{cap:'Food'}));const snapshot=[...h.storage.values()][0];let finish;
 h.ctx.Hub.api=async(p,o)=>{h.calls.push(o.body);return new Promise(resolve=>{finish=resolve;});};
 const resolution=h.ctx.resolveComposerRequest();await assert.rejects(h.ctx.saveComposerRequest({...body,caption:'New'},{}),/still in progress/);
 assert.equal([...h.storage.values()][0],snapshot);assert.equal(h.calls.length,2);finish({ok:true,found:true,abandoned:true});await resolution;assert.equal(h.storage.size,0);
 h.ctx.Hub.api=async()=>({ok:true,id:'new'});await h.ctx.saveComposerRequest({...body,caption:'New'},{});assert.equal(h.storage.size,0);assert.equal(h.fields.cap.value,'Owner edits');
});
