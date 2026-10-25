import {emailShell,escHtml,sendEmail} from './email.js';
import {isEmail,randToken} from './util.js';
import {dayOffset} from './catering_balance_reminder.js';
import {ensureCateringConversation} from './catering_conversation.js';

export const EXPERIENCE_KINDS=['pre_event_checkin','post_delivery_review'];
const SITE='https://anejocateringco.com',DAY=86400000;
export const CATERING_REVIEW_DELAY_MS=60*60*1000;
const fail=error=>({ok:false,error});
const day=at=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(n=>n.toString(16).padStart(2,'0')).join('');
const quote=(env,qid)=>env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(qid).first();
const paid=q=>q?.deposit_status==='paid'&&(q.balance_status==='paid'||q.balance_cents===0);
const dateValid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')&&!Number.isNaN(Date.parse(value+'T12:00:00Z'));
async function reviewUrl(env){
 const value=(await env.DB.prepare("SELECT value FROM app_settings WHERE key='reviews.google_url'").first())?.value;
 try{const url=new URL(String(value||''));const google=url.hostname==='g.page'||url.hostname==='maps.app.goo.gl'||url.hostname==='google.com'||url.hostname.endsWith('.google.com');return url.protocol==='https:'&&!url.username&&!url.password&&google?url.href:null;}catch{return null;}
}
async function delivery(env,qid){return env.DB.prepare(`SELECT t.recorded_at,t.version FROM catering_execution e JOIN catering_execution_transitions t ON t.quote_id=e.quote_id AND t.version=e.version WHERE e.quote_id=? AND e.status='completed' AND e.delivery_mode IN ('owner_self','staff_driver') AND t.to_status='completed'`).bind(qid).first();}
async function eligibility(env,q,kind,at){
 if(!q||q.deposit_status!=='paid'||!dateValid(q.event_date)||!isEmail(q.customer_email))return 'An active paid booking, event date and saved email are required.';
 if(day(at)>dayOffset(q.event_date,7))return 'The service follow-up window has ended. Contact the client deliberately instead.';
 if(kind==='pre_event_checkin')return !paid(q)?'The booking must be fully paid before the service check-in.':q.event_date!==dayOffset(day(at),1)?'The booking check-in is sent only on the day before the event.':null;
 const proof=await delivery(env,q.id);
 if(!proof||proof.recorded_at>at||day(proof.recorded_at)<q.event_date)return 'Waiting for a recorded completed delivery and its matching execution history.';
 return proof.recorded_at+CATERING_REVIEW_DELAY_MS>at?'The review email waits until 60 minutes after the recorded completed delivery.':null;
}
export function cateringExperienceEmail({q,kind,feedbackUrl,accountUrl,googleUrl}){
 const es=q.lang==='es',pre=kind==='pre_event_checkin',first=String(q.customer_name||'').trim().split(/\s+/)[0];
 const subject=pre?(es?'¿Cómo ha sido su experiencia con Añejo hasta ahora?':'How has your Añejo experience been so far?'):(es?'Gracias por celebrar con Añejo. ¿Cómo estuvo todo?':'Thank you for celebrating with Añejo. How was everything?');
 const opening=pre?(es?'Antes de su celebración, queremos saber cómo ha sido el proceso de reserva y planificación. ¿Hay algo que debamos aclarar o algún detalle que quiera compartir antes de la entrega?':'Your celebration is almost here. How has the booking and planning experience with Añejo been so far? If there is anything you would like us to clarify or keep in mind before delivery, we would love to hear it.'):(es?'Gracias por recibir a Añejo en su celebración. Nos gustaría saber cómo estuvieron la comida y el servicio: qué disfrutó y qué podemos mejorar.':'Thank you for letting Añejo be part of your celebration. How was everything? Tell us what you enjoyed about the food and service, and what we can do better.');
 const cta=pre?(es?'Calificar la experiencia de reserva':'Rate your booking experience'):(es?'Compartir mi experiencia':'Share your experience');
 const reply=es?'También puede responder a este correo para hablar directamente con Dayan. Su opinión es voluntaria.':'You can also reply to this email to speak directly with Dayan. Feedback is voluntary.';
 const account=es?'Ver mi cuenta y los detalles de mi evento':'View my account and event details',google=es?'Compartir una reseña honesta en Google':'Share an honest Google review';
 const googleBlock=!pre&&googleUrl?`<p><a href="${escHtml(googleUrl)}" style="color:#1a3d2e">${google}</a></p>`:'';
 return {subject,html:emailShell(`<p>${escHtml(first|| (es?'Hola':'Hello'))},</p><p>${escHtml(opening)}</p><p style="margin:26px 0"><a href="${escHtml(feedbackUrl)}" style="display:block;text-align:center;background:#ae8745;color:#fffdf7;padding:16px;text-decoration:none;border-radius:8px">${cta}</a></p>${googleBlock}<p>${escHtml(reply)}</p><p><a href="${escHtml(accountUrl)}" style="color:#1a3d2e">${account}</a></p><p>Dayan<br>Añejo Catering Co.</p>`),text:[first||'Hello','',opening,'',cta+': '+feedbackUrl,...(!pre&&googleUrl?['',google+': '+googleUrl]:[]),'',reply,'',account+': '+accountUrl,'','Dayan · Añejo Catering Co.'].join('\n')};
}
async function currentSnapshot(env,q,kind,{baseUrl,at}){
 const token=await env.DB.prepare('SELECT * FROM catering_experience_tokens WHERE quote_id=? AND kind=?').bind(q.id,kind).first();
 if(!token||token.expires_at<=at||token.recipient!==String(q.customer_email||'').trim().toLowerCase())return null;
 const googleUrl=await reviewUrl(env),feedbackUrl=baseUrl+'/catering-feedback?t='+token.token,accountUrl=baseUrl+'/client/dashboard?catering=1';
 return {version:'catering-experience-v1',quote_id:q.id,kind,recipient:q.customer_email.trim().toLowerCase(),event_date:q.event_date,lang:q.lang==='es'?'es':'en',feedback_url:feedbackUrl,account_url:accountUrl,google_review_url:googleUrl,...cateringExperienceEmail({q,kind,feedbackUrl,accountUrl,googleUrl})};
}
export async function getCateringExperience(env,qid,{at=Date.now()}={}){
 const q=await quote(env,qid);if(!q)return fail('Catering booking not found.');
 const rows=(await env.DB.prepare('SELECT o.*,r.status AS provider_status,r.observed_at AS provider_observed_at FROM catering_experience_outbox o LEFT JOIN catering_email_receipts r ON r.provider_id=o.receipt_id WHERE o.quote_id=? ORDER BY o.kind').bind(qid).all()).results||[],messages=[];
 for(const row of rows){const reason=await eligibility(env,q,row.kind,at);messages.push({...JSON.parse(row.snapshot_json),status:row.status,can_approve:!['sending','accepted','unknown','suppressed'].includes(row.status)&&(row.kind==='pre_event_checkin'?q.event_date>day(at):day(at)<=dayOffset(q.event_date,7)),review_hash:row.review_hash,approved_at:row.approved_at,receipt_id:row.receipt_id,error:row.error,missed_window:row.error==='missed_pre_event_window',send_eligible:!reason&&!['sending','accepted','unknown','suppressed'].includes(row.status),reason,trigger:row.kind==='pre_event_checkin'?'Day before the event; booking fully paid.':'60 minutes after a recorded completed delivery and matching execution history.',provider_accepted:row.status==='accepted'&&Boolean(row.receipt_id),delivery_verified:['delivered','opened','clicked'].includes(row.provider_status),provider_status:row.provider_status||null,provider_observed_at:row.provider_observed_at||null});}
 const feedback=(await env.DB.prepare('SELECT kind,rating,mood,would_again,comment,created_at,updated_at FROM catering_experience_feedback WHERE quote_id=?').bind(qid).all()).results||[];
 const runtime=await env.DB.prepare("SELECT * FROM catering_lifecycle_runtime WHERE id='catering_lifecycle'").first();
 return {ok:true,quote:{id:q.id,customer_name:q.customer_name,customer_email:q.customer_email,event_date:q.event_date,deposit_status:q.deposit_status,balance_status:q.balance_status},messages,feedback,runtime};
}
export async function stageCateringExperience(env,qid,{baseUrl=SITE,at=Date.now()}={}){
 const q=await quote(env,qid);if(!q||!paid(q)||!dateValid(q.event_date)||!isEmail(q.customer_email))return fail('A fully paid booking, event date and saved customer email are required.');
 for(const kind of EXPERIENCE_KINDS){
  const expires=Math.max(at+DAY,Date.parse(q.event_date+'T23:59:59Z')+30*DAY);
  await env.DB.prepare(`INSERT INTO catering_experience_tokens(quote_id,kind,token,recipient,expires_at,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(quote_id,kind) DO UPDATE SET token=excluded.token,recipient=excluded.recipient,expires_at=excluded.expires_at,created_at=excluded.created_at WHERE catering_experience_tokens.recipient!=excluded.recipient`).bind(qid,kind,randToken(32),q.customer_email.trim().toLowerCase(),expires,at).run();
  const snapshot=await currentSnapshot(env,q,kind,{baseUrl,at});if(!snapshot)return fail('This booking’s feedback link expired. Review it manually before further contact.');
  const reviewHash=await hash(snapshot);
  await env.DB.prepare(`INSERT INTO catering_experience_outbox(quote_id,kind,review_hash,snapshot_json,status,created_at,updated_at) VALUES(?,?,?,?,'staged',?,?) ON CONFLICT(quote_id,kind) DO UPDATE SET review_hash=excluded.review_hash,snapshot_json=excluded.snapshot_json,status=CASE WHEN catering_experience_outbox.review_hash=excluded.review_hash THEN catering_experience_outbox.status ELSE 'staged' END,approved_hash=CASE WHEN catering_experience_outbox.review_hash=excluded.review_hash THEN catering_experience_outbox.approved_hash ELSE NULL END,approved_at=CASE WHEN catering_experience_outbox.review_hash=excluded.review_hash THEN catering_experience_outbox.approved_at ELSE NULL END,updated_at=excluded.updated_at WHERE catering_experience_outbox.status IN ('staged','approved')`).bind(qid,kind,reviewHash,JSON.stringify(snapshot),at,at).run();
 }
 return getCateringExperience(env,qid,{at});
}
export async function approveCateringExperience(env,b,{baseUrl=SITE,at=Date.now(),actor='owner'}={}){
 if(b.reviewed!==true||!EXPERIENCE_KINDS.includes(b.kind)||typeof b.enable!=='boolean')return fail('Review this exact email and explicitly approve its stated trigger.');
 const q=await quote(env,b.quote_id),current=q&&await currentSnapshot(env,q,b.kind,{baseUrl,at});
 if(!paid(q)||!current||await hash(current)!==b.review_hash)return fail('Booking or message details changed. Stage and review the current email.');
 if(b.enable&&b.kind==='pre_event_checkin'&&q.event_date<=day(at))return fail('The day-before check-in window has ended. No late pre-event email will send.');
 const r=await env.DB.prepare(`UPDATE catering_experience_outbox SET status=?,approved_hash=?,approved_by=?,approved_at=?,updated_at=? WHERE quote_id=? AND kind=? AND review_hash=? AND status IN ('staged','approved') AND EXISTS(SELECT 1 FROM catering_quotes q WHERE q.id=? AND q.deposit_status='paid' AND (q.balance_status='paid' OR q.balance_cents=0) AND lower(trim(q.customer_email))=? AND q.event_date=?)`).bind(b.enable?'approved':'staged',b.enable?b.review_hash:null,actor,b.enable?at:null,at,q.id,b.kind,b.review_hash,q.id,current.recipient,q.event_date).run();
 if(r.meta?.changes!==1)return fail('The booking changed or a send was already attempted. No approval was saved.');
 return {...await getCateringExperience(env,q.id,{at}),sent:false};
}
export async function sendCateringExperience(env,b,{baseUrl=SITE,at=Date.now(),actor='owner',approvedTrigger=false}={}){
 if(!EXPERIENCE_KINDS.includes(b.kind)||(!approvedTrigger&&b.reviewed!==true))return fail('A reviewed message approval is required.');
 const row=await env.DB.prepare('SELECT * FROM catering_experience_outbox WHERE quote_id=? AND kind=? AND review_hash=?').bind(b.quote_id,b.kind,b.review_hash||'').first();
 if(!row)return fail('The reviewed draft was replaced.');
 if(row.status==='accepted')return {ok:true,status:'accepted',receipt_id:row.receipt_id,replayed:true,provider_accepted:Boolean(row.receipt_id),delivery_verified:false};
 if(!['staged','approved'].includes(row.status)||approvedTrigger&&(row.status!=='approved'||row.approved_hash!==row.review_hash))return fail('This message is not approved or has an outcome that needs reconciliation.');
 const q=await quote(env,b.quote_id),block=await eligibility(env,q,b.kind,at);if(block)return fail(block);
 const snapshot=await currentSnapshot(env,q,b.kind,{baseUrl,at});if(!snapshot||await hash(snapshot)!==row.review_hash)return fail('Customer or message details changed. Stage and review the current email.');
 const lead=q.source_lead_id?await env.DB.prepare("SELECT id,name FROM leads WHERE id=? AND kind='catering'").bind(q.source_lead_id).first():null;
 const thread=await ensureCateringConversation(env,{lead,quote:q});
 let claimed;try{claimed=await env.DB.prepare(`UPDATE catering_experience_outbox SET status='sending',updated_at=? WHERE quote_id=? AND kind=? AND review_hash=? AND status IN ('staged','approved') AND (?=0 OR (status='approved' AND approved_hash=review_hash))`).bind(at,q.id,b.kind,row.review_hash,approvedTrigger?1:0).run();}catch{return fail('An earlier service email has an unresolved outcome. No new message was sent.');}
 if(claimed.meta?.changes!==1)return fail('Another operation already claimed this message.');
 let receiptId=null;
 try{
  const fresh=await quote(env,q.id),why=await eligibility(env,fresh,b.kind,at);
  const rendered=fresh&&await currentSnapshot(env,fresh,b.kind,{baseUrl,at});
  if(why||!rendered||await hash(rendered)!==row.review_hash){await env.DB.prepare("UPDATE catering_experience_outbox SET status='suppressed',error='booking_or_trigger_changed',updated_at=? WHERE quote_id=? AND kind=?").bind(Date.now(),q.id,b.kind).run();return fail(why||'The booking or reviewed message changed. No email was sent.');}
  const suppressed=await env.DB.prepare('SELECT reason FROM email_suppressions WHERE email=?').bind(snapshot.recipient).first();
  if(suppressed){await env.DB.prepare("UPDATE catering_experience_outbox SET status='suppressed',error='suppressed',updated_at=? WHERE quote_id=? AND kind=?").bind(Date.now(),q.id,b.kind).run();return fail('The customer email is suppressed. No email was sent.');}
  const receipt=await sendEmail(env,{to:snapshot.recipient,subject:snapshot.subject,html:snapshot.html,text:snapshot.text,replyTo:'dayan@anejocateringco.com',idempotencyKey:`catering-experience-${q.id}-${b.kind}`,timeoutMs:15000});
  if(receipt?.skipped||typeof receipt?.id!=='string'||!/^[A-Za-z0-9_-]{1,192}$/.test(receipt.id))throw Error('Unverified provider outcome');
  receiptId=receipt.id;const accepted=Date.now();
  await env.DB.batch([
   env.DB.prepare("UPDATE catering_experience_outbox SET status='accepted',receipt_id=?,error=NULL,updated_at=? WHERE quote_id=? AND kind=?").bind(receiptId,accepted,q.id,b.kind),
   env.DB.prepare("INSERT OR IGNORE INTO messages(id,thread_id,direction,channel,sender_id,sender_role,body,ai_drafted,created_at) VALUES(?,?,'outbound','email',?,'owner',?,0,?)").bind('msg_experience_'+q.id+'_'+b.kind,thread.id,actor,snapshot.subject+'\n\n'+snapshot.text,accepted),
   env.DB.prepare('UPDATE threads SET last_message_at=?,updated_at=? WHERE id=?').bind(accepted,accepted,thread.id)
  ]);
  return {ok:true,status:'accepted',receipt_id:receiptId,provider_accepted:true,delivery_verified:false};
 }catch{try{await env.DB.prepare("UPDATE catering_experience_outbox SET status='unknown',receipt_id=?,error='Reconcile provider outcome before retrying',updated_at=? WHERE quote_id=? AND kind=?").bind(receiptId,Date.now(),q.id,b.kind).run();}catch{/* durable sending claim remains */}return {...fail('The provider outcome needs reconciliation. Do not resend.'),status:'unknown',receipt_id:receiptId,provider_accepted:Boolean(receiptId),delivery_verified:false};}
}
export async function runCateringLifecycle(env,{baseUrl=SITE,at=Date.now(),limit=20}={}){
 const out={ok:true,considered:0,sent:[],skipped:[],failed:[]};if(!env?.DB)return {...out,ok:false,error:'no_db'};
 try{
  await env.DB.prepare("INSERT INTO catering_lifecycle_runtime(id,last_tick) VALUES('catering_lifecycle',?) ON CONFLICT(id) DO UPDATE SET last_tick=excluded.last_tick").bind(at).run();
  // An approved check-in must not remain apparently queued forever after its day-before window.
  await env.DB.prepare("UPDATE catering_experience_outbox SET status='suppressed',error='missed_pre_event_window',updated_at=? WHERE kind='pre_event_checkin' AND status IN ('staged','approved') AND EXISTS(SELECT 1 FROM catering_quotes q WHERE q.id=catering_experience_outbox.quote_id AND q.event_date<=?)").bind(at,day(at)).run();
  const rows=(await env.DB.prepare(`SELECT o.quote_id,o.kind,o.review_hash FROM catering_experience_outbox o JOIN catering_quotes q ON q.id=o.quote_id WHERE o.status='approved' AND o.approved_hash=o.review_hash AND ((o.kind='pre_event_checkin' AND q.event_date=?) OR (o.kind='post_delivery_review' AND EXISTS(SELECT 1 FROM catering_execution e WHERE e.quote_id=q.id AND e.status='completed'))) ORDER BY o.created_at LIMIT ?`).bind(dayOffset(day(at),1),Math.max(1,Math.min(50,limit))).all()).results||[];
  for(const row of rows){out.considered++;try{const result=await sendCateringExperience(env,row,{baseUrl,at,actor:'system:approved-booking',approvedTrigger:true});if(result.ok)out.sent.push({quote_id:row.quote_id,kind:row.kind,...result});else if(result.status==='unknown'){out.ok=false;out.failed.push({quote_id:row.quote_id,kind:row.kind,error:result.error});}else out.skipped.push({quote_id:row.quote_id,kind:row.kind,error:result.error});}catch{out.ok=false;out.failed.push({quote_id:row.quote_id,kind:row.kind,error:'Service message storage unavailable.'});}}
  await env.DB.prepare("UPDATE catering_lifecycle_runtime SET last_success=COALESCE(?,last_success),last_error=?,considered=?,accepted=? WHERE id='catering_lifecycle'").bind(out.ok?at:null,out.ok?null:'One or more service messages need review.',out.considered,out.sent.length).run();
 }catch{out.ok=false;out.error='Lifecycle storage unavailable.';try{await env.DB.prepare("UPDATE catering_lifecycle_runtime SET last_error=? WHERE id='catering_lifecycle'").bind(out.error).run();}catch{/* next owner read reports missing/stale evidence */}}
 return out;
}
export async function readCateringFeedback(env,token,{at=Date.now()}={}){
 if(!/^[a-f0-9]{64}$/.test(token||''))return fail('Feedback link unavailable.');
 const t=await env.DB.prepare('SELECT quote_id,kind,recipient,expires_at FROM catering_experience_tokens WHERE token=?').bind(token).first();
 if(!t||t.expires_at<=at)return fail('Feedback link unavailable.');
 const q=await quote(env,t.quote_id);if(!q||q.deposit_status!=='paid'||String(q.customer_email||'').trim().toLowerCase()!==t.recipient||t.kind==='pre_event_checkin'&&day(at)>q.event_date)return fail('Feedback link unavailable.');
 if(t.kind==='post_delivery_review'){const proof=await delivery(env,q.id);if(!proof||proof.recorded_at>at||day(proof.recorded_at)<q.event_date)return fail('Feedback opens after the catering delivery has been recorded.');}
 return {ok:true,kind:t.kind,prompt:t.kind==='pre_event_checkin'?'How has booking and planning your celebration with Añejo felt so far?':'How were the food and service at your celebration?',google_review_url:t.kind==='post_delivery_review'?await reviewUrl(env):null,expires_at:t.expires_at};
}
export async function saveCateringFeedback(env,b,{at=Date.now()}={}){
 const publicView=await readCateringFeedback(env,b.t,{at});if(!publicView.ok)return publicView;
 const rating=b.rating==null?null:b.rating,mood=b.mood==null?null:b.mood,again=b.would_again==null?null:b.would_again,comment=typeof b.comment==='string'?b.comment.trim():'';
 if(rating!==null&&(!Number.isInteger(rating)||rating<1||rating>10)||mood!==null&&!['sad','neutral','happy'].includes(mood)||rating===null&&mood===null||again!==null&&typeof again!=='boolean'||comment.length>2000)return fail('Choose a score from 1 to 10 or a mood, and keep comments under 2,000 characters.');
 const token=await env.DB.prepare('SELECT t.quote_id,t.kind,q.event_date FROM catering_experience_tokens t JOIN catering_quotes q ON q.id=t.quote_id WHERE t.token=?').bind(b.t).first();
 if(!token)return fail('Feedback link unavailable.');
 // Revalidate after reading the immutable event predicate; the final write guards delivery,
 // identity and expiration too, so a concurrent owner correction cannot admit stale feedback.
 const current=await readCateringFeedback(env,b.t,{at});if(!current.ok)return current;
 const saved=await env.DB.prepare(`INSERT INTO catering_experience_feedback(quote_id,kind,rating,mood,would_again,comment,created_at,updated_at) SELECT t.quote_id,t.kind,?,?,?,?,?,? FROM catering_experience_tokens t JOIN catering_quotes q ON q.id=t.quote_id WHERE t.token=? AND t.expires_at>? AND q.deposit_status='paid' AND lower(trim(q.customer_email))=t.recipient AND q.event_date=? AND ((t.kind='pre_event_checkin' AND q.event_date>=?) OR (t.kind='post_delivery_review' AND EXISTS(SELECT 1 FROM catering_execution e JOIN catering_execution_transitions x ON x.quote_id=e.quote_id AND x.version=e.version WHERE e.quote_id=q.id AND e.status='completed' AND e.delivery_mode IN ('owner_self','staff_driver') AND x.to_status='completed' AND x.recorded_at<=?))) ON CONFLICT(quote_id,kind) DO UPDATE SET rating=excluded.rating,mood=excluded.mood,would_again=excluded.would_again,comment=excluded.comment,updated_at=excluded.updated_at`).bind(rating,mood,again===null?null:again?1:0,comment||null,at,at,b.t,at,token.event_date,day(at),at).run();
 if(saved.meta?.changes!==1)return fail('The booking or delivery changed. Reload the feedback link.');
 return {...publicView,saved:true};
}
