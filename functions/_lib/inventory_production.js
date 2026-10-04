// Deterministic reviewed requirements only. Photos do not establish recipe quantities,
// usable stock or food safety. Reservations are planning records, not finished food.
import { id, now, etDateOf } from './hub.js';
import { sendPushTickle } from './push.js';

const bases = ['on_hand','count_quantity','total_weight_grams'];
export function parseProductionRequirements(value) {
 if(!Array.isArray(value)||value.length<2||value.length>40)throw Error('Use 2–40 explicit ingredient and packaging requirements.');
 const seen=new Set();
 const result=value.map(r=>{
  if(!r||typeof r.inventory_id!=='string'||!r.inventory_id||seen.has(r.inventory_id)||!bases.includes(r.basis)||!['ingredient','packaging'].includes(r.kind)||!Number.isFinite(r.per_unit)||r.per_unit<=0||r.per_unit>1000000)throw Error('Each requirement needs a unique inventory item, stock basis and positive amount per finished unit.');
  if(r.basis==='on_hand'&&(typeof r.unit!=='string'||!r.unit.trim()))throw Error('Specify the exact inventory unit for on-hand requirements.');
  seen.add(r.inventory_id);return {inventory_id:r.inventory_id,basis:r.basis,kind:r.kind,per_unit:r.per_unit,unit:r.basis==='on_hand'?r.unit.trim():null};
 });
 if(!result.some(r=>r.kind==='ingredient')||!result.some(r=>r.kind==='packaging'))throw Error('Both ingredients and packaging are required.');
 return result;
}
export function pendingCutoff(env,at=now()){const raw=Math.floor(Number(env.ONDEMAND_PENDING_HOLD_MIN));return at-(Number.isFinite(raw)&&raw>=0?raw:30)*60000;}
export const committedSQL = `COALESCE((SELECT SUM(CAST(json_extract(j.value,'$.qty') AS REAL)) FROM orders o,json_each(CASE WHEN json_valid(o.items) THEN o.items ELSE '[]' END) j WHERE o.fulfillment_mode='on_demand' AND o.delivery_date=? AND o.status!='canceled' AND (o.status!='pending' OR o.created_at>=?) AND json_extract(j.value,'$.id')=m.id),0)`;
async function all(env,sql,...args){const r=await env.DB.prepare(sql).bind(...args).all();if(!r||r.success===false||!Array.isArray(r.results))throw Error('production_read_unavailable');return r.results;}
export async function productionStatus(env){
 const at=now(),today=etDateOf(at);
 const [policies,items,menu,recipes,staff,tasks]=await Promise.all([
  all(env,'SELECT * FROM inventory_production_policies ORDER BY menu_item_id'),
  all(env,'SELECT * FROM inventory_items WHERE active=1'),all(env,`SELECT m.id,m.name,m.availability,m.active,m.stock_count,m.stock_counted_at,${committedSQL} AS committed FROM menu_items m ORDER BY m.name`,today,pendingCutoff(env,at)),
  all(env,'SELECT id,name,status,updated_at FROM recipes ORDER BY name'),all(env,"SELECT id,name FROM staff WHERE active=1 AND role='kitchen' ORDER BY name"),
  all(env,"SELECT * FROM inventory_production_tasks WHERE status IN('queued','preparing') ORDER BY created_at")
 ]);
 const reserved=new Map();
 for(const task of tasks)for(const r of parseProductionRequirements(JSON.parse(task.requirements_json))){const key=r.inventory_id+':'+r.basis;reserved.set(key,(reserved.get(key)||0)+r.per_unit*task.qty);}
 const opportunities=[];
 for(const policy of policies){
  const product=menu.find(m=>m.id===policy.menu_item_id),reasons=[];let capacity=Infinity;
  const requirements=parseProductionRequirements(JSON.parse(policy.requirements_json));
  if(!product)reasons.push('Menu item missing.');
  if(!recipes.some(r=>r.id===policy.recipe_id&&r.status==='published'&&r.updated_at===policy.recipe_updated_at))reasons.push('Recipe is not published and reviewed.');
  if(tasks.some(t=>t.menu_item_id===policy.menu_item_id))reasons.push('An open prep task already reserves this item.');
  const stock=[];
  for(const r of requirements){
   const item=items.find(i=>i.id===r.inventory_id),used=reserved.get(r.inventory_id+':'+r.basis)||0;
   if(!item){reasons.push('Inventory item missing or archived: '+r.inventory_id);capacity=0;continue;}
   if(item[r.basis]==null||!Number.isFinite(Number(item[r.basis]))){reasons.push('Count or weight missing: '+item.name);capacity=0;continue;}
   if(r.basis==='on_hand'&&item.unit!==r.unit){reasons.push('Unit differs from reviewed requirement: '+item.name);capacity=0;}
   if(!item.counted_at||at-Number(item.counted_at)>policy.stock_max_age_hours*3600000||Number(item.counted_at)>at){reasons.push('Fresh count needed: '+item.name);capacity=0;}
   if(item.expires_on&&item.expires_on<today){reasons.push('Past recorded expiry: '+item.name);capacity=0;}
   const available=Math.max(0,Number(item[r.basis])-used);capacity=Math.min(capacity,Math.floor((available+1e-9)/r.per_unit));
   stock.push({id:item.id,revision:item.revision,basis:r.basis,available,counted_at:item.counted_at,expires_on:item.expires_on});
  }
  // NULL is an unknown finished count, never zero or an unlimited prep target.
  if(!product||product.stock_count==null)reasons.push('Set the current finished-item count first.');
  else if(!product.stock_counted_at||etDateOf(product.stock_counted_at)!==today)reasons.push('Recount finished portions today before planning production.');
  const deficit=product&&product.stock_count!=null?Math.max(0,policy.target_count-Math.max(0,Number(product.stock_count)-Number(product.committed))):0;
  const qty=Math.max(0,Math.min(Number.isFinite(capacity)?capacity:0,deficit,policy.max_batch));
  if(qty<policy.min_batch&&!reasons.length)reasons.push(deficit===0?'Stock target already met.':'Insufficient ingredients or packaging for minimum batch.');
  if(product&&!product.active)reasons.push('Menu item is unlisted; owner must review listing before production.');
  opportunities.push({menu_item_id:policy.menu_item_id,name:product?.name||policy.menu_item_id,recipe_id:policy.recipe_id,qty,eligible:reasons.length===0,enabled:!!policy.enabled,reasons,policy,requirements,stock});
 }
 const recent_tasks=await all(env,"SELECT * FROM inventory_production_tasks WHERE status IN('completed','cancelled') ORDER BY updated_at DESC LIMIT 20");
 return {policies,opportunities,tasks,recent_tasks,menu,recipes,staff};
}
export async function notifyProduction(env,eventId){
 let result;try{result=await sendPushTickle(env,{roles:['owner','kitchen'],notification:{type:'inventory_updated',id:eventId,url:'/hub/kitchen/inventory.html'}});}catch{result={failed:1};}
 const status=result.noop?'noop':result.failed?'failed':result.sent?'sent':'no_subscriptions';
 try{await env.DB.prepare('UPDATE inventory_production_events SET push_status=? WHERE id=?').bind(status,eventId).run();}catch{return {status:'record_failed',delivered:false};}return {status,sent:result.sent||0,delivered:false};
}
export async function reconcileInventoryProduction(env,{actorId='system',menuItemId=null,approvedOneOff=false}={}){
 const status=await productionStatus(env),created=[];
 for(const first of status.opportunities){
  if(menuItemId&&first.menu_item_id!==menuItemId)continue;
  const opportunity=(await productionStatus(env)).opportunities.find(o=>o.menu_item_id===first.menu_item_id);
  if(!opportunity||!opportunity.eligible||(!opportunity.enabled&&!approvedOneOff))continue;
  const p=opportunity.policy,taskId=id('ipt'),eventId=id('ipe'),at=now();
  // One SQL admission checks every current stock row, count date, unit, revision
  // and all existing reservations at mutation time. D1 batch is transactional.
  const checks=opportunity.stock.map(s=>`EXISTS(SELECT 1 FROM inventory_items i WHERE i.id=? AND i.active=1 AND i.revision=? AND i.counted_at=? AND COALESCE(i.expires_on,'')=? AND i.${s.basis} - COALESCE((SELECT SUM(t.qty*json_extract(r.value,'$.per_unit')) FROM inventory_production_tasks t,json_each(t.requirements_json) r WHERE t.status IN('queued','preparing') AND json_extract(r.value,'$.inventory_id')=i.id AND json_extract(r.value,'$.basis')=?),0)>=?)`).join(' AND ');
  const binds=[];for(const s of opportunity.stock){const r=opportunity.requirements.find(r=>r.inventory_id===s.id);binds.push(s.id,s.revision,s.counted_at,s.expires_on||'',s.basis,r.per_unit*opportunity.qty);}
  const inserted=env.DB.prepare(`INSERT INTO inventory_production_tasks(id,menu_item_id,recipe_id,policy_revision,recipe_updated_at,qty,requirements_json,stock_snapshot_json,status,assigned_staff_id,created_by,created_at,updated_at,auto_relist)
   SELECT ?,?,?,?,?,?,?,?,'queued',?,?,?,?,? WHERE ${checks} AND EXISTS(SELECT 1 FROM inventory_production_policies WHERE menu_item_id=? AND revision=? AND (enabled=1 OR ?=1)) AND EXISTS(SELECT 1 FROM recipes WHERE id=? AND status='published' AND updated_at=?) AND EXISTS(SELECT 1 FROM menu_items m WHERE id=? AND active=1 AND stock_count IS NOT NULL AND stock_counted_at=? AND MAX(0,stock_count-${committedSQL})+?<=?) AND NOT EXISTS(SELECT 1 FROM inventory_production_tasks WHERE menu_item_id=? AND status IN('queued','preparing'))`)
   .bind(taskId,p.menu_item_id,p.recipe_id,p.revision,p.recipe_updated_at,opportunity.qty,JSON.stringify(opportunity.requirements),JSON.stringify(opportunity.stock),p.assigned_staff_id,actorId,at,at,p.auto_relist,...binds,p.menu_item_id,p.revision,approvedOneOff?1:0,p.recipe_id,p.recipe_updated_at,p.menu_item_id,status.menu.find(m=>m.id===p.menu_item_id).stock_counted_at,etDateOf(at),pendingCutoff(env,at),opportunity.qty,p.target_count,p.menu_item_id);
  const event=env.DB.prepare("INSERT INTO inventory_production_events(id,task_id,menu_item_id,actor_id,action,details_json,created_at) SELECT ?,?,?,?,'queued',?,? WHERE EXISTS(SELECT 1 FROM inventory_production_tasks WHERE id=?)").bind(eventId,taskId,p.menu_item_id,actorId,JSON.stringify({qty:opportunity.qty,recipe_id:p.recipe_id}),at,taskId);
  const result=await env.DB.batch([inserted,event]);if(result[0]?.meta?.changes){created.push({id:taskId,qty:opportunity.qty,notification:await notifyProduction(env,eventId)});}
 }
 return {ok:true,created};
}
