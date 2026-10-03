// LOCAL ONLY foundation. No app binding, deployed admission or resource gate.
import {DurableObject} from 'cloudflare:workers';
// Symbol hook cannot be called directly by name through Durable Object RPC.
export const OWNED_LOCAL_WORK=Symbol('owned-local-work');

function bounded(value,max){
 if(typeof value!=='string'||!value||value.length>max||value.trim()!==value||/[\u0000-\u001f\u007f]/u.test(value))throw Error('invalid_admission_binding');
 return value;
}

// Trusted subclass must own the COMPLETE operation in [OWNED_LOCAL_WORK]: no detached
// promises, waitUntil work, streaming response bodies, or timeout races that return
// while side effects continue. A settled hook means every dispatched operation has
// settled, including on rejection. This primitive cannot inspect hidden promises.
// Route all work sharing the desired bound to ONE server-selected DO identity;
// per-actor/per-request identities would each admit additional concurrent work.
export class LocalDurableAdmission extends DurableObject {
 constructor(ctx,env){
  super(ctx,env);
  this.activeToken=null;
  ctx.blockConcurrencyWhile(async()=>{
   ctx.storage.sql.exec(`CREATE TABLE IF NOT EXISTS local_render_admission(
    slot INTEGER PRIMARY KEY CHECK(slot=1),token TEXT NOT NULL,actor_id TEXT NOT NULL,
    request_id TEXT NOT NULL,state TEXT NOT NULL CHECK(state IN ('active','settled')),
    started_at INTEGER NOT NULL,settled_at INTEGER,outcome TEXT CHECK(outcome IN ('fulfilled','rejected'))
   )`);
  });
 }
 // Read-only internal diagnostic. No reset/reclaim/TTL/alarm API is provided.
 admissionReceipt(){return this.ctx.storage.sql.exec('SELECT * FROM local_render_admission WHERE slot=1').toArray()[0]||null;}
 async [OWNED_LOCAL_WORK](){throw Error('local_work_hook_required');}
 async execute(binding,input){
  if(this.env.LOCAL_RENDER_REHEARSAL!=='true')throw Error('local_rehearsal_disabled');
  if(!binding||Object.getPrototypeOf(binding)!==Object.prototype||Object.keys(binding).length!==2)throw Error('invalid_admission_binding');
  const actorId=bounded(binding.actorId,256),requestId=bounded(binding.requestId,200);
  // Caller must already enforce its authenticated exact endpoint contract.
  const inputText=JSON.stringify(input);
  if(typeof inputText!=='string'||new TextEncoder().encode(inputText).length>16384)throw Error('invalid_admission_input');
  const previous=this.admissionReceipt();
  if(previous?.state==='active')return {state:this.activeToken===previous.token?'busy':'active_unknown',admitted:false};
  const token=crypto.randomUUID();
  const acquired=this.ctx.storage.sql.exec(`INSERT INTO local_render_admission(slot,token,actor_id,request_id,state,started_at,settled_at,outcome)
   VALUES(1,?,?,?,'active',?,NULL,NULL) ON CONFLICT(slot) DO UPDATE SET token=excluded.token,actor_id=excluded.actor_id,
   request_id=excluded.request_id,state='active',started_at=excluded.started_at,settled_at=NULL,outcome=NULL
   WHERE local_render_admission.state='settled' RETURNING token`,token,actorId,requestId,Date.now()).toArray();
  if(acquired.length!==1)return {state:'active_unknown',admitted:false};
  this.activeToken=token;
  // Never start work until the active receipt is durably acknowledged. Failure
  // leaves the receipt active/unknown; it does not enable replacement work.
  await this.ctx.storage.sync();
  let value,outcome='fulfilled';
  try{value=await this[OWNED_LOCAL_WORK](JSON.parse(inputText),Object.freeze({actorId,requestId,token}));}
  catch{outcome='rejected';}
  // Only exact ownership can release, and only after the owned hook settles.
  // SQL/storage errors propagate without a successful release assertion.
  const released=this.ctx.storage.sql.exec(`UPDATE local_render_admission SET state='settled',settled_at=?,outcome=?
   WHERE slot=1 AND token=? AND state='active' RETURNING token`,Date.now(),outcome,token).toArray();
  if(released.length!==1)throw Error('admission_release_unverified');
  await this.ctx.storage.sync();
  this.activeToken=null;
  return outcome==='fulfilled'?{state:'settled',admitted:true,outcome,value}:{state:'settled',admitted:true,outcome,error:'owned_work_rejected'};
 }
}
