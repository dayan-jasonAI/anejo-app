import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const page = readFileSync(new URL('../../public/hub/kitchen/event.html', import.meta.url), 'utf8');
const functions = page.slice(page.indexOf('  function executionLabel('), page.indexOf('  // ---- wiring'));
function fixture({ can_write = true, read_only = false, pending = null } = {}) {
  const elements = {}, calls = [], stored = new Map(), panel = { innerHTML:'', querySelectorAll: () => [] };
  const renders = []; let getReply = null;
  let reply = { ok:true, can_write:true, execution:{status:'preparing',version:2},transitions:[] };
  const ctx = vm.createContext({ lang:'en', quoteId:'cq_test', executionData:{can_write,read_only,configurable:true,execution:{status:'planned',version:1},available_actions:['preparing'],transitions:[]}, executionPending:pending,executionBusy:false,executionMessage:'',executionStorageKey:'test',
    crypto:{randomUUID:()=> 'unique-key-0001'},sessionStorage:{setItem:(k,v)=>stored.set(k,v),removeItem:k=>stored.delete(k)},
    esc:s=>String(s ?? '').replace(/</g,'&lt;'), dayName:()=> 'Sep 27',clock:()=> '1:00 pm',
    render:(d,keep)=>renders.push({d,keep}),document:{getElementById:id=>id==='execution-panel'?panel:elements[id] || null}, Hub:{toast:()=>{}},
    K:{post:async (url,b)=>{ calls.push(JSON.parse(JSON.stringify(b)));return typeof reply==='function'?reply():reply; },get:async()=>getReply || reply}
  });
  vm.runInContext(functions,ctx);
  return {ctx,calls,stored,panel,renders,elements,getReply:r=>{getReply=r;},reply:r=>{reply=r;}};
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

test('confirmed configuration reloads and renders updated planner preserving execution state',async()=>{
 const f=fixture();f.getReply({ok:true,event:{id:'cq_test'},tasks:[{at:123}]});
 await f.ctx.saveExecution({op:'configure',travel_minutes:45});
 assert.equal(f.renders.length,1);assert.equal(f.renders[0].keep,true);assert.equal(f.renders[0].d.tasks[0].at,123);
 assert.equal(f.ctx.executionPending,null);assert.equal(f.ctx.executionMessage,'Progress saved.');
});
test('planner refresh failure cannot turn acknowledged save into an uncertain retry',async()=>{
 const f=fixture();f.getReply({ok:false});await f.ctx.saveExecution({op:'configure'});
 assert.equal(f.ctx.executionPending,null);assert.match(f.ctx.executionMessage,/Progress saved, but/);assert.match(f.ctx.executionMessage,/before relying on its times/);
});

test('Spanish execution panel translates controls, status, safety disclosure and backend blockers',async()=>{
 const f=fixture();f.ctx.lang='es';f.ctx.executionData.blockers=['Confirm the event serving time.'];f.ctx.renderExecution();
 assert.match(f.panel.innerHTML,/Progreso del evento/);assert.match(f.panel.innerHTML,/Planificado/);assert.match(f.panel.innerHTML,/Iniciar preparación/);
 assert.match(f.panel.innerHTML,/no notifica a clientes ni asigna conductores/);assert.match(f.panel.innerHTML,/Confirma la hora de servicio/);
 assert.doesNotMatch(f.panel.innerHTML,/Start preparation|Setup minutes|Confirm execution plan/);
 f.reply({ok:false,status:409,error:'The event changed. Reload before continuing.'});await f.ctx.saveExecution({op:'transition',target_status:'preparing'});
 assert.match(f.panel.innerHTML,/El evento cambió/);
});

test('reopen form sends required reason and refreshes planner only on acknowledgement',async()=>{
 const f=fixture();f.ctx.lang='es';f.ctx.executionData.can_reopen=true;f.ctx.executionData.configurable=false;
 f.ctx.executionData.execution.status='ready';f.elements['execution-reopen']={};f.elements['execution-reason']={value:'  '};
 f.ctx.renderExecution();assert.match(f.panel.innerHTML,/Reabrir preparación/);assert.match(f.panel.innerHTML,/no se envían notificaciones/);
 await f.elements['execution-reopen'].onsubmit({preventDefault(){}});assert.equal(f.calls.length,0);
 f.elements['execution-reason'].value='  Address changed  ';f.getReply({ok:true,event:{id:'cq_test'},tasks:[]});
 await f.elements['execution-reopen'].onsubmit({preventDefault(){}});
 assert.equal(f.calls[0].op,'reopen');assert.equal(f.calls[0].note,'Address changed');assert.equal(f.renders.length,1);
});
test('reopen control is absent when backend does not permit recovery',()=>{
 const f=fixture();f.ctx.executionData.can_reopen=false;f.ctx.renderExecution();assert.doesNotMatch(f.panel.innerHTML,/id="execution-reopen"/);
});
