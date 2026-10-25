import {executionQuoteSnapshot,readExecution,mutateExecution} from './catering_execution.js';
import {id,etDateOf,parseJson} from './hub.js';
const fail=(error,status=409)=>({ok:false,error,status});
const keyValid=value=>typeof value==='string'&&value.length>0&&value.length<=180;
export const cateringLineQuantity=line=>/^\d+(?:\.\d+)?$/.test(String(line?.qty??'').trim())&&Number(line.qty)>0?Number(line.qty):null;
export const cateringLineViews=q=>(Array.isArray(parseJson(q.quote_json,{})?.lines)?parseJson(q.quote_json,{}).lines:[]).map((l,i)=>({key:'l'+i,name:l.name||l.name_es||'Quoted item',name_es:l.name_es||null,product_id:l.product_id||l.sku||null,qty:l.qty??null,detail:l.detail||null,required_qty:cateringLineQuantity(l)}));
const progressTargets={pending:['preparing'],preparing:['cooked'],cooked:['packed'],packed:[]};
export async function readCateringOperations(env,q){
 const snapshot=executionQuoteSnapshot(q),activation=await env.DB.prepare('SELECT * FROM catering_operations_activation WHERE quote_id=?').bind(q.id).first();
 const progress=(await env.DB.prepare('SELECT * FROM catering_line_progress WHERE quote_id=?').bind(q.id).all()).results||[];
 const handling=(await env.DB.prepare('SELECT * FROM catering_handling_readings WHERE quote_id=?').bind(q.id).all()).results||[];
 const purchases=(await env.DB.prepare('SELECT * FROM catering_purchase_items WHERE quote_id=?').bind(q.id).all()).results||[];
 const lines=cateringLineViews(q).map(line=>{
  const p=progress.find(x=>x.line_key===line.key),current=p?.quote_snapshot===snapshot,state=current?p.state:'pending';
  const readings={};for(const stage of ['packing','pickup','delivery']){const h=handling.find(x=>x.line_key===line.key&&x.stage===stage);readings[stage]=h?{...h,by:h.updated_by,at:h.updated_at,stale:h.quote_snapshot!==snapshot}:null;}
  return {...line,progress:{state,version:p?.version||0,actual_qty:current?p.actual_qty:null,by:current?p.updated_by:null,at:current?p.updated_at:null,stale:Boolean(p&&!current),available_targets:progressTargets[state]||[]},handling:readings};
 });
 const ready=[];if(!lines.length)ready.push('The booking needs an itemized menu.');
 for(const l of lines){if(l.required_qty===null)ready.push(`Confirm the quoted quantity for ${l.name}; it cannot be inferred from the guest count.`);if(l.progress.state!=='packed'||l.progress.actual_qty<l.required_qty)ready.push(`Record the cooked and packed quantity for ${l.name}.`);if(!l.handling.packing||l.handling.packing.stale)ready.push(`Record packing temperature/ambient handling and carrier for ${l.name}.`);}
 return {activated:Boolean(activation),quote_snapshot:snapshot,revision:activation?.revision||0,lines,purchases:purchases.map(x=>({...x,stale:x.quote_snapshot!==snapshot})),ready_requirements:ready,ready:ready.length===0};
}
export function mergeCateringPurchases(shopping,operations){
 const result=shopping.map((item,index)=>({...item,key:item.key||'ingredient:'+String(item.item||index).trim().toLowerCase().replace(/\s+/g,' '),qty:(item.quantities||[]).join(' + '),version:0,status:'needed',override:false}));
 for(const p of operations.purchases){const index=result.findIndex(x=>x.key===p.item_key);const row={...(index>=0?result[index]:{}),key:p.item_key,item:p.item,qty:p.qty,quantities:[p.qty],note:p.note,status:p.status,version:p.version,override:true,stale:p.stale,updated_by:p.updated_by,updated_at:p.updated_at};if(index>=0)result[index]=row;else result.push(row);}
 return result;
}
async function checkActor(env,actor,qid,stage){
 if(!actor?.id||actor.pin_verified!==true)return null;
 const staff=await env.DB.prepare('SELECT id,name,role,active FROM staff WHERE id=?').bind(actor.id).first();
 if(!staff?.active)return null;
 if(['owner','kitchen'].includes(staff.role))return stage&&stage!=='packing'?null:staff;
 if(staff.role==='driver'&&['pickup','delivery'].includes(stage)){const assignment=await env.DB.prepare("SELECT id FROM catering_assignments WHERE quote_id=? AND driver_id=? AND status='accepted'").bind(qid,staff.id).first();return assignment?staff:null;}
 return null;
}
export async function mutateCateringOperation(env,b,actor,{at=Date.now(),shopping=[]}={}){
 if(!b||!['line_progress','purchase','temperature'].includes(b.op)||!/^[-\w]{8,100}$/.test(b.idempotency_key||'')||!Number.isSafeInteger(b.expected_version)||b.expected_version<0)return fail('Action, current version and a stable request key are required.',400);
 const staff=await checkActor(env,actor,b.quote_id,b.op==='temperature'?b.stage:null);if(!staff)return fail('An active staff PIN with access to this event is required.',403);
 const q=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(b.quote_id).first();if(!q||q.deposit_status!=='paid')return fail('A current paid booking is required.');
 if(!q.event_date||q.event_date<etDateOf(at))return fail('Past events are read-only; use an explicit correction record.');
 const snapshot=executionQuoteSnapshot(q),ops=await readCateringOperations(env,q),line=ops.lines.find(x=>x.key===b.line_key);
 const note=String(b.note||'').trim();if(note.length>1000)return fail('Keep the note under 1,000 characters.',400);
 const request=JSON.stringify({op:b.op,line_key:b.line_key||null,item_key:b.item_key||null,target:b.target||null,actual_qty:b.actual_qty??null,item:b.item||null,qty:b.qty||null,status:b.status||null,stage:b.stage||null,mode:b.mode||null,temperature_f:b.temperature_f??null,carrier:b.carrier||null,note,expected_version:b.expected_version,actor:staff.id,snapshot});
 const prior=await env.DB.prepare('SELECT request_json FROM catering_operation_receipts WHERE quote_id=? AND request_id=?').bind(q.id,b.idempotency_key).first();if(prior)return prior.request_json===request?{ok:true,replayed:true,operations:ops}:fail('This request key belongs to another action or staff member.');
 const execution=await env.DB.prepare('SELECT status FROM catering_execution WHERE quote_id=?').bind(q.id).first();
 if(['en_route','arrived','completed'].includes(execution?.status)&&b.op!=='temperature')return fail('Kitchen quantities and purchasing lock after departure.');
 const statements=[env.DB.prepare('INSERT INTO catering_operation_receipts(quote_id,request_id,request_json,actor_id,recorded_at) VALUES(?,?,?,?,?)').bind(q.id,b.idempotency_key,request,staff.id,at)];
 const currentGuard=`EXISTS(SELECT 1 FROM catering_quotes q WHERE q.id=? AND q.deposit_status='paid' AND q.quote_json IS ? AND q.event_date IS ? AND q.serving_time IS ? AND q.address IS ? AND q.guests IS ? AND q.dietary_notes IS ?) AND EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND role=?)`;
 const guardArgs=[q.id,q.quote_json,q.event_date,q.serving_time,q.address,q.guests,q.dietary_notes,staff.id,staff.role];
 let recordKey,version=b.expected_version+1;
 if(b.op==='line_progress'){
  if(!line||!progressTargets[line.progress.state]?.includes(b.target))return fail('That production transition is not available.');
  if(execution?.status!=='preparing')return fail('Start catering prep with your PIN before recording actual dish progress.');
  const qty=b.target==='preparing'?0:Number(b.actual_qty);if(!Number.isFinite(qty)||qty<0||qty>100000||b.target!=='preparing'&&qty===0)return fail('Record the actual cooked or packed count.',400);
  if(b.target==='packed'&&qty>line.progress.actual_qty)return fail('Packed quantity cannot exceed the recorded cooked quantity.');
  recordKey=b.line_key;
  statements.push(env.DB.prepare(`INSERT INTO catering_line_progress(quote_id,line_key,quote_snapshot,state,actual_qty,version,updated_by,updated_at) SELECT ?,?,?,?,?,1,?,? WHERE ?=0 AND ${currentGuard} ON CONFLICT(quote_id,line_key) DO UPDATE SET quote_snapshot=excluded.quote_snapshot,state=excluded.state,actual_qty=excluded.actual_qty,version=catering_line_progress.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE catering_line_progress.version=? AND ${currentGuard}`).bind(q.id,b.line_key,snapshot,b.target,qty,staff.id,at,b.expected_version,...guardArgs,b.expected_version,...guardArgs));
 }else if(b.op==='purchase'){
  if(!keyValid(b.item_key)||(!shopping.some(x=>x.key===b.item_key)&&!/^manual_[\w-]{8,100}$/.test(b.item_key)&&!ops.purchases.some(x=>x.item_key===b.item_key)))return fail('Choose a current shopping item or a new manual item.');
  const item=String(b.item||'').trim(),qty=String(b.qty||'').trim();if(!item||item.length>160||!qty||qty.length>160||!['needed','purchased','removed'].includes(b.status)||b.status==='removed'&&!note)return fail('Confirm the item, purchase quantity, status and removal reason.',400);
  recordKey=b.item_key;
  statements.push(env.DB.prepare(`INSERT INTO catering_purchase_items(quote_id,item_key,quote_snapshot,item,qty,note,status,version,updated_by,updated_at) SELECT ?,?,?,?,?,?,?,1,?,? WHERE ?=0 AND ${currentGuard} ON CONFLICT(quote_id,item_key) DO UPDATE SET quote_snapshot=excluded.quote_snapshot,item=excluded.item,qty=excluded.qty,note=excluded.note,status=excluded.status,version=catering_purchase_items.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE catering_purchase_items.version=? AND ${currentGuard}`).bind(q.id,b.item_key,snapshot,item,qty,note||null,b.status,staff.id,at,b.expected_version,...guardArgs,b.expected_version,...guardArgs));
 }else{
  if(!line||!['packing','pickup','delivery'].includes(b.stage)||!['hot','cold','ambient'].includes(b.mode))return fail('Choose a current dish, handling stage and temperature mode.',400);
  const required=b.stage==='packing'?['preparing','ready']:b.stage==='pickup'?['ready']:['arrived'];if(!required.includes(execution?.status))return fail('Record this reading at the actual packing, pickup or delivery stage.');
  const temperature=b.mode==='ambient'?null:Number(b.temperature_f),carrier=String(b.carrier||'').trim();if(!carrier||carrier.length>160||b.mode==='ambient'&&!note||b.mode!=='ambient'&&(!Number.isFinite(temperature)||temperature< -80||temperature>350))return fail('Record the measured temperature and carrier, or explain ambient handling.',400);
  recordKey=b.line_key+':'+b.stage;
  statements.push(env.DB.prepare(`INSERT INTO catering_handling_readings(quote_id,line_key,stage,quote_snapshot,mode,temperature_f,carrier,note,version,updated_by,updated_at) SELECT ?,?,?,?,?,?,?,?,1,?,? WHERE ?=0 AND ${currentGuard} ON CONFLICT(quote_id,line_key,stage) DO UPDATE SET quote_snapshot=excluded.quote_snapshot,mode=excluded.mode,temperature_f=excluded.temperature_f,carrier=excluded.carrier,note=excluded.note,version=catering_handling_readings.version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at WHERE catering_handling_readings.version=? AND ${currentGuard}`).bind(q.id,b.line_key,b.stage,snapshot,b.mode,temperature,carrier,note||null,staff.id,at,b.expected_version,...guardArgs,b.expected_version,...guardArgs));
 }
 // A lost CAS aborts the complete transaction, including its request receipt and audit entry.
 statements.push(env.DB.prepare('UPDATE catering_operation_receipts SET success=CASE WHEN changes()=1 THEN 1 ELSE NULL END WHERE quote_id=? AND request_id=?').bind(q.id,b.idempotency_key));
 statements.push(env.DB.prepare('INSERT INTO catering_operation_events(id,quote_id,operation,record_key,version,actor_id,details_json,recorded_at) VALUES(?,?,?,?,?,?,?,?)').bind(id('cop'),q.id,b.op,recordKey,version,staff.id,request,at));
 statements.push(env.DB.prepare('INSERT INTO catering_operations_activation(quote_id,quote_snapshot,revision,activated_by,activated_at) VALUES(?,?,1,?,?) ON CONFLICT(quote_id) DO UPDATE SET quote_snapshot=excluded.quote_snapshot,revision=catering_operations_activation.revision+1').bind(q.id,snapshot,staff.id,at));
 try{await env.DB.batch(statements);}catch(error){const winner=await env.DB.prepare('SELECT request_json FROM catering_operation_receipts WHERE quote_id=? AND request_id=?').bind(q.id,b.idempotency_key).first();if(winner?.request_json===request)return {ok:true,replayed:true,operations:await readCateringOperations(env,q)};if(/constraint|unique/i.test(String(error)))return fail('The event or record changed. Reload before continuing.');throw error;}
 return {ok:true,by:staff.name,operations:await readCateringOperations(env,q)};
}
export async function cateringKitchenBoard(env,{at=Date.now()}={}){
 const rows=(await env.DB.prepare(`SELECT q.*,e.status AS execution_status,e.version AS execution_version FROM catering_quotes q LEFT JOIN catering_execution e ON e.quote_id=q.id WHERE q.deposit_status='paid' AND q.event_date>=? AND q.event_date<=? AND COALESCE(e.status,'planned') IN ('planned','preparing','ready') ORDER BY q.event_date,q.serving_time LIMIT 100`).bind(etDateOf(at-86400000),etDateOf(at+21*86400000)).all()).results||[];
 const board={pending:[],prep:[],ready:[]};for(const q of rows){const status=q.execution_status==='preparing'?'prep':q.execution_status==='ready'?'ready':'paid';board[status==='paid'?'pending':status].push({id:q.id,quote_id:q.id,is_catering:true,customer_name:q.customer_name,delivery_date:q.event_date,delivery_window:'catering',serving_time:q.serving_time,guests:q.guests,status,execution_status:q.execution_status||'planned',execution_version:q.execution_version||0,items:cateringLineViews(q),event_url:'/hub/kitchen/event.html?id='+encodeURIComponent(q.id),operations:await readCateringOperations(env,q)});}
 return board;
}
export async function mutateCateringKitchenStatus(env,b,actor,{at=Date.now()}={}){
 const staff=await checkActor(env,actor,b.id);if(!staff)return fail('An active kitchen or owner PIN is required.',403);
 if(!['prep_start','mark_ready'].includes(b.action)||!Number.isSafeInteger(b.expected_execution_version)||!/^[-\w]{8,100}$/.test(b.idempotency_key||''))return fail('Current event version and a stable request key are required.',400);
 const q=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(b.id).first();if(!q||q.deposit_status!=='paid')return fail('The catering booking is not confirmed.');
 const e=await readExecution(env,q.id,{at});if(!e.ok)return e;
 const target=b.action==='prep_start'?'preparing':'ready';
 if(target==='ready'){const ops=await readCateringOperations(env,q);if(!ops.ready)return fail(ops.ready_requirements.join(' '));}
 const result=await mutateExecution(env,{op:'transition',quote_id:q.id,target_status:target,expected_version:b.expected_execution_version,idempotency_key:b.idempotency_key,packing_confirmed:target==='ready'}, {role:staff.role,email:null,distinct_id:staff.id,pin_verified:true},{at});
 if(!result.ok)return result;
 if(target==='preparing')await env.DB.prepare('INSERT INTO catering_operations_activation(quote_id,quote_snapshot,revision,activated_by,activated_at) VALUES(?,?,1,?,?) ON CONFLICT(quote_id) DO NOTHING').bind(q.id,executionQuoteSnapshot(q),staff.id,at).run();
 return {...result,id:q.id,is_catering:true,status:target==='preparing'?'prep':'ready',by:staff.name};
}
