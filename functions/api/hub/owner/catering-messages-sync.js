import {json,bad,id} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {syncCateringQuoteSms} from '../../../_lib/catering_conversation.js';
const stages=new Set(['authentication','provider_history','persistence','matching']);
const categories=new Set(['unavailable','http_error','network_error','timeout','invalid_json','invalid_response','invalid_pagination','lookup_incomplete']);
async function failureReceipt(env,quoteId,diagnostic,started) {
 const stage=stages.has(diagnostic?.stage)?diagnostic.stage:'matching';
 const category=categories.has(diagnostic?.category)?diagnostic.category:'lookup_incomplete';
 const status=Number(diagnostic?.http_status);
 const properties={quote_id:/^[A-Za-z0-9_-]{1,100}$/.test(quoteId||'')?quoteId:null,stage,category,elapsed_ms:Math.max(0,Math.min(600000,Date.now()-started))};
 if(Number.isInteger(status)&&status>=100&&status<=599)properties.http_status=status;
 try{await env.DB.prepare("INSERT INTO activity_log(id,event,actor_type,properties,created_at) VALUES(?,'catering.sms_receipt.lookup_failed','system',?,?)").bind(id('act'),JSON.stringify(properties),Date.now()).run();}catch{/* Diagnostics must never prevent the safe error response. */}
}
const response=(body,status)=>json(body,status,{'Cache-Control':'no-store'});
// Reads provider history and reconciles local receipts. Never sends a text.
export async function onRequestPost({request,env}) {
 const started=Date.now();let ctx;
 try{ctx=await requireRole(request,env,['owner']);}
 catch{const diagnostic={stage:'authentication',category:'unavailable'};await failureReceipt(env,null,diagnostic,started);return response({error:'Owner sign-in could not be checked. Please retry later. No new text was sent.',diagnostic},503);}
 if(ctx instanceof Response)return ctx;
 let body;try{body=await request.json();}catch{return bad('Invalid JSON body.');}
 const quoteId=String(body?.quote_id||'').trim();if(!/^[A-Za-z0-9_-]{1,100}$/.test(quoteId))return bad('Valid quote id required.');
 try{
   const result=await syncCateringQuoteSms(env,quoteId);
   if(!result.ok)await failureReceipt(env,quoteId,result.diagnostic,started);
   // Cloudflare may replace 502 bodies with a gateway page; surface this known
   // application failure as JSON503. This does not repair the provider failure.
   return response({...result,status:result.status===502?503:result.status},result.status===502?503:result.status||200);
 }catch{const diagnostic={stage:'persistence',category:'unavailable'};await failureReceipt(env,quoteId,diagnostic,started);return response({error:'Receipt reconciliation could not be persisted. Retry receipt sync later; no new text was sent.',diagnostic},503);}
}
