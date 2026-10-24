import {emailShell,escHtml,sendEmail} from './email.js';
import {id,isEmail} from './util.js';
import {ensureCateringConversation} from './catering_conversation.js';
const fail=error=>({ok:false,error});
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
const leadFor=(env,leadId)=>env.DB.prepare("SELECT id,name,email FROM leads WHERE id=? AND kind='catering'").bind(leadId).first();
const draftView=row=>({...JSON.parse(row.snapshot_json),draft_id:row.id,review_hash:row.review_hash,status:row.status,receipt_id:row.receipt_id});
function render(lead,subject,body){
 const recipient=String(lead.email||'').trim().toLowerCase();
 return {recipient,subject,text:body,html:emailShell(`<p>${escHtml(lead.name||'Hello')},</p><div style="white-space:pre-line">${escHtml(body)}</div><p style="color:#6b7268;font-size:13px">Dayan · Añejo Catering Co.</p>`)};
}
export async function getCateringMessages(env,leadId){
 const lead=await leadFor(env,leadId);if(!lead)return fail('Catering request not found.');
 const rows=(await env.DB.prepare('SELECT id,status,receipt_id,error,created_at,updated_at,snapshot_json FROM catering_message_drafts WHERE lead_id=? ORDER BY created_at DESC LIMIT 30').bind(leadId).all()).results||[];
 return {ok:true,name:lead.name,recipient:lead.email,history:rows.map(row=>({draft_id:row.id,status:row.status,receipt_id:row.receipt_id,error:row.error,created_at:row.created_at,subject:JSON.parse(row.snapshot_json).subject,delivery_verified:false}))};
}
export async function stageCateringMessage(env,b,actor){
 const lead=await leadFor(env,b.lead_id);if(!lead||!isEmail(lead.email))return fail('Save a valid email on this catering request first.');
 const subject=String(b.subject||'').trim(),body=String(b.body||'').trim();
 if(!subject||subject.length>160||/[\r\n]/.test(subject)||!body||body.length>6000)return fail('Enter a subject up to 160 characters and a message up to 6,000 characters.');
 const snapshot=render(lead,subject,body),reviewHash=await hash(snapshot),now=Date.now();
 const prior=await env.DB.prepare('SELECT * FROM catering_message_drafts WHERE lead_id=? AND review_hash=? ORDER BY created_at DESC LIMIT 1').bind(lead.id,reviewHash).first();
 if(prior)return {ok:prior.status==='staged',draft:draftView(prior),error:prior.status==='staged'?undefined:'This message already has a send attempt. Review its receipt before repeating it.'};
 const draftId=id('cmd');
 await env.DB.prepare('INSERT OR IGNORE INTO catering_message_drafts(id,lead_id,recipient,review_hash,snapshot_json,status,created_at,updated_at,actor) VALUES(?,?,?,?,?,\'staged\',?,?,?)').bind(draftId,lead.id,snapshot.recipient,reviewHash,JSON.stringify(snapshot),now,now,actor).run();
 const saved=await env.DB.prepare('SELECT * FROM catering_message_drafts WHERE lead_id=? AND review_hash=?').bind(lead.id,reviewHash).first();
 if(!saved)throw Error('Draft persistence unavailable');
 return {ok:saved.status==='staged',draft:draftView(saved),error:saved.status==='staged'?undefined:'This email already has a send attempt. Check its saved receipt.'};
}
export async function sendCateringMessage(env,b,actor){
 if(b.reviewed!==true||!/^[a-f0-9]{64}$/.test(b.review_hash||''))return fail('Review the branded email before sending.');
 const draft=await env.DB.prepare('SELECT * FROM catering_message_drafts WHERE id=? AND lead_id=? AND review_hash=?').bind(String(b.draft_id||''),String(b.lead_id||''),b.review_hash).first();
 if(!draft)return fail('The reviewed draft was not found.');
 if(draft.status==='accepted')return {ok:true,status:'accepted',receipt_id:draft.receipt_id,replayed:true,provider_accepted:true,delivery_verified:false};
 if(draft.status!=='staged')return fail('An earlier send has an unconfirmed outcome. Reconcile its receipt before retrying.');
 const lead=await leadFor(env,draft.lead_id),snapshot=JSON.parse(draft.snapshot_json);
 if(!lead||await hash(render(lead,snapshot.subject,snapshot.text))!==draft.review_hash)return fail('Customer details changed. Stage and review the current email.');
 const unresolved=await env.DB.prepare("SELECT id FROM catering_message_drafts WHERE lead_id=? AND status IN ('sending','unknown') LIMIT 1").bind(lead.id).first();
 if(unresolved)return fail('An earlier email has an unconfirmed outcome. Reconcile before sending another.');
 // Prepare thread before provider call; a missing conversation must not lose a sent message.
 const thread=await ensureCateringConversation(env,{lead});
 let claim;try{claim=await env.DB.prepare("UPDATE catering_message_drafts SET status='sending',updated_at=? WHERE id=? AND status='staged'").bind(Date.now(),draft.id).run();}catch{return fail('Another email has an unconfirmed outcome. Check its receipt before sending.');}
 if(claim.meta?.changes!==1)return fail('Another send already claimed this draft.');
 let receiptId=null;
 try{
  const fresh=await leadFor(env,draft.lead_id);
  if(!fresh||await hash(render(fresh,snapshot.subject,snapshot.text))!==draft.review_hash)throw Error('Customer details changed before send.');
  const suppression=await env.DB.prepare('SELECT reason FROM email_suppressions WHERE email=?').bind(snapshot.recipient).first();
  if(suppression){await env.DB.prepare("UPDATE catering_message_drafts SET status='suppressed',error='suppressed',updated_at=? WHERE id=?").bind(Date.now(),draft.id).run();return fail('Customer email is suppressed; no message was sent.');}
  const receipt=await sendEmail(env,{to:snapshot.recipient,subject:snapshot.subject,html:snapshot.html,text:snapshot.text,replyTo:'dayan@anejocateringco.com',idempotencyKey:'catering-message-'+draft.id,timeoutMs:15000});
  if(receipt?.skipped)throw Error('Suppression changed before provider call.');
  if(typeof receipt?.id!=='string'||!/^[A-Za-z0-9_-]{1,192}$/.test(receipt.id))throw Error('Provider receipt unverified.');
  receiptId=receipt.id;const now=Date.now();
  await env.DB.batch([
   env.DB.prepare("UPDATE catering_message_drafts SET status='accepted',receipt_id=?,updated_at=? WHERE id=?").bind(receiptId,now,draft.id),
   env.DB.prepare("INSERT OR IGNORE INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,ai_drafted,created_at) VALUES(?,?,'outbound','email',?,'owner',?,0,?)").bind('msg_'+draft.id,thread.id,actor,snapshot.subject+'\n\n'+snapshot.text,now),
   env.DB.prepare('UPDATE threads SET last_message_at=?,updated_at=? WHERE id=?').bind(now,now,thread.id)
  ]);
  return {ok:true,status:'accepted',receipt_id:receiptId,provider_accepted:true,delivery_verified:false};
 }catch{
  try{await env.DB.prepare("UPDATE catering_message_drafts SET status='unknown',receipt_id=?,error='Reconcile provider outcome before retrying',updated_at=? WHERE id=?").bind(receiptId,Date.now(),draft.id).run();}catch{/* durable claim remains */}
  return {...fail('Provider outcome needs reconciliation. Do not resend.'),status:'unknown',receipt_id:receiptId,provider_accepted:Boolean(receiptId),delivery_verified:false};
 }
}
