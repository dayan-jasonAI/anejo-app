import {square} from './square.js';
const parse=v=>{try{return JSON.parse(v||'{}');}catch{return {};}};
const failure=error=>({ok:false,error});
const canceled=(order,id)=>order?.id===id&&order.state==='CANCELED'&&(!Array.isArray(order.tenders)||!order.tenders.length);
const result=(source,target,baseUrl)=>({ok:true,quote_id:target.id,retired_quote_id:source.id,retained_quote_id:target.id,quote_url:`${baseUrl}/q/${target.access_token}`,url:target.deposit_status==='unpaid'?target.payment_link_url:undefined,total_cents:target.total_cents,deposit_cents:target.deposit_cents});
export async function retireDuplicateQuote(env,body,{actor,baseUrl}) {
 if(body.reviewed!==true)return failure('Review the obsolete and retained quotes before retiring a duplicate.');
 const source=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(String(body.quote_id||'')).first();
 let target=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(String(body.replacement_quote_id||'')).first();
 if(!source||!target||source.id===target.id)return failure('Select two different existing quotes.');
 let journal=await env.DB.prepare('SELECT * FROM catering_quote_duplicate_retirements WHERE source_quote_id=?').bind(source.id).first();
 if(journal&&journal.target_quote_id!==target.id)return failure('This duplicate retirement already names a different retained quote. Recover it first.');
 if(journal?.state==='complete'&&source.deposit_status==='void'&&target.deposit_status!=='void')return result(source,target,baseUrl);
 if(source.deposit_status!=='unpaid'||!['unpaid','paid'].includes(target.deposit_status))return failure('Only an unpaid obsolete quote may be retired in favor of an active quote.');
 if(!source.square_order_id||!source.payment_link_id||!target.square_order_id||!target.payment_link_id||!target.access_token)return failure('Both quotes need their existing checkout identifiers.');
 const old=parse(source.quote_json),next=parse(target.quote_json),sourceLead=source.source_lead_id||old.lead_id,targetLead=target.source_lead_id||next.lead_id;
 const email=v=>String(v||'').trim().toLowerCase(),phone=v=>String(v||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
 const sameLead=sourceLead&&targetLead&&sourceLead===targetLead;
 const sameContact=email(source.customer_email)&&email(source.customer_email)===email(target.customer_email)&&phone(source.customer_phone).length===10&&phone(source.customer_phone)===phone(target.customer_phone);
 if(source.event_date!==target.event_date||(!sameLead&&!sameContact))return failure('Quotes must belong to the same event and verified customer or request.');
 if(!journal){
  if(Number(body.expected_updated_at)!==source.updated_at||Number(body.expected_replacement_updated_at)!==target.updated_at)return failure('A quote changed. Reload both quotes before retiring the duplicate.');
  await env.DB.prepare(`INSERT OR IGNORE INTO catering_quote_duplicate_retirements(source_quote_id,target_quote_id,source_updated_at,target_updated_at,state,created_by,created_at,updated_at)
   SELECT ?,?,?,?,'pending',?,?,? WHERE EXISTS(SELECT 1 FROM catering_quotes WHERE id=? AND deposit_status='unpaid' AND updated_at=?) AND EXISTS(SELECT 1 FROM catering_quotes WHERE id=? AND deposit_status IN ('unpaid','paid') AND updated_at=?)
   AND NOT EXISTS(SELECT 1 FROM catering_quote_revisions WHERE source_quote_id IN (?,?) OR (replacement_quote_id=? AND state!='complete'))
   AND NOT EXISTS(SELECT 1 FROM catering_quote_duplicate_retirements WHERE (source_quote_id IN (?,?) OR target_quote_id IN (?,?)) AND state!='complete')`)
   .bind(source.id,target.id,source.updated_at,target.updated_at,actor,Date.now(),Date.now(),source.id,source.updated_at,target.id,target.updated_at,source.id,target.id,target.id,source.id,target.id,source.id,target.id).run();
  journal=await env.DB.prepare('SELECT * FROM catering_quote_duplicate_retirements WHERE source_quote_id=?').bind(source.id).first();
  if(!journal||journal.target_quote_id!==target.id)return failure('Duplicate retirement could not be claimed. Recover any active revision first.');
 }
 if(source.updated_at!==journal.source_updated_at||target.updated_at!==journal.target_updated_at)return failure('A quote changed after retirement was reviewed. Owner reconciliation is required.');
 const retained=await square(env,`/v2/orders/${encodeURIComponent(target.square_order_id)}`);
 if(!retained.ok||retained.data?.order?.id!==target.square_order_id||!['OPEN','COMPLETED'].includes(retained.data.order.state)||(target.deposit_status==='unpaid'&&retained.data.order.state!=='OPEN'))return failure('The retained checkout could not be verified as active. No obsolete checkout was retired.');
 if(journal.state==='pending'){
  const before=await square(env,`/v2/orders/${encodeURIComponent(source.square_order_id)}`);
  if(!before.ok||before.data?.order?.id!==source.square_order_id)return failure('Cannot verify the obsolete checkout. Reconcile before retrying.');
  if(!canceled(before.data.order,source.square_order_id)){
   if(before.data.order.state!=='OPEN'||before.data.order.tenders?.length)return failure('Payment or a non-editable obsolete order blocks retirement. Review the booking.');
   const retired=await square(env,`/v2/online-checkout/payment-links/${encodeURIComponent(source.payment_link_id)}`,{method:'DELETE'});
   if(!retired.ok||retired.data?.cancelled_order_id!==source.square_order_id)return failure('Obsolete checkout cancellation is unconfirmed. Recover this same retirement before continuing.');
  }
  const proof=await square(env,`/v2/orders/${encodeURIComponent(source.square_order_id)}`);
  if(!proof.ok||!canceled(proof.data?.order,source.square_order_id))return failure('Cancellation or payment state is uncertain. Retirement remains unresolved.');
  await env.DB.prepare("UPDATE catering_quote_duplicate_retirements SET state='retired',updated_at=? WHERE source_quote_id=? AND state='pending'").bind(Date.now(),source.id).run();
 }
 const now=Date.now();
 await env.DB.batch([
  env.DB.prepare("UPDATE catering_quotes SET deposit_status='void',updated_at=? WHERE id=? AND deposit_status='unpaid' AND updated_at=? AND EXISTS(SELECT 1 FROM catering_quotes WHERE id=? AND deposit_status IN ('unpaid','paid') AND updated_at=?)").bind(now,source.id,journal.source_updated_at,target.id,journal.target_updated_at),
  env.DB.prepare("UPDATE catering_quote_duplicate_retirements SET state='complete',updated_at=? WHERE source_quote_id=? AND state='retired' AND EXISTS(SELECT 1 FROM catering_quotes WHERE id=? AND deposit_status='void') AND EXISTS(SELECT 1 FROM catering_quotes WHERE id=? AND deposit_status IN ('unpaid','paid') AND updated_at=?)").bind(now,source.id,source.id,target.id,journal.target_updated_at),
  env.DB.prepare("INSERT OR IGNORE INTO activity_log(id,event,actor_id,actor_role,actor_type,properties,created_at) SELECT ?,'catering.quote_duplicate.retired',?,'owner','human',?,? WHERE EXISTS(SELECT 1 FROM catering_quote_duplicate_retirements WHERE source_quote_id=? AND state='complete')").bind('act_duplicate_'+source.id,actor,JSON.stringify({source_quote_id:source.id,retained_quote_id:target.id,provider_cancellation_verified:true}),now,source.id),
 ]);
 const complete=await env.DB.prepare('SELECT state FROM catering_quote_duplicate_retirements WHERE source_quote_id=?').bind(source.id).first();
 if(complete?.state!=='complete')return failure('The retained quote or original payment changed. Stop and reconcile before sending any quote.');
 target=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(target.id).first();
 if(!target||target.deposit_status==='void')return failure('The retained quote changed after retirement. Recover its current replacement.');
 return result(source,target,baseUrl);
}
