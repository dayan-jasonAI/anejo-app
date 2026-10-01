import {json,bad} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {readCateringAssignments,mutateCateringAssignment} from '../../../_lib/catering_assignment.js';
export async function onRequestGet({request,env}) {
 const ctx=await requireRole(request,env,['driver']);if(ctx instanceof Response)return ctx;
 const url=new URL(request.url);
 try{const r=await readCateringAssignments(env,ctx,{assignment_id:url.searchParams.get('assignment_id'),date:url.searchParams.get('date')});return json(r,r.status||200);}catch{return bad('Could not load catering assignments.',500);}
}
export async function onRequestPost({request,env}) {
 const ctx=await requireRole(request,env,['driver']);if(ctx instanceof Response)return ctx;
 let b;try{b=await request.json();}catch{return bad('Invalid JSON body.');}
 try{const r=await mutateCateringAssignment(env,b,ctx);return json(r,r.status||200);}catch{return bad('Assignment outcome is unconfirmed. Retry the same request.',500);}
}
