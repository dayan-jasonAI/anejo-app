import {json,appBaseUrl} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {getBalanceCollection,stageBalanceCollection,sendBalanceCollection} from '../../../_lib/catering_balance_collection.js';

async function handle({request,env},write){
  const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
  try{
    const body=write?await request.json():{quote_id:new URL(request.url).searchParams.get('quote_id')};
    if(!/^cq_[A-Za-z0-9_-]{1,100}$/.test(String(body.quote_id||'')))return json({ok:false,error:'Choose a saved catering quote.'},400);
    const opts={baseUrl:appBaseUrl(env,request),actor:ctx.email||ctx.distinct_id||'owner'};
    let out;
    if(!write)out=await getBalanceCollection(env,body.quote_id);
    else if(body.op==='stage')out=await stageBalanceCollection(env,body.quote_id,opts);
    else if(body.op==='send')out=await sendBalanceCollection(env,body,opts);
    else return json({ok:false,error:'Choose stage or send.'},400);
    return json(out,out.ok?200:409,{'Cache-Control':'no-store'});
  }catch{return json({ok:false,error:'Collection storage or provider access is unavailable. Reload the booking and check saved receipts before retrying.'},503,{'Cache-Control':'no-store'});}
}
export const onRequestGet=ctx=>handle(ctx,false);
export const onRequestPost=ctx=>handle(ctx,true);
