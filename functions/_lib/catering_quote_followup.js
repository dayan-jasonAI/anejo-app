import { emailShell, escHtml, sendEmail } from './email.js';
import { quoteForLead } from './catering_lead_service.js';
import { ensureCateringConversation } from './catering_conversation.js';
import { cateringEventTimestamp } from './catering-notice.js';
import { quoteUrl } from './catering_quote_delivery.js';
import { id } from './util.js';
export const FOLLOWUP_VERSION='catering-quote-review-v1';
export const FOLLOWUP_STEPS=['review_quote','clarify_questions','final_checkin'];
export const RESPONSE_STATES=['awaiting_reply','replied','call_requested','changes_requested','declined'];
const DAY=86400000;
const parse=value=>{try{return JSON.parse(value||'{}');}catch{return {};}};
const fail=error=>({ok:false,error});
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');
export function quoteFollowupEmail(quote,env,step='review_quote') {
 const es=quote.lang==='es',name=String(quote.customer_name||'').trim().split(/\s+/)[0],base=env.APP_BASE_URL?new URL(env.APP_BASE_URL).origin:'https://anejocateringco.com';
 const url=quoteUrl(quote.access_token,base);
 const eventAt=cateringEventTimestamp(quote.event_date,'12:00');
 const event=eventAt===null?(es?'tu celebración':'your celebration'):new Intl.DateTimeFormat(es?'es-US':'en-US',{dateStyle:'long',timeZone:'America/New_York'}).format(new Date(eventAt));
 const subject=es?'Un seguimiento de tu cotización de catering Añejo':'A quick follow-up on your Añejo catering quote';
 const greeting=es?`Hola${name?' '+name:''},`:`Hi${name?' '+name:''},`;
 const openings={
  review_quote:es?`Quería asegurarme de que recibiste tu cotización de catering para el ${event}. Puedes revisarla aquí cuando tengas un momento.`:`I wanted to make sure you received your catering quote for ${event}. You can review it here whenever you have a moment.`,
  clarify_questions:es?`Quería saber si tienes alguna pregunta sobre tu cotización de catering para el ${event}. Con gusto te ayudo a encontrar una opción que encaje con tu celebración.`:`I wanted to check whether you have any questions about your catering quote for ${event}. I would be happy to help you find the right fit for your celebration.`,
  final_checkin:es?`Quería consultarte cómo van los planes para tu celebración del ${event}. Si aún estás considerando el catering, tu cotización está aquí para que la revises cuando te convenga.`:`I wanted to check how your plans for ${event} are coming along. If you are still considering catering, your quote is here to review whenever convenient.`
 };
 const copy=openings[step];
 const closing=es?'Si quieres ajustar el menú o las cantidades, puedes hacer los cambios directamente desde la cotización. También puedes responder a este correo con tus preguntas o solicitar una llamada desde la página de la cotización. Con gusto te ayudo a encontrar la mejor opción para tu celebración.':'If you’d like to adjust the menu or quantities, you can make changes directly from the quote. You can also reply to this email with questions or request a call through the quote page. I’d be happy to help you find the right fit for your celebration.';
 const cta=es?'Revisar mi cotización':'Review your quote';
 const text=`${greeting}\n\n${copy}\n\n${cta}: ${url}\n\n${closing}\n\n${es?'Con cariño':'Warmly'},\nDayan\nAñejo Catering Co.`;
 const html=emailShell(`<p>${escHtml(greeting)}</p><p>${escHtml(copy)}</p><p style="text-align:center;margin:28px 0"><a href="${escHtml(url)}" style="display:inline-block;background:#ae8745;color:#fffdf7;padding:14px 24px;text-decoration:none;border-radius:6px">${cta}</a></p><p>${escHtml(closing)}</p><p>${es?'Con cariño':'Warmly'},<br>Dayan<br>Añejo Catering Co.</p>`);
 return {subject,html,text,to:String(quote.customer_email||'').trim().toLowerCase(),replyTo:'dayan@anejocateringco.com',lang:es?'es':'en',version:FOLLOWUP_VERSION};
}
export function nextQuoteAction({quote,response,now=Date.now()}) {
 if(!quote)return {code:'review_request',label:'Review this request before preparing a quote.',due_at:null};
 if(quote.deposit_status==='paid')return {code:'booked',label:'Deposit recorded. Continue event planning.',due_at:null};
 const state=response?.status;
 if(state==='declined')return {code:'closed',label:'Customer declined. Do not send further quote reminders.',due_at:null};
 if(state==='call_requested')return {code:'call',label:'Review the requested call time and arrange the call.',due_at:response.updated_at};
 if(state==='changes_requested')return {code:'revise',label:'Review requested changes before sending another quote.',due_at:response.updated_at};
 if(state==='replied')return {code:'reply',label:'Review the customer response and record the next agreed action.',due_at:response.updated_at};
 const sent=Math.max(quote.email_sent_at||0,quote.sms_sent_at||0),age=now-sent;
 if(age>=7*DAY)return {code:'decision',label:'Owner decision: call to confirm plans or close this follow-up. No automatic message.',due_at:sent+7*DAY};
 if(age>=3*DAY)return {code:'clarify',label:'Owner check: ask whether anything needs clarification. No automatic message.',due_at:sent+3*DAY};
 return {code:'review',label:'Review the quote response after 24 hours. Sending always requires a reviewed owner action.',due_at:sent?sent+DAY:null};
}
async function context(env,leadId,step='review_quote') {
 const lead=await env.DB.prepare("SELECT l.*,r.event_json FROM leads l LEFT JOIN catering_requests r ON r.lead_id=l.id WHERE l.id=? AND l.kind='catering'").bind(leadId).first();
 if(!lead)return null;
 const rows=await env.DB.prepare(`SELECT * FROM catering_quotes WHERE source_lead_id=? OR (json_valid(quote_json) AND json_extract(quote_json,'$.lead_id')=?) OR lower(customer_email)=lower(?) ORDER BY created_at DESC`).bind(leadId,leadId,lead.email||'').all();
 const quotes=(rows.results||[]).map(q=>({...q,breakdown:parse(q.quote_json)}));
 const relatedLeads=(await env.DB.prepare("SELECT id,email,phone FROM leads WHERE kind='catering' AND lower(email)=lower(?)").bind(lead.email||'').all()).results||[];
 const quote=quoteForLead(lead,relatedLeads,quotes);
 let response=await env.DB.prepare('SELECT * FROM catering_quote_responses WHERE lead_id=?').bind(leadId).first();
 const service=await env.DB.prepare('SELECT state FROM catering_lead_service WHERE lead_id=?').bind(leadId).first();
 if(!quote)return {lead,response:null,reason:'No active quote is strongly linked to this lead.'};
 if(response?.quote_id!==quote.id)response=null;
 const sent=Math.max(quote.email_sent_at||0,quote.sms_sent_at||0),recipient=String(quote.customer_email||'').trim().toLowerCase();
 const inbound=await env.DB.prepare("SELECT MAX(created_at) AS at FROM messages WHERE thread_id=? AND direction='inbound'").bind(`thr_catering_lead_${lead.id}`).first();
 const callback=await env.DB.prepare("SELECT MAX(created_at) AS at FROM catering_callback_requests WHERE quote_id=? AND status='requested'").bind(quote.id).first();
 const change=await env.DB.prepare('SELECT MAX(created_at) AS at FROM catering_quote_changes WHERE quote_id=? AND handled_at IS NULL').bind(quote.id).first();
 // Fail closed: unlike the general send helper's fallback, a failed suppression
 // read cannot permit this optional reminder.
 const suppression=await env.DB.prepare('SELECT reason FROM email_suppressions WHERE email=?').bind(recipient).first();
 const optout=await env.DB.prepare("SELECT id FROM campaign_unsubscribes WHERE lower(email)=? AND channel IN ('email','all') LIMIT 1").bind(recipient).first();
 const revision=await env.DB.prepare("SELECT state FROM catering_quote_revisions WHERE source_quote_id=? AND state!='complete'").bind(quote.id).first();
 let reason=null;
 if(quote.deposit_status!=='unpaid')reason='Only unpaid active quotes may receive a review reminder.';
 else if(['lost','won'].includes(service?.state))reason='This lead is closed. No reminder will be sent.';
 else if(!Number.isFinite(cateringEventTimestamp(quote.event_date,'23:59'))||cateringEventTimestamp(quote.event_date,'23:59')<Date.now())reason='The event date is missing, invalid or past.';
 else if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))reason='The quote needs a valid recipient email.';
 else if(!/^[a-f0-9]{32}$/.test(quote.access_token||'')||!sent)reason='A valid quote must already have been sent before following up.';
 else if(revision)reason='A quote revision is still in progress.';
 else if(suppression||optout)reason='This recipient is suppressed or opted out. Do not send.';
 else if(response&&response.status!=='awaiting_reply')reason='A customer response has been recorded. Review it instead of sending this reminder.';
 else if(Number(inbound?.at)>=Math.max(sent,response?.status==='awaiting_reply'?response.updated_at:0))reason='An inbound reply is recorded. Review the conversation first.';
 else if(Number(callback?.at)>=Math.max(sent,response?.status==='awaiting_reply'?response.updated_at:0))reason='A call was requested. Review the request first.';
 else if(Number(change?.at)>=Math.max(sent,response?.status==='awaiting_reply'?response.updated_at:0))reason='Order changes were requested. Review them first.';
 const preview=quoteFollowupEmail(quote,env,step);
 const snapshot={step,quote_id:quote.id,quote_updated_at:quote.updated_at,deposit_status:quote.deposit_status,lead_state:service?.state||'open',sent_at:sent,inbound_at:inbound?.at||null,callback_at:callback?.at||null,change_at:change?.at||null,response_updated_at:response?.updated_at||null,preview};
 return {lead,quote,response,reason,preview,snapshot,review_hash:await hash(snapshot)};
}
function stepEligibility(history,step,now=Date.now()) {
 if(history.some(h=>['pending','unknown'].includes(h.status)))return 'An earlier send outcome needs reconciliation. No further reminder can be sent.';
 const at=FOLLOWUP_STEPS.indexOf(step);
 if(at>0){const previous=history.find(h=>h.step===FOLLOWUP_STEPS[at-1]);if(previous?.status!=='accepted')return 'The previous follow-up must have an accepted provider receipt first.';if(now-previous.accepted_at<2*DAY)return 'Wait at least 48 hours after the previous accepted reminder. You may review or arrange a call meanwhile.';}
 return null;
}
const publicAttempt=r=>({step:r.step,status:r.status,receipt_id:r.receipt_id||null,last_error:r.last_error||null,created_at:r.created_at,accepted_at:r.accepted_at||null,delivery_status:'unverified'});
export async function getQuoteFollowup(env,leadId,step='review_quote') {
 if(!FOLLOWUP_STEPS.includes(step))return fail('Choose a known follow-up step.');
 const c=await context(env,leadId,step);if(!c)return fail('Catering lead not found.');
 const history=(await env.DB.prepare('SELECT * FROM catering_quote_followups WHERE lead_id=? ORDER BY created_at DESC').bind(leadId).all()).results||[];
 const current=history.filter(h=>h.quote_id===c.quote?.id),duplicate=current.find(h=>h.step===step);
 const gate=history.some(h=>['pending','unknown'].includes(h.status))?'An earlier send outcome needs reconciliation. No further reminder can be sent.':stepEligibility(current,step);
 const action=nextQuoteAction(c);
 if(!c.reason&&gate)Object.assign(action,{code:'owner_review',label:gate,due_at:null});
 if(current.some(h=>h.step==='final_checkin'&&h.status==='accepted'))Object.assign(action,{code:'call_or_review',label:'All three reviewed email steps are used. Review the plans or arrange a call; the lead remains open until you decide otherwise.',due_at:null});
 return {ok:true,step,eligible:!c.reason&&!duplicate&&!gate,reason:c.reason||gate||(duplicate?'A follow-up attempt already exists for this quote. Check its receipt before any further contact.':null),preview:c.preview||null,review_hash:c.review_hash||null,quote_id:c.quote?.id||null,history:history.map(publicAttempt),response:c.response||null,next_action:action};
}
async function audit(env,leadId,quoteId,actor,status,receipt=null) {
 await env.DB.prepare('INSERT INTO activity_log(id,event,actor_id,actor_role,actor_type,properties,created_at) VALUES(?,?,?,\'owner\',\'human\',?,?)').bind(id('act'),'catering.quote_followup.'+status,actor,JSON.stringify({lead_id:leadId,quote_id:quoteId,status,receipt_id:receipt,delivery_verified:false}),Date.now()).run();
}
export async function sendQuoteFollowup(env,body,actor) {
 if(body.reviewed!==true)return fail('Review the rendered email and confirm approval before sending.');
 const step=body.step||'review_quote';if(!FOLLOWUP_STEPS.includes(step))return fail('Choose a known follow-up step.');
 let c=await context(env,body.lead_id,step);if(!c?.quote)return fail(c?.reason||'Catering lead not found.');
 let attempt=await env.DB.prepare('SELECT * FROM catering_quote_followups WHERE quote_id=? AND step=?').bind(c.quote.id,step).first();
 if(attempt){if(attempt.review_hash!==body.review_hash)return fail('A different reviewed follow-up is already saved. Reload its receipt.');if(attempt.status==='accepted'&&!attempt.projected_at)await projectAccepted(env,attempt,c.lead,c.quote,actor);return {ok:attempt.status==='accepted',...publicAttempt(attempt),replayed:true,error:attempt.status==='accepted'?undefined:'This attempt must be reconciled before any retry. No new email was sent.'};}
 if(c.reason)return fail(c.reason);
 const histories=(await env.DB.prepare('SELECT * FROM catering_quote_followups WHERE lead_id=?').bind(c.lead.id).all()).results||[];
 const gate=histories.some(h=>['pending','unknown'].includes(h.status))?'An earlier send outcome needs reconciliation. No further reminder can be sent.':stepEligibility(histories.filter(h=>h.quote_id===c.quote.id),step);if(gate)return fail(gate);
 if(!body.review_hash||body.review_hash!==c.review_hash)return fail('Quote or contact status changed. Review the current email before sending.');
 const now=Date.now(),attemptId=id('cqf');
 await env.DB.prepare(`INSERT OR IGNORE INTO catering_quote_followups(id,quote_id,lead_id,step,review_hash,snapshot_json,status,idempotency_key,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,'pending',?,?,?,?)`).bind(attemptId,c.quote.id,c.lead.id,step,c.review_hash,JSON.stringify(c.snapshot),'catering-followup:'+c.quote.id+':'+step+':v1',actor,now,now).run();
 attempt=await env.DB.prepare('SELECT * FROM catering_quote_followups WHERE quote_id=? AND step=?').bind(c.quote.id,step).first();
 if(attempt.id!==attemptId)return {ok:attempt.status==='accepted',...publicAttempt(attempt),replayed:true,error:'A follow-up attempt was already claimed. Check the receipt.'};
 // Re-read every safety gate after the durable claim, before any provider call.
 c=await context(env,body.lead_id,step);
 if(!c||c.reason||c.review_hash!==attempt.review_hash){await env.DB.prepare("UPDATE catering_quote_followups SET status='suppressed',last_error='Eligibility changed after review',updated_at=? WHERE id=?").bind(Date.now(),attempt.id).run();return fail(c?.reason||'The reviewed quote changed. No email was sent.');}
 if(!env.RESEND_API_KEY){await env.DB.prepare("UPDATE catering_quote_followups SET status='failed',last_error='Email provider not configured',updated_at=? WHERE id=?").bind(Date.now(),attempt.id).run();await audit(env,c.lead.id,c.quote.id,actor,'failed');return {ok:false,status:'failed',error:'Email provider is not configured. No email was sent.'};}
 // A crash or unknown network result after this fence MUST NOT allow blind retry.
 const cutoff=Math.max(c.snapshot.sent_at,c.response?.status==='awaiting_reply'?c.response.updated_at:0);
 const claim=await env.DB.prepare(`UPDATE catering_quote_followups SET status='unknown',updated_at=? WHERE id=? AND status='pending'
  AND EXISTS(SELECT 1 FROM catering_quotes WHERE id=? AND deposit_status='unpaid' AND updated_at=?)
  AND NOT EXISTS(SELECT 1 FROM catering_lead_service WHERE lead_id=? AND state IN ('won','lost'))
  AND NOT EXISTS(SELECT 1 FROM catering_quote_responses WHERE lead_id=? AND quote_id=? AND (status!='awaiting_reply' OR updated_at!=?))
  AND NOT EXISTS(SELECT 1 FROM catering_quote_followups WHERE lead_id=? AND id!=? AND status IN ('pending','unknown'))
  AND NOT EXISTS(SELECT 1 FROM catering_quote_revisions WHERE source_quote_id=? AND state!='complete')
  AND NOT EXISTS(SELECT 1 FROM messages WHERE thread_id=? AND direction='inbound' AND created_at>=?)
  AND NOT EXISTS(SELECT 1 FROM catering_callback_requests WHERE quote_id=? AND status='requested' AND created_at>=?)
  AND NOT EXISTS(SELECT 1 FROM catering_quote_changes WHERE quote_id=? AND handled_at IS NULL AND created_at>=?)
  AND NOT EXISTS(SELECT 1 FROM email_suppressions WHERE email=?)
  AND NOT EXISTS(SELECT 1 FROM campaign_unsubscribes WHERE lower(email)=? AND channel IN ('email','all'))`)
  .bind(Date.now(),attempt.id,c.quote.id,c.snapshot.quote_updated_at,c.lead.id,c.lead.id,c.quote.id,c.snapshot.response_updated_at??-1,c.lead.id,attempt.id,c.quote.id,`thr_catering_lead_${c.lead.id}`,cutoff,c.quote.id,cutoff,c.quote.id,cutoff,c.preview.to,c.preview.to).run();
 if(claim.meta?.changes!==1){await env.DB.prepare("UPDATE catering_quote_followups SET status='suppressed',last_error='Eligibility changed at send claim',updated_at=? WHERE id=? AND status='pending'").bind(Date.now(),attempt.id).run();return fail('Quote or response status changed before sending. No new email was sent.');}
 await audit(env,c.lead.id,c.quote.id,actor,'attempt_claimed');
 let receipt;
 try{receipt=await sendEmail(env,{...c.preview,idempotencyKey:attempt.idempotency_key,timeoutMs:12000});}
 catch{await env.DB.prepare("UPDATE catering_quote_followups SET last_error='Provider outcome unconfirmed; reconcile before retry',updated_at=? WHERE id=?").bind(Date.now(),attempt.id).run();await audit(env,c.lead.id,c.quote.id,actor,'unknown');return {ok:false,status:'unknown',error:'Provider outcome is unconfirmed. Do not resend until reconciled.'};}
 if(receipt?.skipped){await env.DB.prepare("UPDATE catering_quote_followups SET status='suppressed',last_error='Provider send suppressed',updated_at=? WHERE id=?").bind(Date.now(),attempt.id).run();await audit(env,c.lead.id,c.quote.id,actor,'suppressed');return {ok:false,status:'suppressed',error:'Email suppressed. No new email was sent.'};}
 if(typeof receipt?.id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(receipt.id))return {ok:false,status:'unknown',error:'Provider acceptance receipt is missing or invalid. Reconcile before retry.'};
 // Persist acceptance first. If message projection later fails, replay repairs it
 // locally without calling the provider again.
 await env.DB.prepare("UPDATE catering_quote_followups SET status='accepted',receipt_id=?,accepted_at=?,updated_at=? WHERE id=?").bind(String(receipt.id).slice(0,200),Date.now(),Date.now(),attempt.id).run();
 await projectAccepted(env,{...attempt,receipt_id:receipt.id,status:'accepted'},c.lead,c.quote,actor);
 return {ok:true,status:'accepted',receipt_id:receipt.id,delivery_status:'unverified'};
}
async function projectAccepted(env,attempt,lead,quote,actor) {
 const thread=await ensureCateringConversation(env,{lead,quote}),snapshot=parse(attempt.snapshot_json),now=Date.now();
 await env.DB.batch([
  env.DB.prepare("INSERT OR IGNORE INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,ai_drafted,created_at) VALUES(?,?,'outbound','email',?,'owner',?,0,?)").bind('msg_'+attempt.id,thread.id,actor,snapshot.preview.text,now),
  env.DB.prepare('UPDATE threads SET last_message_at=MAX(COALESCE(last_message_at,0),?),updated_at=? WHERE id=?').bind(now,now,thread.id),
  env.DB.prepare('UPDATE catering_quote_followups SET projected_at=? WHERE id=?').bind(now,attempt.id),
  env.DB.prepare("INSERT OR IGNORE INTO activity_log(id,event,actor_id,actor_role,actor_type,properties,created_at) VALUES(?,'catering.quote_followup.accepted',?,'owner','human',?,?)").bind('act_'+attempt.id,actor,JSON.stringify({lead_id:lead.id,quote_id:quote.id,receipt_id:attempt.receipt_id,status:'accepted',delivery_verified:false}),now),
 ]);
}
export async function updateQuoteResponse(env,body,actor) {
 if(!RESPONSE_STATES.includes(body.status))return fail('Choose a known response status.');
 const c=await context(env,body.lead_id);if(!c?.quote)return fail('No associated quote was found.');
 const note=typeof body.note==='string'?body.note.trim().slice(0,1200):'',now=Date.now();
 const due=body.status==='declined'?null:body.status==='awaiting_reply'?now+DAY:now;
 await env.DB.prepare(`INSERT INTO catering_quote_responses(lead_id,quote_id,status,note,next_followup_at,updated_by,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(lead_id) DO UPDATE SET quote_id=excluded.quote_id,status=excluded.status,note=excluded.note,next_followup_at=excluded.next_followup_at,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(c.lead.id,c.quote.id,body.status,note,due,actor,now).run();
 await audit(env,c.lead.id,c.quote.id,actor,'response_'+body.status);
 return {ok:true,response:{status:body.status,note,updated_at:now,next_followup_at:due},next_action:nextQuoteAction({...c,response:{status:body.status,updated_at:now}})};
}
