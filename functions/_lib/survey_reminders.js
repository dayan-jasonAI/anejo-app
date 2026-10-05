import {id,now,appBaseUrl} from './util.js';
import {contractAudience} from './delivery_notices.js';
import {sendSms} from './twilio.js';
export const SURVEY_DELAY_MS=8*60*1000;
export const SURVEY_EXPIRES_MS=10*60*1000;
// Durable outbox only for a confirmed contract drop-off. Repeated completions cannot reset it.
export async function queueSurveyReminder(env,orderId,{nowMs=now()}={}) {
 const row=await env.DB.prepare(`SELECT c.id AS contract_order_id,c.site_id,d.id AS delivery_id,d.completed_at
 FROM contract_orders c JOIN deliveries d ON d.order_id=c.order_id
 WHERE c.order_id=? AND c.headcount>0 AND d.status='completed' AND d.completed_at IS NOT NULL
 ORDER BY d.completed_at ASC LIMIT 1`).bind(orderId).first();
 if(!row)return {queued:0};
 const order=await env.DB.prepare('SELECT * FROM orders WHERE id=?').bind(orderId).first();
 const audience=await contractAudience(env,order);let queued=0;
 for(const to of (audience.phones.length?audience.phones:[''])){const r=await env.DB.prepare(`INSERT INTO contract_survey_reminders
 (id,contract_order_id,site_id,delivery_id,completed_at,due_at,to_number,link_token,status,error,created_at,updated_at)
 VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(contract_order_id,to_number) DO NOTHING`)
 .bind(id('survey'),row.contract_order_id,row.site_id,row.delivery_id,row.completed_at,row.completed_at+SURVEY_DELAY_MS,to,crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''),to?'queued':'blocked',to?null:'No eligible office phone; check contacts and text opt-outs.',nowMs,nowMs).run();if(to)queued+=r.meta?.changes||0;}
 return {queued};
}
export async function runSurveyReminders(env,{nowMs=now(),send=sendSms}={}) {
 if(!env.DB)throw Error('Database unavailable');
 // Recover only durable provider acknowledgements, never infer success from an attempted call.
 await env.DB.prepare(`UPDATE contract_survey_reminders SET status='sent',provider_sid=(SELECT provider_sid FROM sms_log WHERE thread_id='lunchsurvey_'||contract_survey_reminders.id AND status='sent' AND provider_sid IS NOT NULL ORDER BY created_at DESC LIMIT 1),updated_at=?
 WHERE status='sending' AND EXISTS(SELECT 1 FROM sms_log WHERE thread_id='lunchsurvey_'||contract_survey_reminders.id AND status='sent' AND provider_sid IS NOT NULL)`).bind(nowMs).run();
 await env.DB.prepare("UPDATE contract_survey_reminders SET status='unconfirmed',error='No durable acknowledgement; do not automatically resend.',updated_at=? WHERE status='sending' AND completed_at+?<?").bind(nowMs,SURVEY_EXPIRES_MS,nowMs).run();
 await env.DB.prepare("UPDATE contract_survey_reminders SET status='missed',error='Reminder window elapsed; no stale message sent.',updated_at=? WHERE status='queued' AND completed_at+?<?").bind(nowMs,SURVEY_EXPIRES_MS,nowMs).run();
 const rows=(await env.DB.prepare("SELECT * FROM contract_survey_reminders WHERE status='queued' AND due_at<=? ORDER BY due_at LIMIT 10").bind(nowMs).all()).results||[];
 let accepted=0;
 for(const job of rows){
  const context=await env.DB.prepare(`SELECT o.*,s.intake_token,c.item_name FROM contract_orders c JOIN orders o ON o.id=c.order_id JOIN contract_sites s ON s.id=c.site_id JOIN contract_accounts a ON a.id=s.account_id JOIN deliveries d ON d.id=? AND d.order_id=c.order_id
  WHERE c.id=? AND c.headcount>0 AND s.active=1 AND a.status='active' AND d.status='completed'`).bind(job.delivery_id,job.contract_order_id).first();
  const audience=context?await contractAudience(env,context):{phones:[]};
  if(!context||!audience.phones.includes(job.to_number)){await env.DB.prepare("UPDATE contract_survey_reminders SET status='skipped',error='Recipient, delivery or office no longer eligible.',updated_at=? WHERE id=? AND status='queued'").bind(nowMs,job.id).run();continue;}
  if(!env.TWILIO_ACCOUNT_SID||!env.TWILIO_AUTH_TOKEN||!(env.TWILIO_MESSAGING_SERVICE_SID||env.TWILIO_FROM||env.TWILIO_MESSAGING_FROM)){await env.DB.prepare("UPDATE contract_survey_reminders SET status='blocked',error='SMS transport is not configured.',updated_at=? WHERE id=? AND status='queued'").bind(nowMs,job.id).run();continue;}
  const claim=await env.DB.prepare("UPDATE contract_survey_reminders SET status='sending',updated_at=? WHERE id=? AND status='queued'").bind(nowMs,job.id).run();if(!claim.meta?.changes)continue;
  const link=appBaseUrl(env)+'/lunch-feedback?r='+encodeURIComponent(job.link_token)+'&order_id='+encodeURIComponent(job.contract_order_id);
  const body='Añejo: lunch has been dropped off. Please invite each person to rate their meal and share menu ideas. Por favor, invite a cada persona a calificar su almuerzo. '+link+' Reply STOP to opt out.';
  try{const r=await send(env,{to:job.to_number,body,thread_id:'lunchsurvey_'+job.id});const status=r?.sent&&r.provider_sid?'sent':r?.noop?'blocked':'unconfirmed';
   await env.DB.prepare("UPDATE contract_survey_reminders SET status=?,provider_sid=?,error=?,updated_at=? WHERE id=? AND status='sending'").bind(status,r?.provider_sid||null,status==='sent'?null:r?.error||'No provider acknowledgement; no automatic retry.',nowMs,job.id).run();if(status==='sent')accepted++;
  }catch{ /* keep sending: recover only from durable sms_log acknowledgement on the next tick */ }
 }
 return {ok:true,examined:rows.length,provider_accepted:accepted};
}
