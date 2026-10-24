import {json} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {getCateringMessages,stageCateringMessage,sendCateringMessage} from '../../../_lib/catering_messages.js';
async function handle({request,env},write){
 const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
 try{
  const b=write?await request.json():{lead_id:new URL(request.url).searchParams.get('lead_id')};
  if(!/^ld_[A-Za-z0-9_-]{1,100}$/.test(String(b.lead_id||'')))return json({ok:false,error:'Choose a catering request.'},400);
  const actor=ctx.distinct_id||ctx.email||'owner';
  const out=!write?await getCateringMessages(env,b.lead_id):b.op==='stage'?await stageCateringMessage(env,b,actor):b.op==='send'?await sendCateringMessage(env,b,actor):{ok:false,error:'Choose stage or send.'};
  return json(out,out.ok?200:409,{'Cache-Control':'no-store'});
 }catch{return json({ok:false,error:'Email storage is unavailable. Check saved receipts before retrying.'},503,{'Cache-Control':'no-store'});}
}
export const onRequestGet=ctx=>handle(ctx,false);
export const onRequestPost=ctx=>handle(ctx,true);
