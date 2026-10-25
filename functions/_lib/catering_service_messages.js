import {emailShell,escHtml,sendEmail} from './email.js';
import {ensureCateringConversation,sendCateringSms,phoneDigits,cateringSmsOptedOut} from './catering_conversation.js';
export const SERVICE_TEMPLATE_VERSION='catering-delivery-care-v1';
const SITE='https://anejocateringco.com';
const fail=error=>({ok:false,error});
export function serviceCopy(kind,lang='en'){
 const es=lang==='es',done=kind==='completed';
 const subject=done?(es?'Gracias por celebrar con Añejo':'Thank you for celebrating with Añejo'):(es?'Su catering Añejo está en camino':'Your Añejo catering is on the way');
 const body=done?(es?'Su pedido se ha entregado. Gracias por dejarnos ser parte de su celebración. ¡Disfruten! Si necesita algo, responda a este mensaje.':'Your order has been delivered. Thank you for letting us be part of your celebration. Enjoy! If you need anything, reply to this message.'):(es?'Su pedido de catering está en camino a su celebración. Para consultar los detalles o comunicarse con nosotros, visite su cuenta.':'Your catering order is on its way to your celebration. Visit your account for event details or reply if you need to reach us.');
 const url=SITE+'/client/dashboard?catering=1',cta=es?'Ver mi evento':'View my event';
 return {subject,text:body+'\n\n'+cta+': '+url,sms:'Añejo: '+body+' '+url+(es?' Responda STOP para dejar de recibir mensajes.':' Reply STOP to opt out.'),html:emailShell('<h2>'+escHtml(subject)+'</h2><p>'+escHtml(body)+'</p><p><a href="'+url+'" style="color:#1a3d2e">'+cta+'</a></p>')};
}
export async function serviceMessageView(env,qid){
 const settings=await env.DB.prepare('SELECT * FROM catering_service_settings WHERE id=1').first();
 const rows=(await env.DB.prepare(`SELECT m.kind,m.channel,m.status,m.provider_id,m.error,m.updated_at,s.status AS carrier_status,r.status AS email_status,r.observed_at AS provider_observed_at FROM catering_service_messages m LEFT JOIN sms_log s ON s.id=m.sms_log_id LEFT JOIN catering_email_receipts r ON r.provider_id=m.provider_id WHERE m.quote_id=? ORDER BY m.created_at,m.channel`).bind(qid).all()).results||[];
 return {ok:true,settings,messages:rows,template_version:SERVICE_TEMPLATE_VERSION,previews:['en','es'].flatMap(lang=>['en_route','completed'].map(kind=>({lang,kind,...serviceCopy(kind,lang)})))};
}
export async function approveServiceMessages(env,b,{actor,at=Date.now()}={}){
 if(typeof b.enable!=='boolean'||b.reviewed!==true||b.template_version!==SERVICE_TEMPLATE_VERSION)return fail('Review all four rendered email and SMS previews before changing delivery communication.');
 await env.DB.prepare('UPDATE catering_service_settings SET enabled=?,template_version=?,enabled_at=?,approved_by=?,approved_at=? WHERE id=1').bind(b.enable?1:0,SERVICE_TEMPLATE_VERSION,b.enable?at:null,actor||'owner',at).run();
 return {ok:true,sent:false,enabled:b.enable};
}
async function suppress(env,row,reason,at){await env.DB.prepare("UPDATE catering_service_messages SET status='suppressed',error=?,updated_at=? WHERE quote_id=? AND kind=? AND channel=? AND status='pending'").bind(reason,at,row.quote_id,row.kind,row.channel).run();}
export async function runCateringServiceMessages(env,{at=Date.now(),emailSender=sendEmail,smsSender=sendCateringSms}={}){
 const out={ok:true,accepted:0,suppressed:0,unknown:0};
 const settings=await env.DB.prepare('SELECT * FROM catering_service_settings WHERE id=1').first();
 if(!settings?.enabled||settings.template_version!==SERVICE_TEMPLATE_VERSION||!settings.enabled_at)return {...out,enabled:false};
 // No backfill from old events, guessed dates or checklist clicks. One audited transition per moment.
 const events=(await env.DB.prepare(`SELECT q.id,q.customer_name,q.customer_email,q.customer_phone,q.lang,q.source_lead_id,e.status,e.version,t.recorded_at,t.to_status FROM catering_quotes q JOIN catering_execution e ON e.quote_id=q.id JOIN catering_execution_transitions t ON t.quote_id=e.quote_id AND t.version=e.version AND t.to_status=e.status WHERE q.deposit_status='paid' AND e.status IN ('en_route','completed') AND t.recorded_at>=? AND t.recorded_at<=? ORDER BY t.recorded_at LIMIT 50`).bind(settings.enabled_at,at).all()).results||[];
 for(const q of events){
  const copy=serviceCopy(q.status,q.lang),snapshot=JSON.stringify({quote_id:q.id,kind:q.status,version:q.version,recipient:q.customer_email,phone:q.customer_phone,source_lead_id:q.source_lead_id,template_version:SERVICE_TEMPLATE_VERSION,...copy});
  for(const channel of ['email','sms'])await env.DB.prepare('INSERT OR IGNORE INTO catering_service_messages(quote_id,kind,channel,transition_version,snapshot_json,created_at,updated_at) VALUES(?,?,?,?,?,?,?)').bind(q.id,q.status,channel,q.version,snapshot,q.recorded_at,at).run();
 }
 const rows=(await env.DB.prepare("SELECT * FROM catering_service_messages WHERE status='pending' ORDER BY created_at LIMIT 50").all()).results||[];
 for(const row of rows){
  const p=JSON.parse(row.snapshot_json),q=await env.DB.prepare('SELECT q.*,e.status AS execution_status,e.version AS execution_version FROM catering_quotes q JOIN catering_execution e ON e.quote_id=q.id WHERE q.id=?').bind(row.quote_id).first();
  if(!q||q.deposit_status!=='paid'||q.execution_status!==row.kind||q.execution_version!==row.transition_version||q.customer_email!==p.recipient||q.customer_phone!==p.phone||at-row.created_at>30*60000){await suppress(env,row,'Event changed or notification window elapsed.',at);out.suppressed++;continue;}
  const lead=q.source_lead_id?await env.DB.prepare("SELECT id,name,phone,sms_consent FROM leads WHERE id=? AND kind='catering'").bind(q.source_lead_id).first():null;
  if(row.channel==='sms'&&(!lead?.sms_consent||phoneDigits(lead.phone).length!==10||phoneDigits(lead.phone)!==phoneDigits(q.customer_phone)||await cateringSmsOptedOut(env,lead.phone))){await suppress(env,row,'SMS consent, matching phone or opt-in unavailable.',at);out.suppressed++;continue;}
  if(row.channel==='email'&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.customer_email||'')||await env.DB.prepare('SELECT email FROM email_suppressions WHERE email=?').bind(q.customer_email.trim().toLowerCase()).first())){await suppress(env,row,'Email unavailable or suppressed.',at);out.suppressed++;continue;}
  const thread=await ensureCateringConversation(env,{lead,quote:q});
  const claimed=await env.DB.prepare("UPDATE catering_service_messages SET status='sending',updated_at=? WHERE quote_id=? AND kind=? AND channel=? AND status='pending' AND EXISTS(SELECT 1 FROM catering_service_settings WHERE id=1 AND enabled=1 AND template_version=?)").bind(at,row.quote_id,row.kind,row.channel,SERVICE_TEMPLATE_VERSION).run();if(claimed.meta?.changes!==1)continue;
  let receipt=null;
  try{
   if(row.channel==='sms'){
    const result=await smsSender(env,{thread,lead,body:p.sms,actorId:'system:catering-delivery',requestId:`service_${q.id}_${row.kind}`});
    receipt=result.sms?.provider_sid||null;
    if(!result.ok||!receipt)throw Error(result.error||'SMS outcome unverified.');
    const log=await env.DB.prepare('SELECT id FROM sms_log WHERE provider_sid=?').bind(receipt).first();
    await env.DB.prepare("UPDATE catering_service_messages SET status='accepted',provider_id=?,sms_log_id=?,updated_at=? WHERE quote_id=? AND kind=? AND channel='sms'").bind(receipt,log?.id||null,at,q.id,row.kind).run();
   }else{
    const result=await emailSender(env,{to:p.recipient,subject:p.subject,text:p.text,html:p.html,replyTo:'dayan@anejocateringco.com',idempotencyKey:`service_${q.id}_${row.kind}`,timeoutMs:15000});
    if(result?.skipped){await env.DB.prepare("UPDATE catering_service_messages SET status='suppressed',error='Email suppressed',updated_at=? WHERE quote_id=? AND kind=? AND channel='email'").bind(at,q.id,row.kind).run();out.suppressed++;continue;}
    receipt=result?.id;if(!receipt)throw Error('Email outcome unverified.');
    await env.DB.batch([env.DB.prepare("UPDATE catering_service_messages SET status='accepted',provider_id=?,updated_at=? WHERE quote_id=? AND kind=? AND channel='email'").bind(receipt,at,q.id,row.kind),env.DB.prepare("INSERT OR IGNORE INTO messages(id,thread_id,direction,channel,sender_role,body,ai_drafted,created_at) VALUES(?,?,'outbound','email','owner',?,0,?)").bind(`msg_service_${q.id}_${row.kind}`,thread.id,p.subject+'\n\n'+p.text,at)]);
   }
   out.accepted++;
  }catch{out.ok=false;out.unknown++;await env.DB.prepare("UPDATE catering_service_messages SET status='unknown',provider_id=?,error='Reconcile provider outcome before retrying.',updated_at=? WHERE quote_id=? AND kind=? AND channel=?").bind(receipt,at,row.quote_id,row.kind,row.channel).run();}
 }
 return out;
}
