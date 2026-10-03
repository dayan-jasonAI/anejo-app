// Actual LOCAL workerd SQLite DO; synthetic owned work, not renderer integration.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {build}=require('../../node_modules/esbuild');
const {Miniflare,convertV4MiniflareOptions}=require('../../node_modules/miniflare');
const binding={actorId:'local-owner',requestId:'local-request'};
async function setup(t,{persist}={}){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'anejo-admission-'));
 const source=`import {LocalDurableAdmission,OWNED_LOCAL_WORK} from './durable-admission.mjs';
 export class FixtureAdmission extends LocalDurableAdmission {
  async [OWNED_LOCAL_WORK](input){
   if(input.mode==='held'||input.mode==='held-rejected')await this.env.WORK.fetch('http://local.test/hold');
   if(input.mode==='rejected'||input.mode==='held-rejected')throw Error('Raw fixture error must not escape');
   return {finished:true};
  }
  async seedUnknown(){
   this.ctx.storage.sql.exec("INSERT INTO local_render_admission VALUES(1,'unknown-token','local-owner','interrupted-fixture','active',1,NULL,NULL)");
   await this.ctx.storage.sync();return this.admissionReceipt();
  }
 }
 export default {async fetch(request,env){
  const input=await request.json(),stub=env.ADMISSION.getByName('one-local-render-scope');
  const value=input.action==='receipt'?await stub.admissionReceipt():input.action==='seed'?await stub.seedUnknown():await stub.execute(input.binding,input.work);
  return Response.json(value);
 }};`;
 await build({stdin:{contents:source,resolveDir:__dirname},outfile:path.join(directory,'worker.mjs'),bundle:true,format:'esm',platform:'browser',external:['cloudflare:workers']});
 let enteredResolve,release;const entered=new Promise(r=>enteredResolve=r),held=new Promise(r=>release=r);let workCalls=0;
 const mf=new Miniflare({...convertV4MiniflareOptions({workers:[{name:'local-admission-fixture',modulesRoot:directory,modules:[{type:'ESModule',path:path.join(directory,'worker.mjs')}],compatibilityDate:'2026-05-01',bindings:{LOCAL_RENDER_REHEARSAL:'true'},durableObjects:{ADMISSION:{className:'FixtureAdmission',useSQLite:true}},serviceBindings:{WORK:async()=>{workCalls++;enteredResolve();await held;return new Response('settled');}},outboundService:()=>{throw Error('No outbound requests allowed');}}],cf:false,host:'127.0.0.1',port:0}),...(persist?{resourcePersistencePath:persist}:{})});
 let disposed=false;async function dispose(){if(!disposed){release();await mf.dispose();disposed=true;}}
 t.after(dispose);
 const call=async(action='execute',work={mode:'normal'},scope=binding)=>{const response=await mf.dispatchFetch('http://localhost/',{method:'POST',body:JSON.stringify({action,work,binding:scope})});return response.json();};
 return {call,entered,release,dispose,get workCalls(){return workCalls;}};
}
test('actual local SQLite DO refuses overlap until owned work settles, then admits next work',{timeout:20000},async t=>{
 const f=await setup(t),first=f.call('execute',{mode:'held'});await f.entered;
 const active=await f.call('receipt');assert.equal(active.state,'active');assert.equal(active.settled_at,null);
 assert.deepEqual(await f.call('execute',{mode:'normal'},{...binding,requestId:'other'}),{state:'busy',admitted:false});
 assert.equal((await f.call('receipt')).token,active.token);assert.equal(f.workCalls,1);
 f.release();const settled=await first;assert.equal(settled.outcome,'fulfilled');assert.equal(settled.value.finished,true);
 const receipt=await f.call('receipt');assert.equal(receipt.state,'settled');assert.equal(receipt.outcome,'fulfilled');
 assert.equal((await f.call('execute')).state,'settled');assert.notEqual((await f.call('receipt')).token,active.token);
});
test('rejected owned work releases only after settlement and hides raw error',{timeout:20000},async t=>{
 const f=await setup(t),pending=f.call('execute',{mode:'held-rejected'});await f.entered;
 assert.equal((await f.call('receipt')).state,'active');assert.equal((await f.call()).state,'busy');
 f.release();const result=await pending;
 assert.deepEqual(result,{state:'settled',admitted:true,outcome:'rejected',error:'owned_work_rejected'});
 assert.equal((await f.call('receipt')).outcome,'rejected');assert.equal((await f.call()).outcome,'fulfilled');
});
test('actual local runtime restart preserves unknown active receipt and never time-reclaims',{timeout:30000},async t=>{
 const persist=fs.mkdtempSync(path.join(os.tmpdir(),'anejo-admission-storage-')),first=await setup(t,{persist});
 // Persist a synthetic interrupted receipt, then restart the actual runtime. This
 // proves durable refusal; it does not assert that a killed renderer was observed.
 const before=await first.call('seed');assert.equal(before.started_at,1);await first.dispose();
 const second=await setup(t,{persist});assert.deepEqual(await second.call('receipt'),before);
 for(const requestId of ['interrupted-fixture','replacement'])assert.deepEqual(await second.call('execute',{mode:'held'},{...binding,requestId}),{state:'active_unknown',admitted:false});
 assert.equal(second.workCalls,0);assert.deepEqual(await second.call('receipt'),before);
});
