import {json} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {getQuoteFollowup,sendQuoteFollowup,updateQuoteResponse} from '../../../_lib/catering_quote_followup.js';
const reply=(b,status=200)=>json(b,status,{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
export async function onRequestGet({env,request}) {
 try{const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;const u=new URL(request.url),result=await getQuoteFollowup(env,u.searchParams.get('lead_id'),u.searchParams.get('step')||'review_quote');return reply(result,result.ok?200:409);}catch{return reply({error:'Follow-up evidence is unavailable. No email was sent.'},503);}
}
export async function onRequestPost({env,request}) {
 try{
 const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return reply({error:'Origin not allowed.'},403);
 let body;try{body=await request.json();}catch{return reply({error:'Send valid JSON.'},400);}
 if(!body?.lead_id)return reply({error:'Lead required.'},400);
 const actor=ctx.distinct_id||ctx.email;
 const result=body.op==='send'?await sendQuoteFollowup(env,body,actor):body.op==='update_response'?await updateQuoteResponse(env,body,actor):{ok:false,error:'Choose send or update_response.'};
 return reply(result,result.ok?200:409);
 }catch{return reply({error:'Follow-up could not be completed. Check the saved receipt before retrying; do not assume the email failed.'},503);}
}
