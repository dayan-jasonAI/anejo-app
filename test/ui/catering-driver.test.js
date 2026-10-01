import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const page=readFileSync(new URL('../../public/hub/driver/catering.html',import.meta.url),'utf8');
const script=page.slice(page.lastIndexOf('<script>')+8,page.lastIndexOf('</script>')).replace(" Hub.boot();Driver.nav('home');", " globalThis.ui={load,save,perform,render,setState:x=>state=x,getState:()=>state,getPending:()=>pending,setLang:x=>lang=x}; Hub.boot();Driver.nav('home');");
const view=()=>({ok:true,actor_id:'driver1',assignment:{id:'a1',status:'accepted',version:2},execution:{status:'ready',version:4},event:{customer:'Test',event_date:'2026-09-28',serving_time:'18:00',address:'Example',lines:[{key:'l0',name:'Congri',qty:'1 tray'},{key:'l1',name:'Yuca',qty:'2 trays'}]},available_actions:['confirm_pickup'],blockers:[]});
function fixture(search='?assignment_id=a1',savedPending=null){
 const elements=Object.fromEntries(['content','status','boundary','back-home','refresh','lang-toggle'].map(k=>[k,{innerHTML:'',textContent:'',querySelectorAll:()=>[]}]));
 const storage=new Map(),calls=[];if(savedPending)storage.set('anejo:catering-driver:driver1:a1',JSON.stringify(savedPending));let response=view(),checks=[];
 const api=async(url,options)=>{calls.push({url,body:options?.body?JSON.parse(JSON.stringify(options.body)):null});return typeof response==='function'?response():response;};
 const ctx=vm.createContext({window:{Hub:{api,boot(){}},Driver:{nav(){},guard:async()=>null}},location:{search},URLSearchParams,localStorage:{getItem:()=>null,setItem(){}},sessionStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},crypto:{randomUUID:()=> 'uuid-stable-1'},document:{documentElement:{},getElementById:k=>elements[k]||null,querySelectorAll:()=>checks}});
 vm.runInContext(script,ctx);ctx.ui.setState(view());
 return{ui:ctx.ui,elements,storage,calls,ctx,response:r=>response=r,checks:x=>checks=x};
}
test('all exact packages required before pickup; actual handler submits line keys and versions',async()=>{
 const f=fixture();f.checks([{value:'l0',checked:true},{value:'l1',checked:false}]);await f.ui.perform('confirm_pickup');assert.equal(f.calls.length,0);assert.match(f.elements.status.textContent,/every package/);
 f.checks([{value:'l0',checked:true},{value:'l1',checked:true}]);await f.ui.perform('confirm_pickup');assert.deepEqual(f.calls[0].body.confirmed_line_keys,['l0','l1']);assert.equal(f.calls[0].body.expected_version,2);assert.equal(f.calls[0].body.expected_execution_version,4);
});
test('complete requires physical handoff confirmation',async()=>{
 const f=fixture();const v=view();v.available_actions=['complete'];f.ui.setState(v);await f.ui.perform('complete');assert.equal(f.calls.length,0);
 f.elements['handoff-confirmed']={checked:true};await f.ui.perform('complete');assert.equal(f.calls[0].body.handoff_confirmed,true);
});
for(const failure of ['offline','empty','server'])test(`${failure} outcome retains exact payload and blocks different action until retry`,async()=>{
 const f=fixture();f.response(failure==='offline'?()=>{throw Error('offline');}:failure==='empty'?null:{ok:false,status:500});
 await f.ui.save({op:'depart'});assert.equal(f.ui.getState().execution.status,'ready');assert.ok(f.ui.getPending());assert.equal(f.storage.size,1);
 await f.ui.perform('arrive');assert.equal(f.calls.length,1);f.response(view());await f.ui.save(null);assert.deepEqual(f.calls[1].body,f.calls[0].body);assert.equal(f.ui.getPending(),null);
});
test('double submit and server rejection cannot report progress saved',async()=>{
 const f=fixture();let resolve;f.response(()=>new Promise(r=>{resolve=r;}));const one=f.ui.save({op:'accept'});await f.ui.save({op:'accept'});assert.equal(f.calls.length,1);assert.equal(f.ui.getState().assignment.status,'accepted');resolve({ok:false,status:409,error:'Changed'});await one;assert.equal(f.ui.getState(),null);assert.equal(f.ui.getPending(),null);assert.match(f.elements.status.textContent,/Changed/);assert.doesNotMatch(f.elements.status.textContent,/Progress saved/);
});
test('failed refresh removes stale actions',async()=>{const f=fixture();f.response(null);await f.ui.load();assert.equal(f.ui.getState(),null);assert.doesNotMatch(f.elements.content.innerHTML,/catering-action/);});
test('Spanish view translates controls and operational boundary while escaping source fields',()=>{
 const f=fixture();f.ui.setLang('es');const v=view();v.event.customer='<img src=x>';v.event.lines[0].name='<script>';f.ui.setState(v);f.ui.render();
 assert.match(f.elements.content.innerHTML,/Confirmar recogida de todos los paquetes/);assert.match(f.elements.boundary.textContent,/No se envían notificaciones/);assert.match(f.elements.boundary.textContent,/compensación/);assert.doesNotMatch(f.elements.content.innerHTML,/<img|<script/);assert.match(f.elements.content.innerHTML,/&lt;img/);
});
test('assignment list uses scoped backend result and encoded links',async()=>{
 const f=fixture('');const v=view();v.assignment.id='a&other=1';f.response({ok:true,actor_id:'driver1',assignments:[v]});await f.ui.load();assert.match(f.calls[0].url,/^\/api\/hub\/driver\/catering\?date=\d{4}-\d{2}-\d{2}$/);assert.match(f.elements.content.innerHTML,/a%26other%3D1/);assert.match(f.elements.content.innerHTML,/Eastern time/);
});
test('operation absent from server actions does not write',async()=>{const f=fixture();await f.ui.perform('depart');assert.equal(f.calls.length,0);});

