import {createBalanceCheckout} from './catering_balance.js';
import {balanceReminderEmail,dayOffset} from './catering_balance_reminder.js';
import {sendEmail} from './email.js';
import {id,isEmail} from './util.js';

const SITE='https://anejocateringco.com';
const fail=error=>({ok:false,error});
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
export const balanceCollectionDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const loadQuote=(env,quoteId)=>env.DB.prepare(`SELECT id,customer_name,customer_email,event_date,balance_cents,balance_due_date,deposit_status,balance_status,lang,updated_at FROM catering_quotes WHERE id=?`).bind(quoteId).first();
const kindFor=(q,today)=>dayOffset(q.balance_due_date,-1)===today?'due_soon':'due_today';
async function templateHash(lang){
  return digest(['due_soon','due_today','balance_request'].map(kind=>balanceReminderEmail({kind,customerName:'Preview',eventDate:'2030-02-03',balanceCents:12345,dueDate:'2030-02-02',payUrl:'https://square.link/template-preview',accountUrl:SITE+'/client/dashboard?catering=1',lang})));
}
export async function balanceCollectionAutomation(env,lang='en'){
  lang=lang==='es'?'es':'en';
  const hash=await templateHash(lang),policy=await env.DB.prepare('SELECT * FROM catering_balance_collection_policy WHERE lang=?').bind(lang).first();
  return {lang,enabled:policy?.enabled===1&&policy.template_hash===hash,template_hash:hash,approved_at:policy?.approved_at||null,template_changed:Boolean(policy&&policy.template_hash!==hash)};
}
export async function balanceAutomationApproved(env,lang='en'){
  try{return (await balanceCollectionAutomation(env,lang)).enabled;}catch{return false;}
}
function reason(q){
  if(!q)return 'Quote not found.';
  if(q.deposit_status!=='paid'||q.balance_status!=='due'||!Number.isSafeInteger(q.balance_cents)||q.balance_cents<=0)return 'A paid deposit and an unpaid positive balance are required.';
  if(!isEmail(q.customer_email))return 'Save a valid customer email address before collecting the balance.';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(q.balance_due_date||''))return 'The quoted balance due date is missing. Review the booking terms.';
  return null;
}
const parse=value=>{try{return JSON.parse(value);}catch{return null;}};
function publicReceipt(row){
  const status=row.receipt_status||(row.sent_at?'accepted_unverified':'unknown');
  return {kind:row.kind,status,receipt_id:row.receipt_id||null,sent_at:row.sent_at||null,error:row.error||null,amount_cents:row.amount_cents,provider_accepted:status==='accepted'&&Boolean(row.receipt_id),delivery_verified:false,created_at:row.created_at};
}
async function history(env,quoteId){return ((await env.DB.prepare('SELECT * FROM catering_balance_reminders WHERE quote_id=? ORDER BY created_at DESC').bind(quoteId).all()).results||[]).map(publicReceipt);}
function receiptBlock(rows,kind,today=balanceCollectionDate()){
  if(rows.some(x=>['sending','unknown','pending'].includes(x.status)))return 'An earlier payment reminder has an unconfirmed outcome. Reconcile its receipt before any further send.';
  if(rows.some(x=>x.kind!==kind&&x.sent_at&&new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x.sent_at))===today))return 'A payment reminder was already accepted today. Review its receipt before further contact.';
  if(rows.some(x=>x.kind===kind))return 'This payment reminder has already been attempted. Review its saved receipt; no duplicate will be sent.';
  return null;
}
function publicDraft(row){if(!row)return null;return {...parse(row.snapshot_json),quote_id:row.quote_id,kind:row.kind,review_hash:row.review_hash,status:row.status,staged_at:row.staged_at};}
export async function getBalanceCollection(env,quoteId,{today=balanceCollectionDate()}={}){
  const q=await loadQuote(env,quoteId),rows=await history(env,quoteId),kind=q?kindFor(q,today):'due_today';
  const draft=await env.DB.prepare('SELECT * FROM catering_balance_collection_drafts WHERE quote_id=? AND kind=?').bind(quoteId,kind).first();
  const blocked=reason(q)||receiptBlock(rows,kind,today);
  return {ok:true,quote:q,history:rows,draft:publicDraft(draft),eligible:!blocked,reason:blocked,automation:await balanceCollectionAutomation(env,q?.lang)};
}
async function snapshot(q,{baseUrl,today,kind,payUrl,checkoutOrderId}){
  const accountUrl=baseUrl+'/client/dashboard?catering=1';
  const email=balanceReminderEmail({kind:kind==='due_soon'?'due_soon':q.balance_due_date===today?'due_today':'balance_request',customerName:q.customer_name,eventDate:q.event_date,balanceCents:q.balance_cents,dueDate:q.balance_due_date,payUrl,accountUrl,lang:q.lang});
  return {version:'balance-collection-v1',template_hash:await templateHash(q.lang==='es'?'es':'en'),quote_id:q.id,quote_updated_at:q.updated_at,kind,recipient:q.customer_email.trim().toLowerCase(),amount_cents:q.balance_cents,due_date:q.balance_due_date,event_date:q.event_date,lang:q.lang||'en',review_date:today,pay_url:payUrl,checkout_order_id:checkoutOrderId,account_url:accountUrl,...email};
}
export async function approveBalanceAutomation(env,body,{baseUrl=SITE,today=balanceCollectionDate(),actor='owner'}={}){
  if(body.reviewed!==true||!/^[a-f0-9]{64}$/.test(body.review_hash||'')||typeof body.enable!=='boolean')return fail('Review the payment email and explicitly choose whether to enable future reminders.');
  const draft=await env.DB.prepare('SELECT * FROM catering_balance_collection_drafts WHERE quote_id=? AND review_hash=?').bind(body.quote_id,body.review_hash).first();
  if(!draft)return fail('Stage and review the current email before changing reminder automation.');
  const q=await loadQuote(env,body.quote_id),link=await env.DB.prepare('SELECT amount_cents,payment_link_url,square_order_id,paid_at FROM catering_balance_checkouts WHERE quote_id=?').bind(body.quote_id).first();
  if(reason(q)||!link||link.paid_at||link.amount_cents!==q.balance_cents||!link.payment_link_url)return fail('Payment state changed. Review the current booking.');
  const current=await snapshot(q,{baseUrl,today,kind:draft.kind,payUrl:link.payment_link_url,checkoutOrderId:link.square_order_id});
  if(await digest(current)!==body.review_hash)return fail('The preview changed. Review the current email before changing automation.');
  const lang=q.lang==='es'?'es':'en',hash=await templateHash(lang),now=Date.now();
  const approved=await env.DB.prepare(`INSERT INTO catering_balance_collection_policy(lang,enabled,template_hash,approved_by,approved_at,source_quote_id,source_review_hash) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM catering_quotes q JOIN catering_balance_checkouts b ON b.quote_id=q.id WHERE q.id=? AND q.deposit_status='paid' AND q.balance_status='due' AND q.balance_cents=? AND q.updated_at=? AND b.paid_at IS NULL AND b.amount_cents=q.balance_cents AND b.payment_link_url=? AND b.square_order_id=?) ON CONFLICT(lang) DO UPDATE SET enabled=excluded.enabled,template_hash=excluded.template_hash,approved_by=excluded.approved_by,approved_at=excluded.approved_at,source_quote_id=excluded.source_quote_id,source_review_hash=excluded.source_review_hash`).bind(lang,body.enable?1:0,hash,actor,now,q.id,body.review_hash,q.id,q.balance_cents,q.updated_at,link.payment_link_url,link.square_order_id).run();
  if(approved.meta?.changes!==1)return fail('Payment state changed while saving automation approval. Review the current booking.');
  return {ok:true,automation:await balanceCollectionAutomation(env,lang),sent:false};
}
export async function stageBalanceCollection(env,quoteId,{baseUrl=SITE,today=balanceCollectionDate(),kind:requestedKind,actor='system'}={}){
  let q=await loadQuote(env,quoteId);const invalid=reason(q);if(invalid)return fail(invalid);
  const kind=requestedKind||kindFor(q,today);
  if(!['due_soon','due_today'].includes(kind))return fail('Invalid reminder kind.');
  const blocked=receiptBlock(await history(env,quoteId),kind,today);if(blocked)return {...await getBalanceCollection(env,quoteId,{today}),ok:false,error:blocked};
  const link=await createBalanceCheckout(env,quoteId,baseUrl);
  if(!link?.ok||!link.url)return fail(link?.error||'The final payment link could not be prepared.');
  q=await loadQuote(env,quoteId);if(reason(q))return fail('Payment status changed while preparing the reminder. Reload the booking.');
  const saved=await env.DB.prepare('SELECT amount_cents,payment_link_url,square_order_id,paid_at FROM catering_balance_checkouts WHERE quote_id=?').bind(quoteId).first();
  if(!saved||saved.paid_at||saved.amount_cents!==q.balance_cents||saved.payment_link_url!==link.url)return fail('Payment details changed. Reload the booking.');
  const data=await snapshot(q,{baseUrl,today,kind,payUrl:link.url,checkoutOrderId:saved.square_order_id}),hash=await digest(data),now=Date.now();
  await env.DB.prepare(`INSERT INTO catering_balance_collection_drafts(quote_id,kind,review_hash,snapshot_json,status,staged_by,staged_at,updated_at) VALUES(?,?,?,?,'staged',?,?,?) ON CONFLICT(quote_id,kind) DO UPDATE SET review_hash=excluded.review_hash,snapshot_json=excluded.snapshot_json,staged_by=excluded.staged_by,staged_at=excluded.staged_at,updated_at=excluded.updated_at WHERE catering_balance_collection_drafts.status='staged'`).bind(quoteId,kind,hash,JSON.stringify(data),actor,now,now).run();
  const out=await getBalanceCollection(env,quoteId,{today});
  if(out.draft?.review_hash!==hash||out.draft?.status!=='staged')return {...out,ok:false,error:'A previous collection attempt is locked for reconciliation.'};
  return out;
}
export async function sendBalanceCollection(env,body,{baseUrl=SITE,today=balanceCollectionDate(),actor='owner'}={}){
  if(body.reviewed!==true||!/^[a-f0-9]{64}$/.test(body.review_hash||''))return fail('Review the rendered payment email before sending.');
  const quoteId=String(body.quote_id||'');
  const draft=await env.DB.prepare('SELECT * FROM catering_balance_collection_drafts WHERE quote_id=? AND review_hash=?').bind(quoteId,body.review_hash).first();
  if(!draft)return fail('The reviewed draft was replaced. Stage and review the current payment email.');
  const old=await env.DB.prepare('SELECT * FROM catering_balance_reminders WHERE quote_id=? AND kind=?').bind(quoteId,draft.kind).first();
  if(old)return {ok:old.receipt_status==='accepted'&&Boolean(old.receipt_id),...publicReceipt(old),replayed:true,error:old.receipt_status==='accepted'?undefined:'An earlier attempt must be reconciled; no new email was sent.'};
  if(draft.status!=='staged')return {...fail('This collection attempt is locked. Check its saved receipt before retrying.'),status:draft.status};
  const q=await loadQuote(env,quoteId);if(reason(q))return fail('Payment or customer details changed. Reload the booking.');
  const link=await env.DB.prepare('SELECT amount_cents,payment_link_url,square_order_id,paid_at FROM catering_balance_checkouts WHERE quote_id=?').bind(quoteId).first();
  if(!link||link.paid_at||link.amount_cents!==q.balance_cents||!link.payment_link_url)return fail('The saved final payment checkout no longer matches this balance.');
  const current=await snapshot(q,{baseUrl,today,kind:draft.kind,payUrl:link.payment_link_url,checkoutOrderId:link.square_order_id});
  if(await digest(current)!==body.review_hash)return fail('Quote, recipient, date or email content changed. Stage and review the current email.');
  const blocked=receiptBlock(await history(env,quoteId),draft.kind,today);if(blocked)return fail(blocked);
  const claimId=id('cbr'),now=Date.now();
  const claimed=await env.DB.batch([
    env.DB.prepare(`INSERT OR IGNORE INTO catering_balance_reminders(id,quote_id,kind,amount_cents,channel,created_at,receipt_status,review_hash) SELECT ?,?,?,?,'email',?,'sending',? WHERE EXISTS(SELECT 1 FROM catering_balance_collection_drafts WHERE quote_id=? AND kind=? AND status='staged' AND review_hash=?)`).bind(claimId,quoteId,draft.kind,q.balance_cents,now,body.review_hash,quoteId,draft.kind,body.review_hash),
    env.DB.prepare(`UPDATE catering_balance_collection_drafts SET status='sending',approved_by=?,updated_at=? WHERE quote_id=? AND kind=? AND status='staged' AND review_hash=? AND EXISTS(SELECT 1 FROM catering_balance_reminders WHERE id=?)`).bind(actor,now,quoteId,draft.kind,body.review_hash,claimId)
  ]);
  if(claimed[0]?.meta?.changes!==1||claimed[1]?.meta?.changes!==1)return fail('Another collection attempt has already claimed this reminder. Reload its receipt.');
  let receiptId=null;
  const saveOutcome=async(status,error)=>env.DB.batch([
    env.DB.prepare('UPDATE catering_balance_reminders SET receipt_status=?,receipt_id=?,sent_at=?,error=? WHERE id=?').bind(status,receiptId,status==='accepted'?Date.now():null,error,claimId),
    env.DB.prepare('UPDATE catering_balance_collection_drafts SET status=?,updated_at=? WHERE quote_id=? AND kind=?').bind(status,Date.now(),quoteId,draft.kind)
  ]);
  try{
    const fresh=await loadQuote(env,quoteId);
    const freshLink=await env.DB.prepare('SELECT amount_cents,payment_link_url,square_order_id,paid_at FROM catering_balance_checkouts WHERE quote_id=?').bind(quoteId).first();
    if(reason(fresh)||!freshLink||freshLink.paid_at||freshLink.amount_cents!==fresh.balance_cents||freshLink.payment_link_url!==link.payment_link_url||freshLink.square_order_id!==link.square_order_id||await digest(await snapshot(fresh,{baseUrl,today,kind:draft.kind,payUrl:freshLink.payment_link_url,checkoutOrderId:freshLink.square_order_id}))!==body.review_hash){await saveOutcome('suppressed','quote_state_changed_before_send');return {...fail('Payment or quote details changed. No email was sent.'),status:'suppressed'};}
    if(actor==='system:approved-template'&&!await balanceAutomationApproved(env,fresh.lang)){await saveOutcome('suppressed','automation_approval_changed_before_send');return {...fail('Automatic reminder approval changed. No email was sent.'),status:'suppressed'};}
    // Fail closed on suppression-storage errors; the shared claim blocks uncertain retries.
    const suppressed=await env.DB.prepare('SELECT reason FROM email_suppressions WHERE email=? LIMIT 1').bind(current.recipient).first();
    if(suppressed){await saveOutcome('suppressed','suppressed');return {...fail('The customer email is suppressed. No email was sent.'),status:'suppressed'};}
    const receipt=await sendEmail(env,{to:current.recipient,subject:current.subject,html:current.html,text:current.text,replyTo:'dayan@anejocateringco.com',idempotencyKey:`catering-balance-${draft.kind}-${quoteId}`,timeoutMs:15000});
    if(receipt?.skipped){await saveOutcome('suppressed','suppressed');return {...fail('The customer email is suppressed. No email was sent.'),status:'suppressed'};}
    if(typeof receipt?.id!=='string'||!/^[A-Za-z0-9_-]{1,192}$/.test(receipt.id))throw new Error('provider_acceptance_unverified');
    receiptId=receipt.id;
    await saveOutcome('accepted',null);
    return {ok:true,status:'accepted',receipt_id:receiptId,provider_accepted:true,delivery_verified:false};
  }catch{
    try{await saveOutcome('unknown',receiptId?'Provider accepted; local receipt persistence needs reconciliation.':'Provider outcome unconfirmed; reconcile before retry.');}catch{/* The durable sending claim still blocks every retry. */}
    return {...fail('The send outcome needs reconciliation. Do not resend.'),status:'unknown',receipt_id:receiptId,provider_accepted:Boolean(receiptId),delivery_verified:false};
  }
}
