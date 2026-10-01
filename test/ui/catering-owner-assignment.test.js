import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../public/hub/kitchen/catering-driver-assignment.js',import.meta.url),'utf8');
const state=(version=2)=>({ok:true,actor_id:'owner1',execution:{delivery_mode:'staff_driver',status:'planned',version},drivers:[{id:'driver1',name:'Driver One',available:true}],assignment:null});
const tick=()=>new Promise(r=>setTimeout(r,0));
function harness(storage=new Map()){
 const nodes={},calls=[];let implementation=async()=>state(),storageFail=false;
 const panel={hidden:false,_html:'',set innerHTML(value){this._html=value;for(const key of Object.keys(nodes))if(key!=='driver-assignment-panel')delete nodes[key];for(const m of value.matchAll(/id="([^"]+)"/g))nodes[m[1]]={value:'',disabled:false};},get innerHTML(){return this._html;}};nodes['driver-assignment-panel']=panel;
 const ctx={window:{},localStorage:{getItem:()=>null},sessionStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>{if(storageFail)throw Error('quota');storage.set(k,v);},removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> 'assignment-request-123456'},document:{getElementById:id=>nodes[id],querySelectorAll:()=>Object.values(nodes)},Hub:{api:async(...args)=>{calls.push(args);return implementation(...args);}}};vm.runInNewContext(source,ctx);
 return {api:ctx.window.CateringAssignment,nodes,panel,calls,storage,setApi:f=>{implementation=f;},failStorage:()=>{storageFail=true;}};
}
async function assign(h){h.nodes['assignment-driver'].value='driver1';let prevented=false;h.nodes['assignment-form'].onsubmit({preventDefault(){prevented=true;}});await tick();assert.equal(prevented,true);}
test('nonowner panel is hidden without reading private assignment desk',async()=>{const h=harness();await h.api.load('quote1',false);assert.equal(h.panel.hidden,true);assert.equal(h.calls.length,0);});
test('form submission includes current execution version; unknown save retries same durable body after reload',async()=>{
 const h=harness();await h.api.load('quote1',true);h.setApi(async()=>({_networkError:true}));await assign(h);
 const sent=h.calls[1][1].body;assert.equal(sent.expected_execution_version,2);assert.equal(sent.quote_id,'quote1');assert.equal(h.storage.size,1);
 const next=harness(h.storage);await next.api.load('quote1',true);next.setApi(async()=>({...state(),assignment:{id:'a1',status:'assigned'}}));next.nodes['assignment-retry'].onclick();await tick();
 assert.equal(JSON.stringify(next.calls[1][1].body),JSON.stringify(sent));assert.equal(next.storage.size,0);
});
test('release form binds assignment and execution versions with required reason',async()=>{
 const h=harness();h.setApi(async()=>({...state(7),assignment:{id:'a1',version:4,status:'accepted'}}));await h.api.load('quote1',true);h.setApi(async()=>({_networkError:true}));h.nodes['assignment-reason'].value=' Driver unavailable ';h.nodes['assignment-release'].onsubmit({preventDefault(){}});await tick();const b=h.calls[1][1].body;assert.equal(b.op,'release');assert.equal(b.expected_version,4);assert.equal(b.expected_execution_version,7);assert.equal(b.note,'Driver unavailable');
});
test('storage failure refuses assignment mutation before a durable identity exists',async()=>{
 const h=harness();await h.api.load('quote1',true);h.failStorage();await assign(h);assert.equal(h.calls.length,1);assert.match(h.panel.innerHTML,/storage|save|persist|record/i);
});
test('late earlier quote response cannot replace newest quote form snapshot',async()=>{
 const h=harness();let old;h.setApi(path=>path.includes('quoteA')?new Promise(resolve=>{old=resolve;}):Promise.resolve(state(9)));
 const first=h.api.load('quoteA',true);await h.api.load('quoteB',true);old(state(2));await first;h.setApi(async()=>({_networkError:true}));await assign(h);
 const b=h.calls.at(-1)[1].body;assert.equal(b.quote_id,'quoteB');assert.equal(b.expected_execution_version,9);
});
test('role revocation invalidates pending read and prevents stale form restoration',async()=>{
 const h=harness();let finish;h.setApi(()=>new Promise(r=>{finish=r;}));const pending=h.api.load('quote1',true);await h.api.load('quote1',false);finish(state());await pending;
 assert.equal(h.panel.hidden,true);assert.equal(h.panel.innerHTML,'');assert.equal(h.nodes['assignment-form'],undefined);
});
test('late save after quote navigation leaves old retry receipt intact and cannot render on new quote',async()=>{
 const h=harness();await h.api.load('quoteA',true);let finish;h.setApi((p,o)=>o?new Promise(r=>{finish=r;}):Promise.resolve(state(9)));await assign(h);await h.api.load('quoteB',true);
 finish({...state(2),assignment:{id:'old',status:'assigned'}});await tick();assert.doesNotMatch(h.panel.innerHTML,/old/);assert.equal(h.storage.size,1);
 h.setApi(async()=>({_networkError:true}));await assign(h);assert.equal(h.calls.at(-1)[1].body.quote_id,'quoteB');assert.equal(h.calls.at(-1)[1].body.expected_execution_version,9);
});
test('generic HTTP rejection recognizes _status, clears rejected request, and refreshes',async()=>{
 const h=harness();await h.api.load('quote1',true);h.setApi(async(p,o)=>o?{_status:409,error:'Changed'}:state(8));await assign(h);
 assert.equal(h.storage.size,0);assert.equal(h.calls.length,3);assert.ok(h.nodes['assignment-form']);
});
test('blockers display safely and suppress mutation forms',async()=>{
 const h=harness();h.setApi(async()=>({...state(),blockers:['<stale plan>']}));await h.api.load('quote1',true);assert.match(h.panel.innerHTML,/&lt;stale plan&gt;/);assert.equal(h.nodes['assignment-form'],undefined);
});
test('successful save callback can refresh after lock releases',async()=>{
 const h=harness();let callbacks=0;await h.api.load('quote1',true,()=>{callbacks++;return h.api.load('quote1',true);});h.setApi(async()=>state(8));await assign(h);
 assert.equal(callbacks,1);assert.equal(h.calls.length,3);assert.ok(h.nodes['assignment-form']);
});
test('actor switch does not expose prior actor pending save',async()=>{
 const h=harness();await h.api.load('quote1',true);h.setApi(async()=>({_networkError:true}));await assign(h);
 const next=harness(h.storage);next.setApi(async()=>({...state(),actor_id:'owner2'}));await next.api.load('quote1',true);assert.equal(next.nodes['assignment-retry'],undefined);assert.ok(next.nodes['assignment-form']);assert.equal(next.storage.size,1);
});
test('reopened plan blockers preserve predeparture release with named driver while preventing new assignment',async()=>{
 const h=harness();h.setApi(async()=>({...state(8),blockers:['Reconfirm food handling.'],assignment:{id:'a1',driver_id:'driver1',version:3,status:'accepted'}}));await h.api.load('quote1',true);
 assert.ok(h.nodes['assignment-release']);assert.equal(h.nodes['assignment-form'],undefined);assert.match(h.panel.innerHTML,/Driver One/);assert.match(h.panel.innerHTML,/Reconfirm food handling/);
 h.setApi(async()=>({_networkError:true}));h.nodes['assignment-reason'].value='Owner will deliver';h.nodes['assignment-release'].onsubmit({preventDefault(){}});await tick();assert.equal(h.calls.at(-1)[1].body.op,'release');assert.equal(h.calls.at(-1)[1].body.expected_execution_version,8);
});
test('active assignment after departure cannot display release even with blockers',async()=>{
 const h=harness();h.setApi(async()=>({...state(),execution:{delivery_mode:'staff_driver',status:'en_route',version:8},blockers:['Changed plan'],assignment:{id:'a1',driver_id:'driver1',version:3,status:'accepted'}}));await h.api.load('quote1',true);assert.equal(h.nodes['assignment-release'],undefined);
});