test('reload restores unresolved request key and exact versions before retry',async()=>{
 const saved={op:'depart',assignment_id:'a1',expected_version:1,expected_execution_version:3,idempotency_key:'original-key'};const f=fixture('?assignment_id=a1',saved);await f.ui.load();f.ui.render();
 assert.match(f.elements.content.innerHTML,/Retry previous request/);assert.doesNotMatch(f.elements.content.innerHTML,/class="btn catering-action"/);await f.ui.save(null);assert.deepEqual(f.calls[1].body,saved);
});

test('storage write failure prevents POST and does not claim a save',async()=>{
 const f=fixture();f.ctx.sessionStorage.setItem=()=>{throw Error('quota');};await f.ui.save({op:'accept'});assert.equal(f.calls.length,0);assert.equal(f.ui.getPending(),null);assert.match(f.elements.status.textContent,/No action was sent/);
});
test('HTTP guard rejection without ok/status is recognized from _status',async()=>{
 const f=fixture();f.response({_status:403,error:'Assigned driver access required.'});await f.ui.save({op:'accept'});assert.equal(f.ui.getPending(),null);assert.equal(f.ui.getState(),null);assert.match(f.elements.status.textContent,/rejected/);
});
test('stale GET cannot overwrite newer acknowledged mutation',async()=>{
 const f=fixture();let resolve;f.response(()=>new Promise(r=>{resolve=r;}));const read=f.ui.load();const next=view();next.execution.status='en_route';f.response(next);await f.ui.save({op:'depart'});resolve(view());await read;assert.equal(f.ui.getState().execution.status,'en_route');
});
test('recovery request belongs only to authenticated actor',async()=>{
 const saved={op:'depart',assignment_id:'a1',expected_version:1,expected_execution_version:3,idempotency_key:'original-key'};const f=fixture('?assignment_id=a1',saved);const other=view();other.actor_id='driver2';f.response(other);await f.ui.load();assert.equal(f.ui.getPending(),null);await f.ui.save({op:'accept'});assert.notEqual(f.calls[1].body.idempotency_key,'original-key');assert.ok(f.storage.has('anejo:catering-driver:driver1:a1'));
});

test('acknowledged save with cleanup failure retains original recovery key',async()=>{
 const f=fixture();f.ctx.sessionStorage.removeItem=()=>{throw Error('blocked');};await f.ui.save({op:'depart'});assert.ok(f.ui.getPending());assert.match(f.elements.status.textContent,/Progress saved, but/);assert.equal(f.storage.size,1);
});
test('older failing GET cannot clear a newer successful read',async()=>{
 const f=fixture();let reject;f.response(()=>new Promise((r,j)=>{reject=j;}));const old=f.ui.load();f.response(view());await f.ui.load();reject(Error('offline'));await old;assert.equal(f.ui.getState().actor_id,'driver1');
});

test('list date form fetches exact selected future date',async()=>{
 const f=fixture('?date=2026-10-04');f.ui.setState({ok:true,actor_id:'driver1',assignments:[]});f.elements['assignment-date-form']={};f.elements['assignment-date']={value:'2026-10-08'};f.ui.render();assert.match(f.elements.content.innerHTML,/value="2026-10-04"/);f.response({ok:true,actor_id:'driver1',assignments:[]});await f.elements['assignment-date-form'].onsubmit({preventDefault(){}});assert.equal(f.calls[0].url,'/api/hub/driver/catering?date=2026-10-08');assert.match(f.elements.content.innerHTML,/value="2026-10-08"/);
});
test('future date remains attached to assignment detail links',async()=>{
 const f=fixture('?date=2026-10-04');f.response({ok:true,actor_id:'driver1',assignments:[view()]});await f.ui.load();assert.match(f.elements.content.innerHTML,/assignment_id=a1&amp;date=2026-10-04/);
});
