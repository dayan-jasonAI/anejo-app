import {json,bad} from '../../../_lib/util.js';
import {requireRole,currentStaff} from '../../../_lib/roles.js';
import {id,now,etDateOf,etDayBounds} from '../../../_lib/hub.js';
import {parseProductionRequirements,productionStatus,reconcileInventoryProduction,notifyProduction} from '../../../_lib/inventory_production.js';
import {notifyInventory} from '../../../_lib/inventory_updates.js';
const roles=['owner','kitchen'];
export async function onRequestGet({env,request}){
 const ctx=await requireRole(request,env,roles);if(ctx instanceof Response)return ctx;
 try{return json({ok:true,actor_role:ctx.role,...await productionStatus(env)});}catch{return bad('Production planning unavailable. Your saved counts have not changed.',503);}
}
export async function onRequestPost({env,request}){
 const ctx=await requireRole(request,env,roles);if(ctx instanceof Response)return ctx;
 const actor=await currentStaff(env,request);if(!actor)return bad('Staff session required.',403);
 let b;try{b=await request.json();}catch{return bad('Invalid request.');}
 try{
  if(b.action==='policy'){
   if(ctx.role!=='owner')return bad('Owner review required.',403);
   if(b.reviewed!==true)return bad('Confirm recipe amounts, packaging and target before saving.');
   const requirements=parseProductionRequirements(b.requirements);
   for(const key of ['target_count','min_batch','max_batch','stock_max_age_hours'])if(!Number.isInteger(b[key])||b[key]<1||b[key]>(key==='stock_max_age_hours'?168:9999))return bad('Use positive whole targets, batch limits and a 1–168 hour stock freshness window.');
   if(b.min_batch>b.max_batch||b.max_batch>b.target_count)return bad('Minimum ≤ maximum batch ≤ target.');
   const menu=await env.DB.prepare('SELECT * FROM menu_items WHERE id=?').bind(b.menu_item_id).first(),recipe=await env.DB.prepare("SELECT * FROM recipes WHERE id=? AND status='published'").bind(b.recipe_id).first();
   if(!menu||!recipe)return bad('Select an existing menu item and published recipe.');
   let assignee=null;if(b.assigned_staff_id){assignee=await env.DB.prepare("SELECT id FROM staff WHERE id=? AND role='kitchen' AND active=1").bind(b.assigned_staff_id).first();if(!assignee)return bad('Choose active kitchen staff.');}
   for(const r of requirements){
    const item=await env.DB.prepare('SELECT * FROM inventory_items WHERE id=? AND active=1').bind(r.inventory_id).first();if(!item||(r.basis==='on_hand'&&item.unit!==r.unit))return bad('Requirement must match an active inventory item and its exact unit.');
    const conflict=await env.DB.prepare("SELECT p.menu_item_id FROM inventory_production_policies p,json_each(p.requirements_json) r WHERE p.menu_item_id<>? AND json_extract(r.value,'$.inventory_id')=? AND json_extract(r.value,'$.basis')<>? LIMIT 1").bind(menu.id,r.inventory_id,r.basis).first();
    if(conflict)return bad('Use the same stock basis for this inventory item across production plans.');
   }
   // Changing mappings while a reservation exists would silently change ingredient authority.
   if(await env.DB.prepare("SELECT id FROM inventory_production_tasks WHERE menu_item_id=? AND status IN('queued','preparing')").bind(menu.id).first())return bad('Finish or cancel the open task before changing its production plan.',409);
   const eventId=id('ipe'),at=now(),old=await env.DB.prepare('SELECT * FROM inventory_production_policies WHERE menu_item_id=?').bind(menu.id).first();
   if(old&&b.expected_revision!==old.revision)return bad('Production plan changed. Reload before editing.',409);
   const revision=(old?.revision||0)+1;
   await env.DB.batch([
    env.DB.prepare(`INSERT INTO inventory_production_policies(menu_item_id,recipe_id,recipe_updated_at,requirements_json,target_count,min_batch,max_batch,stock_max_age_hours,assigned_staff_id,enabled,auto_relist,reviewed_by,reviewed_at,last_event_id,revision)
     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(menu_item_id) DO UPDATE SET recipe_id=excluded.recipe_id,recipe_updated_at=excluded.recipe_updated_at,requirements_json=excluded.requirements_json,target_count=excluded.target_count,min_batch=excluded.min_batch,max_batch=excluded.max_batch,stock_max_age_hours=excluded.stock_max_age_hours,assigned_staff_id=excluded.assigned_staff_id,enabled=excluded.enabled,auto_relist=excluded.auto_relist,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,last_event_id=excluded.last_event_id,revision=excluded.revision WHERE inventory_production_policies.revision=?`)
      .bind(menu.id,recipe.id,recipe.updated_at,JSON.stringify(requirements),b.target_count,b.min_batch,b.max_batch,b.stock_max_age_hours,assignee?.id||null,b.enabled===true?1:0,b.auto_relist===true?1:0,actor.id,at,eventId,revision,old?.revision||0),
    env.DB.prepare("INSERT INTO inventory_production_events(id,menu_item_id,actor_id,action,details_json,created_at) SELECT ?,?,?,'policy_reviewed',?,? WHERE EXISTS(SELECT 1 FROM inventory_production_policies WHERE menu_item_id=? AND last_event_id=?)")
      .bind(eventId,menu.id,actor.id,JSON.stringify({requirements,target_count:b.target_count,enabled:b.enabled===true,auto_relist:b.auto_relist===true}),at,menu.id,eventId)
   ]);
   if(!await env.DB.prepare('SELECT id FROM inventory_production_events WHERE id=?').bind(eventId).first())return bad('Production plan changed. Reload.',409);
   const notification=await notifyProduction(env,eventId);return json({ok:true,revision,notification,production:await reconcileInventoryProduction(env,{actorId:actor.id})});
  }
  if(b.action==='queue'){
   if(ctx.role!=='owner')return bad('Owner required.',403);
   if(typeof b.menu_item_id!=='string'||!b.menu_item_id)return bad('Choose a reviewed production plan.');
   const result=await reconcileInventoryProduction(env,{actorId:actor.id,menuItemId:b.menu_item_id,approvedOneOff:true});
   if(!result.created.length)return bad('This batch cannot be queued. Reload the current stock and plan.',409);
   return json(result);
  }
  if(b.action==='reconcile'){
   if(ctx.role!=='owner')return bad('Owner required.',403);
   return json(await reconcileInventoryProduction(env,{actorId:actor.id}));
  }
  if(!['start','complete','cancel'].includes(b.action))return bad('Unknown production action.');
  const task=await env.DB.prepare('SELECT * FROM inventory_production_tasks WHERE id=?').bind(b.id).first();if(!task)return bad('Task not found.',404);
  if(b.expected_version!==task.version)return bad('Task changed. Reload.',409);
  if(task.assigned_staff_id&&task.assigned_staff_id!==actor.id&&ctx.role!=='owner')return bad('This task is assigned to another cook.',403);
  const at=now(),eventId=id('ipe');
  if(b.action==='start'){
   const policy=await env.DB.prepare('SELECT * FROM inventory_production_policies WHERE menu_item_id=?').bind(task.menu_item_id).first();
   if(!policy)return bad('Production plan missing.',409);
   for(const r of parseProductionRequirements(JSON.parse(task.requirements_json))){
    const item=await env.DB.prepare('SELECT * FROM inventory_items WHERE id=? AND active=1').bind(r.inventory_id).first();
    if(!item||item[r.basis]==null||Number(item[r.basis])<r.per_unit*task.qty||!item.counted_at||Number(item.counted_at)>at||at-Number(item.counted_at)>policy.stock_max_age_hours*3600000||(item.expires_on&&item.expires_on<etDateOf(at))||(r.basis==='on_hand'&&item.unit!==r.unit))return bad('Fresh usable counts are required before starting this batch.',409);
   }
  }
  if(b.action==='cancel'||b.action==='start'){
   if(task.status!=='queued')return bad('Only queued tasks can start or cancel. Record actual yield for work already started.',409);
   if(b.action==='cancel'&&ctx.role!=='owner')return bad('Owner required to cancel reserved production.',403);
   const recipe=await env.DB.prepare('SELECT * FROM recipes WHERE id=?').bind(task.recipe_id).first();if(b.action==='start'&&(!recipe||recipe.updated_at!==task.recipe_updated_at||recipe.status!=='published'))return bad('Recipe changed; owner must review a new plan.',409);
   await env.DB.batch([
    env.DB.prepare("UPDATE inventory_production_tasks SET status=?,assigned_staff_id=COALESCE(assigned_staff_id,?),started_by=?,updated_at=?,last_event_id=?,version=version+1 WHERE id=? AND version=? AND status='queued'").bind(b.action==='start'?'preparing':'cancelled',actor.id,b.action==='start'?actor.id:null,at,eventId,task.id,task.version),
    env.DB.prepare('INSERT INTO inventory_production_events(id,task_id,menu_item_id,actor_id,action,details_json,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM inventory_production_tasks WHERE id=? AND last_event_id=?)').bind(eventId,task.id,task.menu_item_id,actor.id,b.action,'{}',at,task.id,eventId)
   ]);
   if(!await env.DB.prepare('SELECT id FROM inventory_production_events WHERE id=?').bind(eventId).first())return bad('Task changed. Reload.',409);
   return json({ok:true,notification:await notifyProduction(env,eventId)});
  }
  if(task.status!=='preparing')return bad('Start the task before recording completion.',409);
  if(!Number.isInteger(b.actual_qty)||b.actual_qty<0||b.actual_qty>task.qty)return bad('Actual yield must be a whole number from zero to the planned count.');
  if(b.actual_qty<task.qty&&(!b.note||!String(b.note).trim()))return bad('Explain any yield shortfall so waste is tracked.');
  const policy=await env.DB.prepare('SELECT * FROM inventory_production_policies WHERE menu_item_id=?').bind(task.menu_item_id).first();
  if(!policy)return bad('Production plan missing.',409);
  const requirements=parseProductionRequirements(JSON.parse(task.requirements_json)),clauses=[],args=[];
  for(const r of requirements){clauses.push(`EXISTS(SELECT 1 FROM inventory_items WHERE id=? AND active=1 AND ${r.basis}>=? AND counted_at>=? AND counted_at<=? AND (expires_on IS NULL OR expires_on>=?)${r.basis==='on_hand'?' AND unit=?':''})`);args.push(r.inventory_id,r.per_unit*task.qty,at-policy.stock_max_age_hours*3600000,at,etDateOf(at));if(r.basis==='on_hand')args.push(r.unit);}
  const event=env.DB.prepare(`INSERT INTO inventory_production_events(id,task_id,menu_item_id,actor_id,action,details_json,created_at) SELECT ?,?,?,?,'completed',?,? WHERE EXISTS(SELECT 1 FROM inventory_production_tasks WHERE id=? AND status='preparing' AND version=?) AND EXISTS(SELECT 1 FROM menu_items WHERE id=? AND stock_count IS NOT NULL AND stock_counted_at>=? AND stock_counted_at<?) AND EXISTS(SELECT 1 FROM recipes WHERE id=? AND status='published' AND updated_at=?) AND ${clauses.join(' AND ')}`)
   .bind(eventId,task.id,task.menu_item_id,actor.id,JSON.stringify({planned_qty:task.qty,actual_qty:b.actual_qty,shortfall:task.qty-b.actual_qty,note:String(b.note||'').slice(0,1000)}),at,task.id,task.version,task.menu_item_id,etDayBounds(etDateOf(at)).start,etDayBounds(etDateOf(at)).end,task.recipe_id,task.recipe_updated_at,...args);
  const statements=[event],changeIds=[];
  for(const r of requirements){
   const item=await env.DB.prepare('SELECT * FROM inventory_items WHERE id=?').bind(r.inventory_id).first();
   const changeId=id('ich');changeIds.push(changeId);
   // Snapshot from the same transaction, not a stale JS read.
   statements.push(env.DB.prepare(`INSERT INTO inventory_changes(id,item_id,action,actor_id,before_json,after_json,created_at,push_status) SELECT ?,?,'batch_consumed',?,json_object('basis',?,'quantity',${r.basis}),json_object('basis',?,'quantity',${r.basis}-?,'task_id',?),?,'pending' FROM inventory_items WHERE id=? AND EXISTS(SELECT 1 FROM inventory_production_events WHERE id=?)`).bind(changeId,r.inventory_id,actor.id,r.basis,r.basis,r.per_unit*task.qty,task.id,at,r.inventory_id,eventId));
   statements.push(env.DB.prepare(`UPDATE inventory_items SET ${r.basis}=${r.basis}-?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM inventory_production_events WHERE id=?)`).bind(r.per_unit*task.qty,actor.id,at,item.id,eventId));
  }
  statements.push(env.DB.prepare("INSERT INTO inventory_changes(id,item_id,action,actor_id,before_json,after_json,created_at,push_status) SELECT ?,?,'batch_finished',?,json_object('stock_count',stock_count,'availability',availability),json_object('additional_finished',?,'task_id',?),?,'pending' FROM menu_items WHERE id=? AND EXISTS(SELECT 1 FROM inventory_production_events WHERE id=?)").bind(eventId,task.menu_item_id,actor.id,b.actual_qty,task.id,at,task.menu_item_id,eventId));
  statements.push(env.DB.prepare("UPDATE menu_items SET stock_count=COALESCE(stock_count,0)+?,availability=CASE WHEN ?=1 AND ?>0 AND active=1 THEN 'available' ELSE availability END,updated_at=?,stock_counted_at=?,inventory_revision=inventory_revision+1,last_inventory_change_id=? WHERE id=? AND EXISTS(SELECT 1 FROM inventory_production_events WHERE id=?)").bind(b.actual_qty,task.auto_relist,b.actual_qty,at,at,eventId,task.menu_item_id,eventId));
  statements.push(env.DB.prepare("UPDATE inventory_production_tasks SET status='completed',actual_qty=?,note=?,completed_by=?,completed_at=?,updated_at=?,version=version+1 WHERE id=? AND EXISTS(SELECT 1 FROM inventory_production_events WHERE id=?)").bind(b.actual_qty,String(b.note||'').slice(0,1000),actor.id,at,at,task.id,eventId));
  await env.DB.batch(statements);
  if(!await env.DB.prepare('SELECT id FROM inventory_production_events WHERE id=?').bind(eventId).first())return bad('Counts changed or ingredients are no longer sufficient. Recount before completing.',409);
  const notifications=[];for(const changeId of [...changeIds,eventId])notifications.push(await notifyInventory(env,changeId));
  return json({ok:true,actual_qty:b.actual_qty,shortfall:task.qty-b.actual_qty,notification:await notifyProduction(env,eventId),inventory_notifications:notifications});
 }catch(error){const validation=/^(Use |Each |Both |Specify )/.test(error.message||'');return bad(validation?error.message:'Production update not verified. Reload the latest status.',validation?400:503);}
}
