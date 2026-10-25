// Owner or existing minute scheduler only. No public notification/re-send endpoint.
import { json, bad, ctEq } from '../../_lib/util.js';
import { requireRole } from '../../_lib/roles.js';
import { drainCateringOutbox } from '../../_lib/catering-request.js';
import { runCallbackDelivery } from '../../_lib/catering_callback_delivery.js';
import { runKitchenReservations } from '../../_lib/catering_kitchen_calendar.js';
import { runCateringServiceMessages } from '../../_lib/catering_service_messages.js';
import { runCateringLifecycle } from '../../_lib/catering_experience.js';
import { runCateringLeadService } from '../../_lib/catering_lead_service.js';

export async function onRequestPost({ request, env }) {
  const key = request.headers.get('x-cron-key');
  if (!(env.CRON_KEY && key && ctEq(key, env.CRON_KEY))) {
    const auth = await requireRole(request, env, ['owner']);
    if (auth instanceof Response) return auth;
  }
  if (!env.DB) return bad('Database unavailable.', 503);
  try {
    const result = await drainCateringOutbox(env);
    let service;
    try { service=await runCateringLeadService(env); }
    catch { service={status:'unavailable',error:'Catering lead service unavailable; check migration and logs.'}; }
    let callbacks;
    try {callbacks=await runCallbackDelivery(env);}catch{callbacks={status:'blocked',reason:'callback_delivery_unavailable'};}
    let experience;
    try{experience=await runCateringLifecycle(env,{baseUrl:env.APP_BASE_URL||'https://anejocateringco.com'});}catch{experience={ok:false,error:'Service feedback runner unavailable; check migration and saved receipts.'};}
    let deliveryMessages;
    try{deliveryMessages=await runCateringServiceMessages(env);}catch{deliveryMessages={ok:false,error:'Delivery communication storage unavailable.'};}
    let kitchenReservations;
    try{kitchenReservations=await runKitchenReservations(env);}catch{kitchenReservations={ok:false,error:'Kitchen reservation storage unavailable.'};}
    const pending = await env.DB.prepare(`SELECT status,COUNT(*) AS count FROM catering_notification_outbox
      WHERE status!='accepted' GROUP BY status`).all();
    return json({ ok: true, ...result, service, callbacks, experience, deliveryMessages, kitchenReservations, outstanding: pending.results || [] });
  } catch { return bad('Catering notification retry failed; requests remain saved.', 503); }
}
