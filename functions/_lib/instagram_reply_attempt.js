import {sendDirectMessage,replyToComment,replyWindow} from './instagram_messaging.js';
import {id} from './util.js';
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const view=(a,replayed=true)=>({ok:a.state==='sent',sent:a.state==='sent',replayed,attempt_id:a.id,message_id:a.message_id,state:a.state,provider_message_id:a.provider_message_id||null,sent_at:a.state==='sent'?a.completed_at:null,error:a.error_code|| (a.state==='claimed'?'send_outcome_pending':a.state==='unknown'?'send_outcome_unknown':null)});
const denied=error=>({ok:false,sent:false,error});
// Provider seam is code-only, not selectable through request data or environment settings.
export async function sendAnaDraft(env,options,provider){return sendReply(env,options,provider);}
async function sendReply(env,{messageId,threadId,expectedBody,initiatedBy='owner',humanRole=null,afterAttemptId=''},provider){
 let attempt;
 try{
 const old=await env.DB.prepare('SELECT * FROM instagram_reply_attempts WHERE message_id=? AND thread_id=?').bind(messageId,threadId).first();if(old)return old.body===expectedBody&&(old.followup_of||'')===afterAttemptId?view(old):denied('draft_changed');
 const message=await env.DB.prepare("SELECT * FROM messages WHERE id=? AND thread_id=? AND direction='outbound' AND channel='instagram' AND sender_role=? AND ai_drafted=? AND sent_at IS NULL AND dismissed_at IS NULL").bind(messageId,threadId,humanRole?'human_pending':'ana_draft',humanRole?0:1).first();
 if(!message||message.body!==expectedBody)return denied('draft_changed');
 if(typeof message.body!=='string'||!message.body.trim()||message.body!==message.body.trim()||message.body.length>1000)return denied('invalid_draft_body');
 const thread=await env.DB.prepare("SELECT * FROM threads WHERE id=? AND audience='instagram'").bind(threadId).first();if(!thread)return denied('thread_unavailable');
 const kind=message.ref_id?'comment':'dm',recipient=kind==='comment'?message.ref_id:thread.external_id;
 if(typeof recipient!=='string'||!recipient)return denied('recipient_unavailable');
 let trigger=message.ref_id;
 if(kind==='dm'){
  const win=replyWindow(thread);if(!win.ok)return denied(win.reason);
  if(message.reply_to_message_id){
   const inbound=await env.DB.prepare("SELECT id,sender_id FROM messages WHERE id=? AND thread_id=? AND direction='inbound' AND channel='instagram' AND created_at<=?").bind(message.reply_to_message_id,threadId,message.created_at).first();if(!inbound||inbound.sender_id!==recipient)return denied('inbound_trigger_unavailable');trigger=inbound.id;
  }else{
   const candidates=await env.DB.prepare("SELECT id,created_at,sender_id FROM messages WHERE thread_id=? AND direction='inbound' AND channel='instagram' AND created_at<=? ORDER BY created_at DESC,id DESC LIMIT 2").bind(threadId,message.created_at).all();
   const rows=candidates?.results;if(!Array.isArray(rows)||!rows.length||rows[0].sender_id!==recipient||(rows.length>1&&rows[0].created_at===rows[1].created_at))return denied('inbound_trigger_unavailable');trigger=rows[0].id;
  }
 }
 if(afterAttemptId){
  if(!humanRole)return denied('invalid_followup');
  const parent=await env.DB.prepare("SELECT id FROM instagram_reply_attempts WHERE id=? AND thread_id=? AND kind=? AND trigger_id=? AND state='sent'").bind(afterAttemptId,threadId,kind,trigger).first();if(!parent)return denied('followup_not_confirmed');
 }
 const existing=await env.DB.prepare('SELECT * FROM instagram_reply_attempts WHERE kind=? AND trigger_id=? AND followup_of=?').bind(kind,trigger,afterAttemptId).first();
 if(existing)return humanRole&&existing.message_id!==messageId?{...denied('reply_already_recorded'),previous_attempt_id:existing.id,state:existing.state}:view(existing);
 const pending=await env.DB.prepare("SELECT * FROM instagram_reply_attempts WHERE thread_id=? AND state IN ('claimed','unknown') LIMIT 1").bind(threadId).first();if(pending)return {...denied('thread_send_unresolved'),previous_attempt_id:pending.id,state:pending.state};
 const attemptId=id('ira'),at=Date.now(),bodyHash=await hash(message.body);
 const claim=await env.DB.prepare(`INSERT INTO instagram_reply_attempts(id,message_id,thread_id,kind,trigger_id,followup_of,recipient_id,body,body_sha256,initiated_by,state,created_at)
 SELECT ?,?,?,?,?,?,?,?,?,?,'claimed',? FROM messages m JOIN threads t ON t.id=m.thread_id WHERE m.id=? AND m.thread_id=? AND m.body=? AND COALESCE(m.ref_id,'')=? AND COALESCE(m.reply_to_message_id,'')=? AND m.sender_role=? AND m.ai_drafted=? AND m.direction='outbound' AND m.channel='instagram' AND m.sent_at IS NULL AND m.dismissed_at IS NULL AND t.audience='instagram' AND COALESCE(t.external_id,'')=? AND COALESCE(t.last_inbound_at,0)=? AND (?='comment' OR EXISTS (SELECT 1 FROM messages inbound WHERE inbound.id=? AND inbound.thread_id=m.thread_id AND inbound.direction='inbound' AND inbound.channel='instagram' AND inbound.sender_id=? AND inbound.created_at<=m.created_at)) AND NOT EXISTS (SELECT 1 FROM instagram_reply_attempts pending WHERE pending.thread_id=m.thread_id AND pending.state IN ('claimed','unknown'))
 ON CONFLICT DO NOTHING`).bind(attemptId,messageId,threadId,kind,trigger,afterAttemptId,recipient,message.body,bodyHash,initiatedBy,at,messageId,threadId,message.body,message.ref_id||'',message.reply_to_message_id||'',humanRole?'human_pending':'ana_draft',humanRole?0:1,thread.external_id||'',thread.last_inbound_at||0,kind,trigger,recipient).run();
 if(claim.meta?.changes!==1){const prior=await env.DB.prepare('SELECT * FROM instagram_reply_attempts WHERE kind=? AND trigger_id=? AND followup_of=?').bind(kind,trigger,afterAttemptId).first();return prior?(humanRole&&prior.message_id!==messageId?{...denied('reply_already_recorded'),previous_attempt_id:prior.id,state:prior.state}:view(prior)):denied('draft_changed');}
 attempt=await env.DB.prepare('SELECT * FROM instagram_reply_attempts WHERE id=?').bind(attemptId).first();if(!attempt)return denied('claim_not_verified');
 let outcome;try{outcome=provider?await provider({kind,thread,recipientId:recipient,text:message.body}):kind==='comment'?await replyToComment(env,{commentId:recipient,text:message.body}):await sendDirectMessage(env,{thread,recipientId:recipient,text:message.body});}catch{outcome={ok:false,delivery_uncertain:true};}
 const providerId=outcome?.body?.message_id||outcome?.body?.id;
 const validId=typeof providerId==='string'&&providerId.length>0&&providerId.length<=200;
 const state=outcome?.ok&&validId?'sent':outcome?.delivery_uncertain||outcome?.ok?'unknown':'failed';
 const error=state==='sent'?null:state==='unknown'?'provider_outcome_unknown':outcome?.blocked==='window_closed'?'window_closed':outcome?.blocked==='never_messaged_us'?'never_messaged_us':'provider_rejected';
 const completed=Date.now();
 try{
 const statements=[env.DB.prepare("UPDATE instagram_reply_attempts SET state=?,provider_message_id=?,error_code=?,completed_at=? WHERE id=? AND state='claimed'").bind(state,validId?providerId:null,error,completed,attemptId)];
 if(state==='sent'){
  statements.push(env.DB.prepare("UPDATE messages SET sent_at=?,sender_role=? WHERE id=? AND sent_at IS NULL").bind(completed,humanRole||(initiatedBy==='ana_auto'?'ana_auto':'ana_draft'),messageId));
  statements.push(env.DB.prepare('UPDATE threads SET last_message_at=?,updated_at=? WHERE id=?').bind(completed,completed,threadId));
 }
 const written=await env.DB.batch(statements);
 if(!Array.isArray(written)||written.some(r=>r?.success===false))throw Error("receipt_write_failed");
 const saved=await env.DB.prepare('SELECT * FROM instagram_reply_attempts WHERE id=?').bind(attemptId).first();return saved?view(saved,false):denied('send_receipt_unavailable');
 }catch{
  try{await env.DB.prepare("UPDATE instagram_reply_attempts SET state='unknown',provider_message_id=?,error_code='send_receipt_unavailable',completed_at=? WHERE id=? AND state='claimed'").bind(validId?providerId:null,completed,attemptId).run();}catch{/* existing claim blocks another send */}
  return {ok:false,sent:false,attempt_id:attemptId,state:'unknown',error:'send_receipt_unavailable'};
 }
 }catch{return {ok:false,sent:false,state:attempt?'unknown':undefined,error:'send_state_unavailable'};}
}

