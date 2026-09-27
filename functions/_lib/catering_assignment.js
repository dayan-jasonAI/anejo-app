// Internal catering fulfillment only: no ordinary routes, money writes or provider imports.
import {id, etDateOf, parseJson} from './hub.js';
import {executionQuoteSnapshot} from './catering_execution.js';
const notifications={enabled:false,sent:false};
const fail=(error,status=409)=>({ok:false,error,status});
const active=['assigned','accepted'];
const ownerOps=['assign','release'];
const driverOps=['accept','decline','confirm_pickup','depart','arrive','complete'];
async function roster(env,ctx) {
 if(!ctx?.distinct_id) return null;
 return env.DB.prepare('SELECT id,role,active FROM staff WHERE id=?').bind(ctx.distinct_id).first();
}
function blockers(q,e,at) {
 const out=[];
 if(!q || !q.event_date || q.event_date<etDateOf(at)) out.push('Past or undated events are read only.');
 if(q?.deposit_status!=='paid') out.push('A paid non-void deposit is required.');
 if(!e || e.delivery_mode!=='staff_driver' || !e.handling_confirmed || e.quote_snapshot!==executionQuoteSnapshot(q)) out.push('The owner must confirm the current staff-driver execution plan.');
 if(!String(q?.address||'').trim()) out.push('Confirm the delivery address.');
 return out;
}
const lineView=q=>(Array.isArray(parseJson(q.quote_json,{})?.lines)?parseJson(q.quote_json,{}).lines:[]).map((l,i)=>({key:`l${i}`,name:l.name,qty:l.qty}));
async function view(env,a,{at=Date.now()}={}) {
 const q=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(a.quote_id).first();
 const e=await env.DB.prepare('SELECT * FROM catering_execution WHERE quote_id=?').bind(a.quote_id).first();
 const reasons=blockers(q,e,at);let actions=[];
 if(!reasons.length){
  if(a.status==='assigned') actions=['accept','decline'];
  if(a.status==='accepted' && e.status==='ready' && e.packing_confirmed) actions=a.pickup_execution_version===e.version?['depart']:['confirm_pickup'];
  if(a.status==='accepted' && e.status==='en_route') actions=['arrive'];
  if(a.status==='accepted' && e.status==='arrived') {
   if(q.balance_status==='paid'||q.balance_status==='waived'||q.balance_cents===0) actions=['complete'];
   else reasons.push('The recorded balance must be paid or waived before completion.');
  }
 }
 return {ok:true,assignment:a,execution:e,event:{customer:q.customer_name,event_date:q.event_date,serving_time:q.serving_time,address:q.address,lines:lineView(q)},available_actions:actions,blockers:reasons,notifications};
}
export async function readCateringAssignments(env,ctx,{assignment_id,quote_id,date,at=Date.now()}={}) {
 const staff=await roster(env,ctx);
 if(!staff?.active || !['owner','driver'].includes(staff.role)) return fail('Owner or driver access required.',403);
 if(assignment_id){
  const a=await env.DB.prepare('SELECT * FROM catering_assignments WHERE id=?').bind(assignment_id).first();
  if(!a || (staff.role!=='owner'&&a.driver_id!==staff.id)) return fail('Assignment not found.',404);
  return {...await view(env,a,{at}),actor_id:staff.id};
 }
 if(staff.role==='owner'&&quote_id){
  const q=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(quote_id).first();if(!q)return fail('Event not found.',404);
  const a=await env.DB.prepare("SELECT * FROM catering_assignments WHERE quote_id=? ORDER BY CASE WHEN status IN ('assigned','accepted') THEN 0 ELSE 1 END,created_at DESC,id DESC LIMIT 1").bind(quote_id).first();
  const drivers=await env.DB.prepare("SELECT id,name,available FROM staff WHERE role='driver' AND active=1 ORDER BY name").all();
  const e=await env.DB.prepare('SELECT * FROM catering_execution WHERE quote_id=?').bind(quote_id).first();
  return {...(a?await view(env,a,{at}):{ok:true,assignment:null,execution:e,blockers:blockers(q,e,at),notifications}),drivers:drivers.results||[],actor_id:staff.id};
 }
 const day=/^\d{4}-\d{2}-\d{2}$/.test(date||'')?date:etDateOf(at);
 const rows=await env.DB.prepare('SELECT a.* FROM catering_assignments a JOIN catering_quotes q ON q.id=a.quote_id WHERE a.driver_id=? AND q.event_date=? ORDER BY a.created_at DESC').bind(staff.id,day).all();
 return {ok:true,actor_id:staff.id,assignments:await Promise.all((rows.results||[]).map(a=>view(env,a,{at}))),notifications};
}
export async function mutateCateringAssignment(env,b,ctx,{at=Date.now()}={}) {
 const staff=await roster(env,ctx);
 if(!staff?.active || !['owner','driver'].includes(staff.role)) return fail('Owner or driver access required.',403);
 if(!b || ![...ownerOps,...driverOps].includes(b.op) || !Number.isInteger(b.expected_version)||b.expected_version<0||!Number.isInteger(b.expected_execution_version)||!/^[-\w]{8,100}$/.test(b.idempotency_key||''))return fail('Action, versions and unique request key are required.',400);
 if(ownerOps.includes(b.op)&&staff.role!=='owner')return fail('Owner access required.',403);
 if(driverOps.includes(b.op)&&staff.role!=='driver')return fail('Assigned driver access required.',403);
 let a=b.assignment_id?await env.DB.prepare('SELECT * FROM catering_assignments WHERE id=?').bind(b.assignment_id).first():null;
 if(b.op!=='assign'&&(!a||(staff.role==='driver'&&a.driver_id!==staff.id)))return fail('Assignment not found.',404);
 const quoteId=b.op==='assign'?b.quote_id:a.quote_id;
 if(!quoteId)return fail('Event id required.',400);
 const request=JSON.stringify([b.op,b.assignment_id||null,b.driver_id||null,b.expected_version,b.expected_execution_version,[...(Array.isArray(b.confirmed_line_keys)?b.confirmed_line_keys:[])].sort(),b.handoff_confirmed===true,String(b.note||'').trim().slice(0,1000),staff.id]);
 const receipt=()=>env.DB.prepare('SELECT * FROM catering_assignment_receipts WHERE quote_id=? AND idempotency_key=?').bind(quoteId,b.idempotency_key).first();
 const replay=async r=>r.request_json===request?{...await readCateringAssignments(env,ctx,{assignment_id:r.assignment_id,at}),replayed:true}:fail('Request key belongs to another action.');
 const prior=await receipt();if(prior)return replay(prior);
 const changed=async message=>{const winner=await receipt();return winner?replay(winner):fail(message);};
 const q=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(quoteId).first();if(!q)return fail('Event not found.',404);
 const e=await env.DB.prepare('SELECT * FROM catering_execution WHERE quote_id=?').bind(quoteId).first();
 if(!e||e.version!==b.expected_execution_version)return changed('Execution changed. Reload before continuing.');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(q.event_date||'')||q.event_date<etDateOf(at))return fail('Past or undated events are read only.');
 if(b.op==='release'){
  if(!active.includes(a.status)||!['planned','preparing','ready'].includes(e.status)||!String(b.note||'').trim())return fail('Release requires a reason and an assignment that has not departed.');
 }else{
  const reasons=blockers(q,e,at);if(reasons.length)return fail(reasons.join(' '));
 }
 let target=a?.status, executionTarget=null,pickup=a?.pickup_execution_version??null;
 const snapshot=executionQuoteSnapshot(q);
 if(b.op==='assign'){
  if(b.expected_version!==0||!['planned','preparing','ready'].includes(e.status))return fail('Assign before departure with version zero.');
  const driver=await env.DB.prepare("SELECT id FROM staff WHERE id=? AND role='driver' AND active=1").bind(b.driver_id||'').first();if(!driver)return fail('Choose an active driver.',400);
  a={id:id('cas'),quote_id:quoteId,driver_id:driver.id,version:0,status:null};target='assigned';
 }else if(a.version!==b.expected_version)return changed('Assignment changed. Reload before continuing.');
 if(b.op==='release')target='released';
 if(b.op==='accept'||b.op==='decline'){
  if(a.status!=='assigned')return fail('Only an offered assignment can be accepted or declined.');target=b.op==='accept'?'accepted':'declined';
 }
 if(['confirm_pickup','depart','arrive','complete'].includes(b.op)){
  if(a.status!=='accepted')return fail('Accept this assignment before recording delivery.');
  if(b.op==='confirm_pickup'){
   const keys=lineView(q).map(l=>l.key).sort();const given=b.confirmed_line_keys;
   if(e.status!=='ready'||!e.packing_confirmed||!keys.length||!Array.isArray(given)||JSON.stringify([...given].sort())!==JSON.stringify(keys))return fail('Confirm every current catering package after the kitchen marks it ready.');pickup=e.version;
  }
  if(b.op==='depart'){
   if(e.status!=='ready'||!e.packing_confirmed||pickup!==e.version)return fail('Confirm current packages before departure.');executionTarget='en_route';
  }
  if(b.op==='arrive'){if(e.status!=='en_route')return fail('Record departure before arrival.');executionTarget='arrived';}
  if(b.op==='complete'){
   if(e.status!=='arrived'||b.handoff_confirmed!==true)return fail('Confirm physical handoff after arrival.');
   if(!(q.balance_status==='paid'||q.balance_status==='waived'||q.balance_cents===0))return fail('The recorded balance must be paid or waived before completion.');
   executionTarget='completed';target='completed';
  }
 }
 // Receipt and each guarded mutation are one transaction. NOT NULL assertion forces rollback
 // on a lost CAS; it cannot leave a receipt/audit claiming an action that did not happen.
 const statements=[];
 const prep=(sql,args)=>env.DB.prepare(sql).bind(...args);
 const actor=staff.id;
 statements.push(prep('INSERT INTO catering_assignment_receipts(quote_id,idempotency_key,assignment_id,request_json,actor,recorded_at) VALUES(?,?,?,?,?,?)',[quoteId,b.idempotency_key,a.id,request,actor,at]));
 const guard=`EXISTS (SELECT 1 FROM catering_execution e JOIN catering_quotes q ON q.id=e.quote_id WHERE e.quote_id=? AND e.version=? AND e.status=? AND e.quote_snapshot IS ? AND e.delivery_mode IS ? AND e.handling_confirmed=? AND e.packing_confirmed=? AND q.quote_json IS ? AND q.event_date IS ? AND q.serving_time IS ? AND q.address IS ? AND q.guests IS ? AND q.dietary_notes IS ? AND q.deposit_status IS ? AND q.balance_status IS ? AND q.balance_cents IS ?)
 AND EXISTS(SELECT 1 FROM staff WHERE id=? AND role=? AND active=1)`;
 const guardArgs=[quoteId,e.version,e.status,e.quote_snapshot,e.delivery_mode,e.handling_confirmed,e.packing_confirmed,q.quote_json,q.event_date,q.serving_time,q.address,q.guests,q.dietary_notes,q.deposit_status,q.balance_status,q.balance_cents,staff.id,staff.role];
 if(b.op==='assign')statements.push(prep(`INSERT INTO catering_assignments(id,quote_id,driver_id,status,version,quote_snapshot,pickup_execution_version,assigned_by,created_at,updated_at) SELECT ?,?,?,'assigned',1,?,NULL,?,?,? WHERE ${guard} AND EXISTS(SELECT 1 FROM staff WHERE id=? AND role='driver' AND active=1)`,[a.id,quoteId,a.driver_id,snapshot,actor,at,at,...guardArgs,a.driver_id]));
 else statements.push(prep(`UPDATE catering_assignments SET status=?,version=version+1,quote_snapshot=?,pickup_execution_version=?,updated_at=? WHERE id=? AND version=? AND status=? AND driver_id=? AND ${guard}`,[target,snapshot,pickup,at,a.id,a.version,a.status,a.driver_id,...guardArgs]));
 const assertion=()=>prep('UPDATE catering_assignment_receipts SET success=CASE WHEN changes()=1 THEN 1 ELSE NULL END WHERE quote_id=? AND idempotency_key=?',[quoteId,b.idempotency_key]);
 statements.push(assertion());
 if(executionTarget){
  statements.push(prep('UPDATE catering_execution SET status=?,version=version+1,updated_by=?,updated_at=? WHERE quote_id=? AND version=?',[executionTarget,actor,at,quoteId,e.version]));statements.push(assertion());
  statements.push(prep('INSERT INTO catering_execution_transitions(id,quote_id,idempotency_key,request_json,from_status,to_status,version,actor,note,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?)',[id('cex'),quoteId,`driver:${b.idempotency_key}`,request,e.status,executionTarget,e.version+1,actor,String(b.note||'').slice(0,1000)||null,at]));
 }
 statements.push(prep('INSERT INTO catering_assignment_events(id,assignment_id,quote_id,actor,actor_role,operation,from_status,to_status,version,note,confirmed_line_keys,recorded_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',[id('cae'),a.id,quoteId,actor,staff.role,b.op,a.status,target,a.version+1,String(b.note||'').trim().slice(0,1000)||null,b.op==='confirm_pickup'?JSON.stringify(b.confirmed_line_keys):null,at]));
 try{await env.DB.batch(statements);}catch(error){const winner=await receipt();if(winner)return replay(winner);if(/constraint|unique/i.test(String(error)))return fail('Assignment or execution changed. Reload before continuing.');throw error;}
 return readCateringAssignments(env,ctx,{assignment_id:a.id,at});
}
