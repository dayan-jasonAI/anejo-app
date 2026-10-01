import {json,bad} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {readCateringAssignments,mutateCateringAssignment} from '../../../_lib/catering_assignment.js';
export async function onRequestGet({request,env}) {
 const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
 const quote_id=new URL(request.url).searchParams.get('quote_id');if(!quote_id)return bad('Event id required.');
 try{const r=await readCateringAssignments(env,ctx,{quote_id});return json(r,r.status||200);}catch{return bad('Could not load catering assignment.',500);}
}
export async function onRequestPost({request,env}) {
 const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
 let b;try{b=await request.json();}catch{return bad('Invalid JSON body.');}
 try{const r=await mutateCateringAssignment(env,b,ctx);return json(r,r.status||200);}catch{return bad('Assignment outcome is unconfirmed. Retry the same request.',500);}
}
