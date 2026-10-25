import {callbackEventId} from './catering_callback_delivery.js';
const fail=error=>({ok:false,error});
export async function kitchenCalendarView(env,qid){
 const settings=await env.DB.prepare('SELECT * FROM catering_kitchen_calendar_settings WHERE id=1').first();
 const reservation=await env.DB.prepare('SELECT * FROM catering_kitchen_reservations WHERE quote_id=?').bind(qid).first();
 return {settings,reservation,ready:!!(settings?.calendar_id&&settings.confirmed_at&&env.GOOGLE_CALENDAR_CLIENT_ID&&env.GOOGLE_CALENDAR_CLIENT_SECRET&&env.GOOGLE_CALENDAR_REFRESH_TOKEN),reason:!settings?.confirmed_at?'Confirm the kitchen’s actual booking calendar.':!env.GOOGLE_CALENDAR_REFRESH_TOKEN?'Calendar runtime credentials are not configured.':null};
}
export async function configureKitchenCalendar(env,b,{actor,at=Date.now()}={}){
 if(b.confirm_destination!==true||typeof b.calendar_id!=='string'||b.calendar_id.length>250||!/^[-A-Za-z0-9_@.#]+$/.test(b.calendar_id))return fail('Confirm the exact kitchen reservation calendar ID.');
 await env.DB.prepare('UPDATE catering_kitchen_calendar_settings SET calendar_id=?,confirmed_by=?,confirmed_at=? WHERE id=1').bind(b.calendar_id,actor,at).run();return {ok:true,booked:false};
}
export async function saveKitchenReservation(env,b,{actor,at=Date.now(),owner=false}={}){
 const q=await env.DB.prepare('SELECT id,updated_at,deposit_status,event_date FROM catering_quotes WHERE id=?').bind(b.quote_id).first();
 if(!q||q.deposit_status!=='paid')return fail('A paid catering booking is required.');
 const prior=await env.DB.prepare('SELECT * FROM catering_kitchen_reservations WHERE quote_id=?').bind(q.id).first();
 if(prior&&prior.version!==b.expected_version)return fail('Kitchen hours changed. Reload before saving.');
 if(b.op==='approve_hours'){
  if(!owner||!prior||prior.status!=='draft'||prior.quote_updated_at!==q.updated_at)return fail('Owner approval requires current draft hours.');
  const view=await kitchenCalendarView(env,q.id);if(!view.ready)return fail(view.reason||'The calendar integration is not ready.');
  if(prior.start_at<=at)return fail('Past kitchen hours cannot be booked automatically.');
  const r=await env.DB.prepare("UPDATE catering_kitchen_reservations SET status='approved',calendar_id=?,approved_by=?,approved_at=?,updated_at=?,version=version+1 WHERE quote_id=? AND version=? AND status='draft'").bind(view.settings.calendar_id,actor,at,at,q.id,b.expected_version).run();return r.meta?.changes===1?{ok:true,booked:false,status:'approved'}:fail('Hours changed; reload.');
 }
 const start=Number(b.start_at),end=Number(b.end_at);
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<=at||end<=start||end-start>24*3600000)return fail('Choose future start and end times, within 24 hours.');
 const local=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
 if(local(end)>q.event_date)return fail('Kitchen hours cannot finish after the event date.');
 if(prior&&(['booking','confirmed','approved'].includes(prior.status)||prior.provider_event_id))return fail('These hours have been approved or booked. Review the calendar reservation before changing them.');
 const result=await env.DB.prepare(`INSERT INTO catering_kitchen_reservations(quote_id,start_at,end_at,quote_updated_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(quote_id) DO UPDATE SET start_at=excluded.start_at,end_at=excluded.end_at,quote_updated_at=excluded.quote_updated_at,status='draft',approved_by=NULL,approved_at=NULL,error=NULL,version=catering_kitchen_reservations.version+1,updated_at=excluded.updated_at WHERE catering_kitchen_reservations.version=? AND catering_kitchen_reservations.status IN ('draft','needs_review')`).bind(q.id,start,end,q.updated_at,actor,at,at,b.expected_version||0).run();return result.meta?.changes===1?{ok:true,booked:false,status:'draft'}:fail('Hours changed; reload.');
}
export function kitchenCalendarAdapter(env,{fetcher=fetch}={}){
 let token;async function call(url,options={}){
  if(!token){const r=await fetcher('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CALENDAR_CLIENT_ID,client_secret:env.GOOGLE_CALENDAR_CLIENT_SECRET,refresh_token:env.GOOGLE_CALENDAR_REFRESH_TOKEN,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10000)});const d=await r.json();if(!r.ok||!d.access_token)throw Error('Calendar authorization unavailable.');token=d.access_token;}
  const r=await fetcher(url,{...options,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},signal:AbortSignal.timeout(10000)});if(r.status===404)return {missing:true};if(r.status===409)return {conflict:true};if(!r.ok)throw Error('Calendar provider unavailable.');return r.json();
 }
 const base=p=>'https://www.googleapis.com/calendar/v3/calendars/'+encodeURIComponent(p.calendar_id)+'/events';
 return {get:p=>call(base(p)+'/'+p.provider_event_id),busy:async p=>{const r=await call('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',body:JSON.stringify({timeMin:new Date(p.start_at).toISOString(),timeMax:new Date(p.end_at).toISOString(),items:[{id:p.calendar_id}]})});const c=r.calendars?.[p.calendar_id];if(!c||c.errors?.length||!Array.isArray(c.busy))throw Error('Calendar availability unverified.');if(c.busy.some(w=>!Number.isFinite(Date.parse(w.start))||!Number.isFinite(Date.parse(w.end))||Date.parse(w.end)<=Date.parse(w.start)))throw Error('Calendar availability unverified.');return c.busy.some(w=>Date.parse(w.start)<p.end_at&&Date.parse(w.end)>p.start_at);},create:p=>call(base(p)+'?sendUpdates=none',{method:'POST',body:JSON.stringify({id:p.provider_event_id,summary:'Añejo · Catering kitchen preparation',description:'Internal kitchen reservation '+p.quote_id,start:{dateTime:new Date(p.start_at).toISOString(),timeZone:'America/New_York'},end:{dateTime:new Date(p.end_at).toISOString(),timeZone:'America/New_York'},extendedProperties:{private:{anejo_kitchen_quote:p.quote_id,anejo_reservation_version:String(p.version)}}})})};
}
const matches=(e,p)=>e?.id===p.provider_event_id&&e.status==='confirmed'&&Date.parse(e.start?.dateTime)===p.start_at&&Date.parse(e.end?.dateTime)===p.end_at&&e.extendedProperties?.private?.anejo_kitchen_quote===p.quote_id&&e.extendedProperties?.private?.anejo_reservation_version===String(p.version);
export async function runKitchenReservations(env,{at=Date.now(),adapter=kitchenCalendarAdapter(env)}={}){
 const out={ok:true,confirmed:0,needs_review:0};
 const rows=(await env.DB.prepare("SELECT * FROM catering_kitchen_reservations WHERE status IN ('approved','booking') ORDER BY start_at LIMIT 20").all()).results||[];
 for(const row of rows){
  const view=await kitchenCalendarView(env,row.quote_id);if(!view.ready)continue;
  const holder=crypto.randomUUID();await env.DB.prepare('INSERT INTO catering_kitchen_calendar_locks VALUES(?,?,?) ON CONFLICT(calendar_id) DO UPDATE SET holder=excluded.holder,lease_until=excluded.lease_until WHERE catering_kitchen_calendar_locks.lease_until<?').bind(row.calendar_id,holder,at+120000,at).run();
  if((await env.DB.prepare('SELECT holder FROM catering_kitchen_calendar_locks WHERE calendar_id=?').bind(row.calendar_id).first())?.holder!==holder)continue;
  try{
   const q=await env.DB.prepare('SELECT updated_at,deposit_status FROM catering_quotes WHERE id=?').bind(row.quote_id).first();
   if(!q||q.deposit_status!=='paid'||q.updated_at!==row.quote_updated_at||row.calendar_id!==view.settings.calendar_id)throw Error('Booking or calendar changed; review hours.');
   const p={...row,provider_event_id:row.provider_event_id||await callbackEventId('kitchen:'+row.quote_id+':'+row.version)};
   let e=await adapter.get(p);
   if(e.missing){
    if(row.start_at<=at)throw Error('Reservation time elapsed.');
    const overlap=await env.DB.prepare("SELECT quote_id FROM catering_kitchen_reservations WHERE calendar_id=? AND quote_id!=? AND status IN ('approved','booking','confirmed') AND start_at<? AND end_at>? LIMIT 1").bind(row.calendar_id,row.quote_id,row.end_at,row.start_at).first();
    if(overlap||await adapter.busy(p))throw Error('Kitchen hours overlap an existing reservation.');
    const fresh=await env.DB.prepare('SELECT r.status,r.version,q.updated_at,q.deposit_status,s.calendar_id FROM catering_kitchen_reservations r JOIN catering_quotes q ON q.id=r.quote_id JOIN catering_kitchen_calendar_settings s ON s.id=1 WHERE r.quote_id=?').bind(row.quote_id).first();
    if(!fresh||fresh.version!==row.version||!['approved','booking'].includes(fresh.status)||fresh.updated_at!==row.quote_updated_at||fresh.deposit_status!=='paid'||fresh.calendar_id!==row.calendar_id)throw Error('Reservation changed before booking.');
    const claim=await env.DB.prepare("UPDATE catering_kitchen_reservations SET status='booking',provider_event_id=?,updated_at=? WHERE quote_id=? AND version=? AND status IN ('approved','booking')").bind(p.provider_event_id,at,row.quote_id,row.version).run();if(claim.meta?.changes!==1)continue;
    await adapter.create(p);e=await adapter.get(p);
   }
   if(!matches(e,p))throw Error('Calendar readback does not match approved hours.');
   await env.DB.prepare("UPDATE catering_kitchen_reservations SET status='confirmed',provider_event_id=?,provider_verified_at=?,error=NULL,updated_at=? WHERE quote_id=? AND version=? AND status IN ('approved','booking')").bind(p.provider_event_id,at,at,row.quote_id,row.version).run();out.confirmed++;
  }catch(error){out.ok=false;out.needs_review++;await env.DB.prepare("UPDATE catering_kitchen_reservations SET status='needs_review',error=?,updated_at=? WHERE quote_id=? AND version=?").bind(error.message,at,row.quote_id,row.version).run();}
  finally{await env.DB.prepare('DELETE FROM catering_kitchen_calendar_locks WHERE calendar_id=? AND holder=?').bind(row.calendar_id,holder).run();}
 }
 return out;
}
