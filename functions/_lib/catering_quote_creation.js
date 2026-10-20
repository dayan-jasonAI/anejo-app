import {createDepositCheckout} from './catering_deposit.js';
import {mintAccessToken} from './catering_quote_delivery.js';
import {id} from './hub.js';
const parse=v=>{try{return JSON.parse(v||'{}');}catch{return {};}};
const digest=async v=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(v))))].map(n=>n.toString(16).padStart(2,'0')).join('');
export async function existingCateringQuote(env,payload) {
 const email=String(payload.customerEmail||'').trim().toLowerCase(),lead=payload.quoteBreakdown?.lead_id;
 const rows=(await env.DB.prepare("SELECT * FROM catering_quotes WHERE deposit_status!='void' AND (source_lead_id=? OR lower(customer_email)=? OR (json_valid(quote_json) AND json_extract(quote_json,'$.lead_id')=?)) ORDER BY created_at DESC").bind(lead||'',email,lead||'').all()).results||[];
 return rows.filter(q=>(lead&&(q.source_lead_id===lead||parse(q.quote_json).lead_id===lead))||(email&&String(q.customer_email||'').toLowerCase()===email&&q.event_date===payload.eventDate));
}
export async function createUniqueCateringQuote(env,payload) {
 const email=String(payload.customerEmail||'').trim().toLowerCase(),lead=payload.quoteBreakdown?.lead_id;
 if(!lead&&(!email||!payload.eventDate))return {ok:false,error:'Choose a source request, or enter customer email and event date before creating a checkout.'};
 const creationKey=await digest(email&&payload.eventDate?['customer-event',email,payload.eventDate]:['lead',lead]);
 const {createdBy,send,...stable}=payload;void createdBy;void send;
 const requestHash=await digest(stable);
 let claim=await env.DB.prepare('SELECT * FROM catering_quote_creations WHERE creation_key=? OR lead_id=?').bind(creationKey,lead||null).first();
 if(claim){
  const row=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(claim.quote_id).first();
  if(row){if(row.deposit_status!=='unpaid')return {ok:false,error:'The original checkout is no longer payable. Open its current quote or booking instead.',existing_quote_id:row.id,requires_revision:true};
   const revising=await env.DB.prepare('SELECT source_quote_id FROM catering_quote_revisions WHERE source_quote_id=? OR (replacement_quote_id=? AND state!=\'complete\')').bind(row.id,row.id).first();
   if(revising)return {ok:false,error:'This quote is being revised. Recover its current replacement instead of creating another.',existing_quote_id:row.id,requires_revision:true};
   if(claim.request_hash!==requestHash)return {ok:false,error:'This request already has a quote. Open and revise it instead of creating another.',existing_quote_id:row.id,requires_revision:true};await env.DB.prepare("UPDATE catering_quote_creations SET state='complete',updated_at=? WHERE creation_key=?").bind(Date.now(),creationKey).run();return {ok:true,quote_id:row.id,quote_url:`${payload.baseUrl}/q/${row.access_token}`,url:row.payment_link_url,total_cents:row.total_cents,deposit_cents:row.deposit_cents,balance_cents:row.balance_cents,replayed:true};}
  return {ok:false,error:'A checkout creation is already pending or needs reconciliation. No new checkout was created.',creation_pending:true};
 }
 const existing=await existingCateringQuote(env,payload);
 if(existing.length)return {ok:false,error:'This request already has an active quote. Open and revise it instead of creating another.',existing_quote_id:existing[0].id,active_quote_ids:existing.map(q=>q.id),requires_revision:true};
 const quoteId=id('cq'),token=mintAccessToken(),now=Date.now();
 await env.DB.prepare("INSERT OR IGNORE INTO catering_quote_creations(creation_key,lead_id,request_hash,quote_id,access_token,payload_json,state,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?)").bind(creationKey,lead||null,requestHash,quoteId,token,JSON.stringify({...payload,send:false}),now,now).run();
 claim=await env.DB.prepare('SELECT * FROM catering_quote_creations WHERE creation_key=? OR lead_id=?').bind(creationKey,lead||null).first();
 if(!claim||claim.quote_id!==quoteId)return {ok:false,error:'Another checkout creation was claimed first. Reload the request before continuing.',creation_pending:true};
 const lease=await env.DB.prepare("UPDATE catering_quote_creations SET state='creating',updated_at=? WHERE creation_key=? AND quote_id=? AND state='pending'").bind(Date.now(),creationKey,quoteId).run();
 if(lease.meta?.changes!==1)return {ok:false,error:'Checkout creation is already being processed.',creation_pending:true};
 let result;
 try{result=await createDepositCheckout(env,{...parse(claim.payload_json),fixedQuoteId:quoteId,fixedAccessToken:token,send:false});}catch{result={ok:false,error:'Checkout creation outcome is unconfirmed. Reconciliation is required before another attempt.'};}
 await env.DB.prepare('UPDATE catering_quote_creations SET state=?,last_error=?,updated_at=? WHERE creation_key=?').bind(result.ok?'complete':'needs_review',result.ok?null:'Creation outcome requires provider reconciliation',Date.now(),creationKey).run();
 return result;
}
