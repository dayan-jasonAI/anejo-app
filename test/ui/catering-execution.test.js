import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const page = readFileSync(new URL('../../public/hub/kitchen/event.html', import.meta.url), 'utf8');
const functions = page.slice(page.indexOf('  function executionText('), page.indexOf('  // ---- wiring'));
function fixture({ can_write = true, read_only = false, pending = null } = {}) {
  const calls = [], stored = new Map(), panel = { innerHTML:'', querySelectorAll: () => [] };
  let reply = { ok:true, can_write:true, execution:{status:'preparing',version:2},transitions:[] };
  const ctx = vm.createContext({ quoteId:'cq_test', executionData:{can_write,read_only,configurable:true,execution:{status:'planned',version:1},available_actions:['preparing'],transitions:[]}, executionPending:pending,executionBusy:false,executionMessage:'',executionStorageKey:'test',
    crypto:{randomUUID:()=> 'unique-key-0001'},sessionStorage:{setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
    esc:s=>String(s ?? '').replace(/</g,'&lt;'), dayName:()=> 'Sep 27',clock:()=> '1:00 pm',
    document:{getElementById:id=>id==='execution-panel'?panel:null}, Hub:{toast:()=>{}},
    K:{post:async (url,b)=>{ calls.push(JSON.parse(JSON.stringify(b)));return typeof reply==='function'?reply():reply; },get:async()=>reply}
  });
  vm.runInContext(functions,ctx);
  return {ctx,calls,stored,panel,reply:r=>{reply=r;}};
}
test('execution transition updates displayed state only after provider acknowledgement',async()=>{
 const f=fixture();let resolve;f.reply(()=>new Promise(r=>{resolve=r;}));
 const task=f.ctx.saveExecution({op:'transition',target_status:'preparing'});
 assert.equal(f.ctx.executionData.execution.status,'planned');assert.equal(f.ctx.executionBusy,true);
 resolve({ok:true,can_write:true,execution:{status:'preparing',version:2},transitions:[]});await task;
 assert.equal(f.ctx.executionData.execution.status,'preparing');assert.equal(f.ctx.executionPending,null);assert.equal(f.stored.size,0);
});
for(const failure of ['network','empty','server'])test(`${failure} retains exact request for safe retry and does not advance`,async()=>{
 const f=fixture();f.reply(failure==='network'?()=>{throw Error('offline');}:failure==='empty'?null:{ok:false,status:500});
 await f.ctx.saveExecution({op:'transition',target_status:'preparing'});
 assert.equal(f.ctx.executionData.execution.status,'planned');assert.ok(f.ctx.executionPending);assert.equal(f.stored.size,1);
 f.reply({ok:true,can_write:true,execution:{status:'preparing',version:2},transitions:[]});
 await f.ctx.saveExecution({op:'transition',target_status:'ready'});
 assert.deepEqual(f.calls[1],f.calls[0]);assert.equal(f.ctx.executionPending,null);
});
test('explicit rejection keeps previous state and displays reason',async()=>{
 const f=fixture();f.reply({ok:false,status:409,error:'The event changed. Reload before continuing.'});
 await f.ctx.saveExecution({op:'transition',target_status:'preparing'});
 assert.equal(f.ctx.executionData.execution.status,'planned');assert.equal(f.ctx.executionPending,null);assert.match(f.panel.innerHTML,/The event changed/);
});
for(const opts of [{can_write:false},{read_only:true}])test(`write blocked for ${JSON.stringify(opts)}`,async()=>{
 const f=fixture(opts);await f.ctx.saveExecution({op:'transition',target_status:'preparing'});assert.equal(f.calls.length,0);
 f.ctx.renderExecution();assert.doesNotMatch(f.panel.innerHTML,/id="execution-config"|class="btn execution-action"/);
});
test('double click cannot create concurrent requests',async()=>{
 const f=fixture();let resolve;f.reply(()=>new Promise(r=>{resolve=r;}));const first=f.ctx.saveExecution({op:'configure'});
 await f.ctx.saveExecution({op:'configure'});assert.equal(f.calls.length,1);resolve(null);await first;
});
test('failed refresh removes actionable stale state',async()=>{
 const f=fixture();f.reply(null);await f.ctx.loadExecution();assert.equal(f.ctx.executionData,null);assert.match(f.panel.innerHTML,/Could not verify/);assert.doesNotMatch(f.panel.innerHTML,/execution-action/);
});
test('history and blockers render as escaped text',()=>{
 const f=fixture();f.ctx.executionData.blockers=['<img src=x>'];f.ctx.executionData.transitions=[{from_status:'planned',to_status:'preparing',actor:'<script>',note:'<img>',recorded_at:1}];f.ctx.renderExecution();
 assert.doesNotMatch(f.panel.innerHTML,/<script>|<img/);assert.match(f.panel.innerHTML,/&lt;script>/);
});
test('ET clock and day stay correct across UTC date boundary and DST',()=>{
 const source=page.slice(page.indexOf('  var clock ='),page.indexOf('  // ---- list'));
 const ctx=vm.createContext({lang:'en'});vm.runInContext(source,ctx);
 const timestamp=Date.parse('2026-09-28T02:30:00Z');assert.match(ctx.clock(timestamp),/10:30/);assert.match(ctx.dayName(timestamp),/27/);
 assert.equal(ctx.dayKey(timestamp),ctx.dayKey(Date.parse('2026-09-27T12:00:00Z')));
 assert.match(ctx.clock(Date.parse('2026-11-01T06:30:00Z')),/1:30/);
});
