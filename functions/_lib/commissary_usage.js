import {etMidnightMs, etDateOf} from './hub.js';
export const COMMISSARY_FORM_URL='https://docs.google.com/forms/d/e/1FAIpQLSe-2avMBVBmkNG23JGDvcc2FBEOqF_FaTd1tuEhEaitLaL5IA/viewform';
export const COMMISSARY_SERVICES=['Kitchen Use','Potable Water','Wastewater Disposal','Trash Disposal','Grease Disposal','Other'];
export const COMMISSARY_LICENSE_TYPES=['DBPR - CAT','DBPR - HTD','DBPR - MFDV','DBPR - NOS','FDACS - Retail/Mobile','FDACS - Manufacturing','FDA','USDA','Other'];
const fail=(error,status=409)=>({ok:false,error,status});
const parse=s=>{try{return JSON.parse(s);}catch{return null;}};
const clean=(s,max)=>typeof s==='string'&&s.trim().length<=max?s.trim():null;
function serviceList(value){return Array.isArray(value)&&value.length>0&&value.length<=COMMISSARY_SERVICES.length&&value.every(s=>COMMISSARY_SERVICES.includes(s))?[...new Set(value)].sort():null;}
const person=ctx=>ctx?.distinct_id;
async function activeStaff(env,ctx){
 if(!person(ctx)||!['owner','kitchen'].includes(ctx.role))return null;
 const s=await env.DB.prepare('SELECT id,name,role,active FROM staff WHERE id=?').bind(person(ctx)).first();
 return s?.active&&s.role===ctx.role?s:null;
}
function monthRange(month,at){
 const m=month||etDateOf(at).slice(0,7);if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(m))return null;
 const [y,n]=m.split('-').map(Number),next=new Date(Date.UTC(y,n,1)).toISOString().slice(0,10);
 return {month:m,start:etMidnightMs(m+'-01'),end:etMidnightMs(next)};
}
function visitView(v){return {...v,services:parse(v.services_json)||[],profile:parse(v.profile_json)||{},duration_minutes:v.ended_at?Math.round((v.ended_at-v.started_at)/600)/100:null,external_verified:false};}
export async function commissaryUsageView(env,ctx,{month,at=Date.now()}={}){
 const staff=await activeStaff(env,ctx);if(!staff)return fail('An active kitchen or owner account is required.',403);
 const range=monthRange(month,at);if(!range)return fail('Choose a month in YYYY-MM format.',400);
 const scope=staff.role==='owner'?'':' AND staff_id=?',args=staff.role==='owner'?[]:[staff.id];
 const visits=(await env.DB.prepare(`SELECT * FROM commissary_visits WHERE started_at<? AND (ended_at IS NULL OR ended_at>?)${scope} ORDER BY started_at DESC LIMIT 500`).bind(range.end,range.start,...args).all()).results;
 if(!Array.isArray(visits))throw Error('Usage records unavailable');
 const open=await env.DB.prepare('SELECT * FROM commissary_visits WHERE staff_id=? AND ended_at IS NULL').bind(staff.id).first();
 const settings=await env.DB.prepare('SELECT * FROM commissary_usage_settings WHERE id=1').first();
 if(!settings)throw Error('Usage settings unavailable');
 const events=(await env.DB.prepare(`SELECT e.* FROM commissary_usage_events e JOIN commissary_visits v ON v.id=e.visit_id WHERE v.started_at<? AND (v.ended_at IS NULL OR v.ended_at>?)${staff.role==='owner'?'':' AND v.staff_id=?'} ORDER BY e.recorded_at DESC LIMIT 500`).bind(range.end,range.start,...args).all()).results;
 const totals=await env.DB.prepare(`SELECT COUNT(*) AS visit_count,SUM(CASE WHEN ended_at IS NOT NULL THEN 1 ELSE 0 END) AS ended_visits,SUM(CASE WHEN ended_at IS NULL THEN 1 ELSE 0 END) AS in_progress,SUM(CASE WHEN ended_at IS NOT NULL THEN MAX(0,MIN(ended_at,?)-MAX(started_at,?)) ELSE 0 END) AS actual_ms FROM commissary_visits WHERE started_at<? AND (ended_at IS NULL OR ended_at>?)${scope}`).bind(range.end,range.start,range.end,range.start,...args).first();
 if(!totals)throw Error('Monthly totals unavailable');
 return {ok:true,actor:{id:staff.id,name:staff.name,role:staff.role},month:range.month,observed_at:at,
  form:{url:COMMISSARY_FORM_URL,kind:'actual_use_sign_in',automatically_timestamped:true,hours_fields:false,external_submission_automatic:false},
  totals:{ended_visits:totals.ended_visits||0,actual_hours:Math.round((totals.actual_ms||0)/36000)/100,in_progress:totals.in_progress||0,scope:staff.role==='owner'?'all_staff':'my_visits',unit:'staff_hours'},
  open_visit:open?visitView(open):null,visits:visits.map(visitView),history_truncated:totals.visit_count>visits.length,events:events||[],
  profile:{...parse(settings.profile_json),version:settings.version},services:COMMISSARY_SERVICES,license_types:COMMISSARY_LICENSE_TYPES,
  planned_reservations_url:'/hub/kitchen/event.html',catering_events:(await env.DB.prepare("SELECT id,customer_name,event_date FROM catering_quotes WHERE deposit_status='paid' AND event_date>=? ORDER BY event_date LIMIT 100").bind(etDateOf(at-30*86400000)).all()).results||[]};
}
export async function mutateCommissaryUsage(env,b,ctx,{at=Date.now()}={}){
 const staff=await activeStaff(env,ctx);if(!staff)return fail('An active kitchen or owner account is required.',403);
 if(!b||!['start','finish','correct','review','report_submission','save_profile'].includes(b.op)||!/^[-\w]{8,100}$/.test(b.request_id||''))return fail('Choose an action and keep its stable request key.',400);
 const owner=staff.role==='owner';
 if(['correct','review','save_profile'].includes(b.op)&&!owner)return fail('Owner review is required for this action.',403);
 // Bound request contents before keeping its durable identity. Timestamps supplied to start/finish are never used.
 if(JSON.stringify(b).length>8000)return fail('This update is too large.',400);
 const request=JSON.stringify(b),prior=await env.DB.prepare('SELECT * FROM commissary_usage_receipts WHERE actor_id=? AND request_id=?').bind(staff.id,b.request_id).first();
 if(prior)return prior.request_json===request?{ok:true,replayed:true,visit_id:prior.visit_id}:fail('This request key belongs to a different update.');
 const settings=await env.DB.prepare('SELECT * FROM commissary_usage_settings WHERE id=1').first();if(!settings)throw Error('Usage settings unavailable');
 let old=null,visitId=b.op==='save_profile'?null:b.visit_id||null,version=0,after=null,reason=null,sql,args;
 if(b.op!=='start'&&b.op!=='save_profile'){
  if(!/^cv_[A-Za-z0-9-]{1,80}$/.test(visitId||''))return fail('Choose an actual visit.',400);
  old=await env.DB.prepare('SELECT * FROM commissary_visits WHERE id=?').bind(visitId).first();
  if(!old||!owner&&old.staff_id!==staff.id)return fail('This visit is not available to your account.',403);
  if(!Number.isSafeInteger(b.expected_version)||b.expected_version!==old.version)return fail('The visit changed. Reload before saving.');
  version=old.version+1;
 }
 const staffGuard='EXISTS(SELECT 1 FROM staff WHERE id=? AND active=1 AND role=?)';
 const guardArgs=[staff.id,staff.role];
 if(b.op==='start'){
  const services=serviceList(b.services),note=clean(b.note||'',1000);
  if(b.confirm_actual!==true||!services||note===null)return fail('Confirm the visit is starting now and choose the services you are actually using.',400);
  const quoteId=b.quote_id?clean(b.quote_id,110):null;
  if(b.quote_id&&(!/^cq_[\w-]+$/.test(quoteId||'')||!await env.DB.prepare('SELECT id FROM catering_quotes WHERE id=?').bind(quoteId).first()))return fail('Choose a saved catering event or leave it blank.',400);
  visitId='cv_'+crypto.randomUUID();version=1;
  after={id:visitId,staff_id:staff.id,staff_name:staff.name,quote_id:quoteId,started_at:at,ended_at:null,services_json:JSON.stringify(services),note,profile_json:settings.profile_json,version};
  sql=`INSERT INTO commissary_visits(id,staff_id,staff_name,quote_id,started_at,services_json,note,profile_json,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${staffGuard} AND NOT EXISTS(SELECT 1 FROM commissary_visits WHERE staff_id=? AND (ended_at IS NULL OR ended_at>?))`;
  args=[visitId,staff.id,staff.name,quoteId,at,JSON.stringify(services),note,settings.profile_json,at,at,...guardArgs,staff.id,at];
 }else if(b.op==='save_profile'){
  if(b.expected_version!==settings.version)return fail('The form details changed. Reload first.');
  const fields=['business_name','email','license_type','license_number'];after={};
  for(const k of fields){after[k]=clean(b.profile?.[k]||'',k==='business_name'?160:k==='email'?254:80);if(after[k]===null)return fail('Keep form details within the field limits.',400);}
  if(after.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(after.email)||after.license_type&&!COMMISSARY_LICENSE_TYPES.includes(after.license_type)||after.license_number&&!/^\d+$/.test(after.license_number))return fail('Use a valid email, listed license type and digits-only license number.',400);
  old={profile_json:settings.profile_json,version:settings.version};version=settings.version+1;
  sql=`UPDATE commissary_usage_settings SET profile_json=?,version=version+1,updated_by=?,updated_at=? WHERE id=1 AND version=? AND ${staffGuard}`;
  args=[JSON.stringify(after),staff.id,at,settings.version,...guardArgs];
 }else{
  let set='',guard='',extra=[];after={...old,version,updated_at:at};
  if(b.op==='finish'){
   const services=serviceList(b.services),note=clean(b.note||old.note||'',1000);
   if(b.confirm_actual!==true||!services||note===null||old.ended_at||at<=old.started_at||at-old.started_at>86400000)return fail('Confirm this visit is ending now. A forgotten visit over 24 hours needs an owner correction.',400);
   set='ended_at=?,services_json=?,note=?,reviewed_at=NULL,reviewed_by=NULL';extra=[at,JSON.stringify(services),note];Object.assign(after,{ended_at:at,services_json:JSON.stringify(services),note,reviewed_at:null,reviewed_by:null});guard=' AND ended_at IS NULL';
  }else if(b.op==='correct'){
   reason=clean(b.reason||'',1000);const services=serviceList(b.services),start=Number(b.started_at),end=Number(b.ended_at),note=clean(b.note||'',1000);
   if(b.confirm_actual!==true||!reason||!services||note===null||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<=0||end<=start||end>at||end-start>86400000)return fail('Owner corrections need actual start/end times, services and a reason; maximum visit is 24 hours.',400);
   set="started_at=?,ended_at=?,services_json=?,note=?,reviewed_by=?,reviewed_at=?,external_status='not_recorded',external_reported_by=NULL,external_reported_at=NULL,external_reference=NULL";extra=[start,end,JSON.stringify(services),note,staff.id,at];
   Object.assign(after,{started_at:start,ended_at:end,services_json:JSON.stringify(services),note,reviewed_by:staff.id,reviewed_at:at,external_status:'not_recorded',external_reported_by:null,external_reported_at:null,external_reference:null});
   guard=' AND NOT EXISTS(SELECT 1 FROM commissary_visits other WHERE other.staff_id=commissary_visits.staff_id AND other.id!=commissary_visits.id AND other.started_at<? AND (other.ended_at IS NULL OR other.ended_at>?))';extra.push(end,start);
   // Overlap parameters belong after the version and active-actor guard below.
   extra=extra.slice(0,-2);guardArgs.push(end,start);
  }else if(b.op==='review'){
   if(!old.ended_at||b.confirm_actual!==true)return fail('Review the ended visit before recording owner review.',400);
   set='reviewed_by=?,reviewed_at=?';extra=[staff.id,at];Object.assign(after,{reviewed_by:staff.id,reviewed_at:at});
  }else{
   const ref=clean(b.reference||'',500);
   if(!old.ended_at||b.confirm_actual!==true||b.confirm_submitted!==true||ref===null)return fail('Confirm the ended visit is accurate and that you personally submitted its real usage form.',400);
   if(old.external_status==='user_reported_submitted')return fail('This submission is already reported. Reconcile the receipt before recording another.');
   set="external_status='user_reported_submitted',external_reported_by=?,external_reported_at=?,external_reference=?";extra=[staff.id,at,ref||null];Object.assign(after,{external_status:'user_reported_submitted',external_reported_by:staff.id,external_reported_at:at,external_reference:ref||null});
  }
  sql=`UPDATE commissary_visits SET ${set},version=version+1,updated_at=? WHERE id=? AND version=? AND ${staffGuard}${guard}`;
  args=[...extra,at,visitId,old.version,...guardArgs];
 }
 const statements=[
  env.DB.prepare('INSERT INTO commissary_usage_receipts(actor_id,request_id,request_json,visit_id,recorded_at) VALUES(?,?,?,?,?)').bind(staff.id,b.request_id,request,visitId,at),
  env.DB.prepare(sql).bind(...args),
  // A lost CAS/permission/overlap check aborts the entire D1 batch, including receipt and audit.
  env.DB.prepare('UPDATE commissary_usage_receipts SET succeeded=CASE WHEN changes()=1 THEN 1 ELSE NULL END WHERE actor_id=? AND request_id=?').bind(staff.id,b.request_id),
  env.DB.prepare('INSERT INTO commissary_usage_events(id,visit_id,operation,actor_id,request_id,before_json,after_json,reason,recorded_at) VALUES(?,?,?,?,?,?,?,?,?)').bind('cve_'+crypto.randomUUID(),visitId,b.op,staff.id,b.request_id,old?JSON.stringify(old):null,JSON.stringify(after),reason,at)
 ];
 try{await env.DB.batch(statements);}catch(error){
  const saved=await env.DB.prepare('SELECT request_json,visit_id FROM commissary_usage_receipts WHERE actor_id=? AND request_id=?').bind(staff.id,b.request_id).first();
  if(saved?.request_json===request)return {ok:true,replayed:true,visit_id:saved.visit_id};
  if(/constraint|unique/i.test(String(error)))return fail('The visit, current account or overlapping hours changed. Reload before saving.');throw error;
 }
 return {ok:true,visit_id:visitId,version,external_verified:false};
}
