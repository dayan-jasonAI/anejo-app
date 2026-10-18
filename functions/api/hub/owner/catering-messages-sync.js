import {json,bad} from '../../../_lib/util.js';
import {requireRole} from '../../../_lib/roles.js';
import {syncCateringQuoteSms} from '../../../_lib/catering_conversation.js';
// POST performs local reconciliation using read-only provider requests. Never sends a text.
export async function onRequestPost({request,env}) {
 const ctx=await requireRole(request,env,['owner']);if(ctx instanceof Response)return ctx;
 let body;try{body=await request.json();}catch{return bad('Invalid JSON body.');}
 const quoteId=String(body.quote_id||'').trim();if(!quoteId)return bad('Quote id required.');
 try{const result=await syncCateringQuoteSms(env,quoteId);return json(result,result.status||200);}
 catch{return bad('Receipt reconciliation could not be persisted. No new message was sent.',503);}
}
