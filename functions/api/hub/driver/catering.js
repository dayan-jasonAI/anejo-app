import {runCateringServiceMessages} from '../../../_lib/catering_service_messages.js';
import {json,bad} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {readCateringAssignments,mutateCateringAssignment} from '../../../_lib/catering_assignment.js';
import {mutateCateringOperation} from '../../../_lib/catering_operations.js';
export async function onRequestGet({request,env}) {
 const ctx=await requireRole(request,env,['driver']);if(ctx instanceof Response)return ctx;
 const url=new URL(request.url);
 try{const r=await readCateringAssignments(env,ctx,{assignment_id:url.searchParams.get('assignment_id'),date:url.searchParams.get('date')});return json(r,r.status||200);}catch{return bad('Could not load catering assignments.',500);}
}
export async function onRequestPost({request,env,waitUntil}) {
 const ctx=await requireRole(request,env,['driver']);if(ctx instanceof Response)return ctx;
 let b;try{b=await request.json();}catch{return bad('Invalid JSON body.');}
 if(b.op==='temperature'){
  try{const assignment=await readCateringAssignments(env,ctx,{assignment_id:b.assignment_id});if(!assignment.ok)return json(assignment,assignment.status||403);const r=await mutateCateringOperation(env,{...b,quote_id:assignment.assignment.quote_id},{id:ctx.distinct_id,pin_verified:true});if(!r.ok)return json(r,r.status||409);return json({...await readCateringAssignments(env,ctx,{assignment_id:b.assignment_id}),handling_saved:true,replayed:!!r.replayed,by:r.by});}catch{return bad('Handling record outcome is unconfirmed. Retry the same request key.',503);}
 }
 try{const r=await mutateCateringAssignment(env,b,ctx);if(r.ok&&typeof waitUntil==='function')waitUntil(runCateringServiceMessages(env).catch(()=>null));return json(r,r.status||200);}catch{return bad('Assignment outcome is unconfirmed. Retry the same request.',500);}
}