// Human Comms replies are a separate explicit intent, coordinated with the same inbound slot.
export async function sendHumanInstagramReply(env,{threadId,body,requestId,afterAttemptId='',actorId,actorRole},provider){
 if(typeof requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(requestId)||!actorId)return denied('request_id_required');
 if(typeof body!=='string'||!body.trim()||body!==body.trim()||body.length>1000||typeof afterAttemptId!=='string'||afterAttemptId.length>100)return denied('invalid_reply');
 try{
 const mid='human_'+await hash(JSON.stringify([actorId,requestId.toLowerCase()]));
 let message=await env.DB.prepare('SELECT * FROM messages WHERE id=?').bind(mid).first();
 if(message&&(message.thread_id!==threadId||message.body!==body||message.sender_id!==actorId))return denied('request_key_conflict');
 if(!message){
  const thread=await env.DB.prepare("SELECT * FROM threads WHERE id=? AND audience='instagram'").bind(threadId).first();if(!thread)return denied('thread_unavailable');
  const inbound=await env.DB.prepare("SELECT id,ref_id,sender_id,created_at FROM messages WHERE thread_id=? AND direction='inbound' AND channel='instagram' ORDER BY created_at DESC,id DESC LIMIT 2").bind(threadId).all();
  const rows=inbound?.results;if(!Array.isArray(rows)||!rows.length||(rows.length>1&&rows[0].created_at===rows[1].created_at))return denied('inbound_trigger_unavailable');
  const last=rows[0],comment=thread.ref_type==='ig_media';if(comment?!last.ref_id:last.sender_id!==thread.external_id)return denied('inbound_trigger_unavailable');
  await env.DB.prepare("INSERT INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,ai_drafted,created_at,ref_id,reply_to_message_id) VALUES (?,?,'outbound','instagram',?,'human_pending',?,0,?,?,?) ON CONFLICT(id) DO NOTHING").bind(mid,threadId,actorId,body,Date.now(),comment?last.ref_id:null,last.id).run();
  message=await env.DB.prepare('SELECT * FROM messages WHERE id=?').bind(mid).first();
  if(!message||message.thread_id!==threadId||message.body!==body||message.sender_id!==actorId)return denied('request_key_conflict');
 }
 const result=await sendReply(env,{messageId:mid,threadId,expectedBody:body,initiatedBy:actorId,humanRole:actorRole,afterAttemptId},provider);
 if(result.ok&&!result.replayed){
  try{await env.DB.prepare("UPDATE messages SET dismissed_at=? WHERE thread_id=? AND sender_role='ana_draft' AND sent_at IS NULL AND dismissed_at IS NULL AND ((ref_id IS NOT NULL AND ref_id=?) OR reply_to_message_id=?) AND NOT EXISTS (SELECT 1 FROM instagram_reply_attempts WHERE message_id=messages.id)").bind(Date.now(),threadId,message.ref_id,message.reply_to_message_id).run();}catch{/* sent receipt remains authoritative; failed cleanup grants no send authority */}
 }
 return result;
 }catch{return denied('send_state_unavailable');}
}
