// Owner-attested operational recovery. No customer/provider callbacks, proof fabrication or payout writes.
import { id } from './util.js';
const allowed = new Set(['paid','prep','ready','out_for_delivery','delivery_failed','fulfilled']);
const fail = (error,status=400)=>({ok:false,error,status});
const digest = async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function deliveryResolutionContext(env, scope) {
  const routeId=String(scope.route_id||''),orderId=String(scope.order_id||'');
  if(!!routeId===!!orderId||![routeId||orderId].every(v=>/^[A-Za-z0-9_-]{1,160}$/.test(v)))return fail('Choose one route or order.');
  let route=null,orders=[];
  if(routeId){
    route=await env.DB.prepare('SELECT id,driver_id,route_date,status,offer_status,updated_at,completed_at FROM routes WHERE id=?').bind(routeId).first();
    if(!route)return fail('Route not found.',404);
    const rows=await env.DB.prepare('SELECT o.id,o.customer_name,o.status,o.delivery_date,o.updated_at FROM orders o JOIN route_stops s ON s.order_id=o.id WHERE s.route_id=? ORDER BY s.seq,s.id').bind(routeId).all();orders=rows.results||[];
  }else{
    const order=await env.DB.prepare('SELECT id,customer_name,status,delivery_date,updated_at FROM orders WHERE id=?').bind(orderId).first();
    if(!order)return fail('Order not found.',404);orders=[order];
    route=await env.DB.prepare("SELECT r.id,r.driver_id,r.route_date,r.status,r.offer_status,r.updated_at,r.completed_at FROM routes r JOIN route_stops s ON s.route_id=r.id WHERE s.order_id=? AND r.status NOT IN ('canceled','completed') ORDER BY r.created_at DESC LIMIT 1").bind(orderId).first();
  }
  if(!orders.length||orders.length>50||new Set(orders.map(o=>o.id)).size!==orders.length)return fail('Review the route stops before resolving this delivery.',409);
  if(route&&['canceled','completed'].includes(route.status))return fail('This route is already closed. Review its history.',409);
  if(orders.some(o=>!allowed.has(o.status)))return fail('Only paid, fulfillable orders can be confirmed delivered.',409);
  const stops=route?(await env.DB.prepare('SELECT id,order_id,status,updated_at,delivered_at FROM route_stops WHERE route_id=? ORDER BY id').bind(route.id).all()).results||[]:[];
  const placeholders=orders.map(()=>'?').join(',');
  const deliveries=(await env.DB.prepare(`SELECT id,order_id,status,on_time,completed_at,updated_at FROM deliveries WHERE order_id IN (${placeholders}) ORDER BY id`).bind(...orders.map(o=>o.id)).all()).results||[];
  if(orders.some(o=>deliveries.filter(d=>d.order_id===o.id&&d.status!=='completed').length>1))return fail('Multiple unfinished delivery records need review before confirmation.',409);
  const snapshot={route,orders:orders.map(({customer_name:_,...o})=>o),stops,deliveries};
  return {ok:true,scope:{...(routeId?{route_id:routeId}:{order_id:orderId})},route,orders,stops,deliveries,snapshot_hash:await digest(snapshot),history:(await env.DB.prepare("SELECT id,actor_id,created_at,properties FROM activity_log WHERE event='delivery.owner_confirmed' AND (json_extract(properties,'$.route_id')=? OR json_extract(properties,'$.order_id')=?) ORDER BY created_at DESC LIMIT 20").bind(route?.id||'',orderId||'').all()).results||[]};
}
export async function resolveOwnerDelivery(env,b,ctx) {
  if(!b||Array.isArray(b)||b.confirmed!==true)return fail('Confirm that the delivery actually took place.');
  const reason=String(b.reason||'').trim();
  if(reason.length<8||reason.length>1000)return fail('Enter a reason of 8–1,000 characters.');
  if(!/^[A-Za-z0-9_-]{16,100}$/.test(b.request_id||''))return fail('Missing confirmation request. Reopen the delivery controls.');
  if(!/^[a-f0-9]{64}$/.test(b.snapshot_hash||''))return fail('Refresh the delivery preview before confirming.');
  if(b.on_time!==null&&b.on_time!==undefined&&typeof b.on_time!=='boolean')return fail('Choose on time, late or unknown.');
  const at=Date.now(),occurred=b.occurred_at==null?null:Number(b.occurred_at);
  if(occurred!==null&&(!Number.isSafeInteger(occurred)||occurred<0||occurred>at+300000))return fail('Enter a valid delivery time, or leave it blank if unknown.');
  const normalized={route_id:b.route_id||null,order_id:b.order_id||null,snapshot_hash:b.snapshot_hash,reason,on_time:b.on_time??null,occurred_at:occurred};
  const requestHash=await digest(normalized),auditId='delivery_resolution_'+b.request_id;
  const saved=await env.DB.prepare("SELECT properties FROM activity_log WHERE id=? AND event='delivery.owner_confirmed'").bind(auditId).first();
  if(saved){const p=JSON.parse(saved.properties);return p.request_hash===requestHash?{ok:true,already:true,audit_id:auditId,order_ids:p.order_ids}:fail('This request was already used with different details.',409);}
  const c=await deliveryResolutionContext(env,b);if(!c.ok)return c;
  if(c.snapshot_hash!==b.snapshot_hash)return fail('The delivery changed. Refresh the preview before confirming.',409);
  const conditions=[],binds=[];
  const match=(table,row,fields)=>{conditions.push(`EXISTS(SELECT 1 FROM ${table} WHERE id=? AND ${fields.map(k=>k+' IS ?').join(' AND ')})`);binds.push(row.id,...fields.map(k=>row[k]??null));};
  for(const o of c.orders)match('orders',o,['status','updated_at']);
  for(const s of c.stops)match('route_stops',s,['order_id','status','updated_at']);
  if(c.route){match('routes',c.route,['driver_id','status','offer_status','updated_at']);conditions.push('(SELECT count(*) FROM route_stops WHERE route_id=?)=?');binds.push(c.route.id,c.stops.length);}
  if(b.order_id){conditions.push("NOT EXISTS(SELECT 1 FROM route_stops s JOIN routes r ON r.id=s.route_id WHERE s.order_id=? AND r.status NOT IN ('canceled','completed') AND r.id<>?)");binds.push(b.order_id,c.route?.id||'');}
  const placeholders=c.orders.map(()=>'?').join(',');conditions.push(`(SELECT count(*) FROM deliveries WHERE order_id IN (${placeholders}))=?`);binds.push(...c.orders.map(o=>o.id),c.deliveries.length);
  for(const d of c.deliveries)match('deliveries',d,['status','updated_at']);
  const properties={...normalized,request_hash:requestHash,order_ids:c.orders.map(o=>o.id),order_id:c.orders.length===1?c.orders[0].id:null,route_id:c.route?.id||null,service_dates:[...new Set(c.orders.map(o=>o.delivery_date))],recorded_at:at,previous:c.orders.map(o=>({id:o.id,status:o.status})),previous_route_status:c.route?.status||null,client_notifications_sent:false,money_changed:false,pay_amount_changed:false,payout_sent:false,derived_pay_eligibility_may_change:!!c.route,proof_supplied:false};
  const prepared=(sql,args)=>env.DB.prepare(sql).bind(...args),proof='EXISTS(SELECT 1 FROM activity_log WHERE id=?)';
  const statements=[prepared("INSERT INTO activity_log(id,event,actor_id,actor_role,actor_type,team,properties,created_at) SELECT ?,'delivery.owner_confirmed',?,'owner','human','delivery',?,? WHERE "+conditions.join(' AND '),[auditId,ctx.distinct_id,JSON.stringify(properties),at,...binds])];
  for(const o of c.orders){
    const existing=c.deliveries.find(d=>d.order_id===o.id&&d.status==='completed')||c.deliveries.find(d=>d.order_id===o.id);
    if(!existing)statements.push(prepared(`INSERT INTO deliveries(id,order_id,route_id,driver_id,status,on_time,proof_skipped,completed_at,created_at,updated_at) SELECT ?,?,?,NULL,'completed',?,1,?,?,? WHERE ${proof}`,[id('del'),o.id,c.route?.id||null,b.on_time==null?null:b.on_time?1:0,occurred,at,at,auditId]));
    else if(existing.status!=='completed')statements.push(prepared(`UPDATE deliveries SET status='completed',on_time=COALESCE(?,on_time),completed_at=COALESCE(completed_at,?),updated_at=? WHERE id=? AND ${proof}`,[b.on_time==null?null:b.on_time?1:0,occurred,at,existing.id,auditId]));
    statements.push(prepared(`UPDATE orders SET status='fulfilled',updated_at=? WHERE id=? AND ${proof}`,[at,o.id,auditId]));
    if(c.route)statements.push(prepared(`UPDATE route_stops SET status='done',delivered_at=COALESCE(delivered_at,?),updated_at=? WHERE order_id=? AND route_id=? AND ${proof}`,[occurred,at,o.id,c.route.id,auditId]));
    statements.push(prepared(`UPDATE alerts SET status='acknowledged',acknowledged_by=?,acknowledged_at=?,updated_at=? WHERE status='open' AND ref_type='order' AND ref_id=? AND alert_type='kitchen_ready_delivery' AND ${proof}`,[ctx.distinct_id,at,at,o.id,auditId]));
  }
  if(c.route){const rid=c.route.id;
    statements.push(prepared(`UPDATE routes SET stops_completed=(SELECT count(*) FROM route_stops WHERE route_id=? AND status='done'),stops_failed=(SELECT count(*) FROM route_stops WHERE route_id=? AND status='failed'),status=CASE WHEN NOT EXISTS(SELECT 1 FROM route_stops WHERE route_id=? AND status NOT IN ('done','failed')) THEN 'completed' ELSE status END,offer_status=CASE WHEN NOT EXISTS(SELECT 1 FROM route_stops WHERE route_id=? AND status NOT IN ('done','failed')) THEN 'completed' ELSE offer_status END,completed_at=CASE WHEN NOT EXISTS(SELECT 1 FROM route_stops WHERE route_id=? AND status NOT IN ('done','failed')) THEN COALESCE(completed_at,?) ELSE completed_at END,updated_at=? WHERE id=? AND ${proof}`,[rid,rid,rid,rid,rid,occurred,at,rid,auditId]));
    statements.push(prepared(`UPDATE alerts SET status='acknowledged',acknowledged_by=?,acknowledged_at=?,updated_at=? WHERE status='open' AND ref_type='route' AND ref_id=? AND alert_type='delivery_failed' AND EXISTS(SELECT 1 FROM routes WHERE id=? AND status='completed') AND ${proof}`,[ctx.distinct_id,at,at,rid,rid,auditId]));
  }
  try{const results=await env.DB.batch(statements);if(results[0]?.meta?.changes!==1)return fail('The delivery changed. Refresh the preview before confirming.',409);}
  catch(error){const replay=await env.DB.prepare('SELECT properties FROM activity_log WHERE id=?').bind(auditId).first();if(replay&&JSON.parse(replay.properties).request_hash===requestHash)return {ok:true,already:true,audit_id:auditId,order_ids:properties.order_ids};throw error;}
  return {ok:true,audit_id:auditId,order_ids:properties.order_ids,recorded_at:at,occurred_at:occurred};
}
