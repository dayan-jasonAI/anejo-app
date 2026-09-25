import {sendDirectMessage,replyToComment,replyWindow} from './instagram_messaging.js';
import {id} from './util.js';
const hash=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const view=(a,replayed=true)=>({ok:a.state==='sent',sent:a.state==='sent',replayed,attempt_id:a.id,message_id:a.message_id,state:a.state,provider_message_id:a.provider_message_id||null,sent_at:a.state==='sent'?a.completed_at:null,error:a.error_code|| (a.state==='claimed'?'send_outcome_pending':a.state==='unknown'?'send_outcome_unknown':null)});
const denied=error=>({ok:false,sent:false,error});
// Provider seam is code-only, not selectable through request data or environment settings.
export async function sendAnaDraft(env,{messageId,threadId,expectedBody,initiatedBy='owner'},provider){
 let attempt;
 try{
 const old=await env.DB.prepare('SELECT * FROM instagram_reply_attempts WHERE message_id=? AND thread_id=?').bind(messageId,threadId).first();if(old)return view(old);
 const message=await env.DB.prepare("SELECT * FROM messages WHERE id=? AND thread_id=? AND direction='outbound' AND channel='instagram' AND sender_role='ana_draft' AND ai_drafted=1 AND sent_at IS NULL AND dismissed_at IS NULL").bind(messageId,threadId).first();
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
 const existing=await env.DB.prepare('SELECT * FROM instagram_reply_attempts WHERE thread_id=? AND kind=? AND trigger_id=?').bind(threadId,kind,trigger).first();if(existing)return view(existing);
 const attemptId=id('ira'),at=Date.now(),bodyHash=await hash(message.body);
 const claim=await env.DB.prepare(`INSERT INTO instagram_reply_attempts(id,message_id,thread_id,kind,trigger_id,recipient_id,body,body_sha256,initiated_by,state,created_at)
 SELECT ?,?,?,?,?,?,?,?,?,'claimed',? FROM messages m JOIN threads t ON t.id=m.thread_id WHERE m.id=? AND m.thread_id=? AND m.body=? AND COALESCE(m.ref_id,'')=? AND COALESCE(m.reply_to_message_id,'')=? AND m.sender_role='ana_draft' AND m.ai_drafted=1 AND m.direction='outbound' AND m.channel='instagram' AND m.sent_at IS NULL AND m.dismissed_at IS NULL AND t.audience='instagram' AND COALESCE(t.external_id,'')=? AND COALESCE(t.last_inbound_at,0)=?
 ON CONFLICT DO NOTHING`).bind(attemptId,messageId,threadId,kind,trigger,recipient,message.body,bodyHash,initiatedBy,at,messageId,threadId,message.body,message.ref_id||'',message.reply_to_message_id||'',thread.external_id||'',thread.last_inbound_at||0).run();
 if(claim.meta?.changes!==1){const prior=await env.DB.prepare('SELECT * FROM instagram_reply_attempts WHERE thread_id=? AND kind=? AND trigger_id=?').bind(threadId,kind,trigger).first();return prior?view(prior):denied('draft_changed');}
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
  statements.push(env.DB.prepare("UPDATE messages SET sent_at=?,sender_role=? WHERE id=? AND sent_at IS NULL").bind(completed,initiatedBy==='ana_auto'?'ana_auto':'ana_draft',messageId));
  statements.push(env.DB.prepare('UPDATE threads SET last_message_at=?,updated_at=? WHERE id=?').bind(completed,completed,threadId));
 }
 await env.DB.batch(statements);
 const saved=await env.DB.prepare('SELECT * FROM instagram_reply_attempts WHERE id=?').bind(attemptId).first();return saved?view(saved,false):denied('send_receipt_unavailable');
 }catch{
  try{await env.DB.prepare("UPDATE instagram_reply_attempts SET state='unknown',provider_message_id=?,error_code='send_receipt_unavailable',completed_at=? WHERE id=? AND state='claimed'").bind(validId?providerId:null,completed,attemptId).run();}catch{/* existing claim blocks another send */}
  return {ok:false,sent:false,attempt_id:attemptId,state:'unknown',error:'send_receipt_unavailable'};
 }
 }catch{return {ok:false,sent:false,state:attempt?'unknown':undefined,error:'send_state_unavailable'};}
}
