// Read-only operator evidence. Saved execution states are not proof of physical fulfillment.
import {addEtDays,etDateOf} from './hub.js';
const TIMEZONE='America/New_York';
const LIMIT=20;
export async function readCateringStatus(env,{at=Date.now()}={}) {
 const observed_at=Number.isFinite(at)&&Math.abs(at)<=8640000000000000?new Date(at).toISOString():null;
 if(!observed_at)return {available:false,events:null,truncated:false,observed_at:null,timezone:TIMEZONE,error:'invalid_observation_time'};
 const from=etDateOf(at),through=addEtDays(from,13);
 const scope={source:'catering_quotes_with_recorded_execution',deposit_status:'paid',date_from:from,date_through:through,days:14,limit:LIMIT,meaning:'Recorded database state only; physical fulfillment and notification delivery are not verified.'};
 const base={observed_at,timezone:TIMEZONE,scope};
 if(!env?.DB)return {...base,available:false,events:null,truncated:false,error:'catering_status_unavailable'};
 try {
  const result=await env.DB.prepare(`SELECT q.id AS quote_id,q.event_date,q.serving_time,
    e.status AS recorded_status,e.version AS execution_version,e.updated_at AS execution_recorded_at,e.delivery_mode,
    a.id AS assignment_id,a.status AS assignment_status,a.updated_at AS assignment_recorded_at
    FROM catering_quotes q
    LEFT JOIN catering_execution e ON e.quote_id=q.id
    LEFT JOIN catering_assignments a ON a.id=(SELECT a2.id FROM catering_assignments a2 WHERE a2.quote_id=q.id
      ORDER BY CASE WHEN a2.status IN ('assigned','accepted') THEN 0 ELSE 1 END,a2.created_at DESC,a2.id DESC LIMIT 1)
    WHERE q.deposit_status='paid' AND q.event_date>=? AND q.event_date<=?
    ORDER BY q.event_date,COALESCE(q.serving_time,''),q.id LIMIT 21`).bind(from,through).all();
  if(result?.success===false||!Array.isArray(result?.results))throw Error('Read unavailable');
  return {...base,available:true,events:result.results.slice(0,LIMIT),truncated:result.results.length>LIMIT};
 }catch {
  // Never mask absent execution/assignment schema or failed queries as an empty event list.
  return {...base,available:false,events:null,truncated:false,error:'catering_status_unavailable'};
 }
}
export function summarizeCateringStatus(result,lang='en') {
 const es=lang==='es';
 if(!result?.available||!Array.isArray(result.events))return es?'No pude verificar el estado guardado de los eventos de catering.':'I could not verify the recorded catering event status.';
 const n=result.events.length;
 if(!n)return es?'No hay eventos de catering con depósito pagado registrados para los próximos 14 días, incluido hoy.':'No catering events with a paid deposit are recorded for the next 14 days, including today.';
 return es?`Se muestran ${n} eventos de catering con depósito pagado para los próximos 14 días, incluido hoy.${result.truncated?' Hay más eventos fuera de esta lista limitada.':''} Los estados son registros guardados; no verifican la entrega física ni el envío de notificaciones.`:`Showing ${n} catering events with a paid deposit for the next 14 days, including today.${result.truncated?' More events exist beyond this limited list.':''} Statuses are saved records; they do not verify physical delivery or notification sending.`;
}
