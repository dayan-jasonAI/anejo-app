// Paid finished-food movements only. Raw ingredients/packaging stay in approved batch production.
import { reconcileInventoryProduction } from './inventory_production.js';
import { changeInsert, notifyInventory } from './inventory_updates.js';
import { reconcileInventoryPromotion } from './inventory_sale_promotions.js';
import { raiseAlert } from './alerts.js';
import { packMapping, normalizedSaleId } from './inventory_units.js';
const PAID = ['paid','prep','ready','fulfilled'];
const parse = (text, fallback) => { try { return JSON.parse(text); } catch { return fallback; } };
const hash = async text => [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(v=>v.toString(16).padStart(2,'0')).join('');
const lineQuantity = value => (typeof value==='number'||typeof value==='string'&&/^[1-9]\d*$/.test(value.trim())) && Number.isSafeInteger(Number(value)) && Number(value)>0 ? Number(value) : null;
const changes = result => Number(result?.meta?.changes || 0);
async function sourceRecord(env, job) {
  if(job.source_type==='order') {
    const row=await env.DB.prepare('SELECT id,items,status,created_at,inventory_paid_at,inventory_paid_basis FROM orders WHERE id=?').bind(job.source_id).first();
    if(!row||!PAID.includes(row.status)||row.items!==job.snapshot_json)return null;
    return {row,lines:parse(row.items,[]),guard:"EXISTS(SELECT 1 FROM orders WHERE id=? AND items IS ? AND status IN ('paid','prep','ready','fulfilled'))",args:[row.id,row.items]};
  }
  const row=await env.DB.prepare('SELECT id,quote_json,deposit_status,balance_status,balance_cents,created_at FROM catering_quotes WHERE id=?').bind(job.source_id).first();
  if(!row||row.deposit_status!=='paid'||!(row.balance_status==='paid'||row.balance_cents===0)||(row.quote_json||'{}')!==job.snapshot_json)return null;
  return {row,lines:parse(row.quote_json,{}).lines||[],guard:"EXISTS(SELECT 1 FROM catering_quotes WHERE id=? AND COALESCE(quote_json,'{}') IS ? AND deposit_status='paid' AND (balance_status='paid' OR balance_cents=0))",args:[row.id,job.snapshot_json]};
}
async function exception(env,job,key,reason,details,snapshotHash) {
  const at=Date.now();
  await env.DB.prepare('INSERT OR IGNORE INTO inventory_sale_exceptions(source_type,source_id,line_key,snapshot_hash,reason,details_json,created_at)VALUES(?,?,?,?,?,?,?)').bind(job.source_type,job.source_id,key,snapshotHash,reason,JSON.stringify(details),at).run();
  await raiseAlert(env,{alert_type:'low_stock',severity:'warning',onceEver:true,dedupe_key:`inventory_sale_review:${job.source_type}:${job.source_id}:${key}:${snapshotHash}`,title:'Paid-sale inventory review / Revisión de inventario por venta pagada',body:`${reason}. Review the paid sale and its inventory record. / Revisa la venta pagada y su registro de inventario.`,ref_type:job.source_type==='order'?'order':'catering_quote',ref_id:job.source_id,source:'inventory_sale',url:'/hub/kitchen/inventory.html'});
}
export async function processInventoryDeductionJob(env,{sourceType='order',sourceId,actorId='system:paid_inventory'}={}) {
  if(!env?.DB||!['order','quote'].includes(sourceType)||!sourceId)throw Error('Inventory sale source is required.');
  const job=await env.DB.prepare('SELECT * FROM inventory_sale_jobs WHERE source_type=? AND source_id=?').bind(sourceType,sourceId).first();
  if(!job||job.state==='done')return {ok:true,state:job?.state||'not_queued',movements:[]};
  const source=await sourceRecord(env,job);if(!source){await env.DB.prepare("UPDATE inventory_sale_jobs SET state='review',error='Paid source changed; review stock before adjustment',updated_at=? WHERE source_type=? AND source_id=? AND snapshot_json IS ?").bind(Date.now(),sourceType,sourceId,job.snapshot_json).run();return {ok:true,state:'review',movements:[],reviews:1};}
  if(!Array.isArray(source.lines)||!source.lines.length)throw Error('Paid sale lines are unavailable for inventory reconciliation.');
  const snapshotHash=await hash(job.snapshot_json),totals=new Map(),movements=[],touchedStocks=new Set();let reviews=0;
  for(const [index,line] of source.lines.entries()) {
    if(!line||line.id==='meta'||line.meta||line.qty===0||['delivery','fee','tax','discount'].includes(line.type||line.kind))continue;
    let saleId=sourceType==='quote'?(line.pricing_mode==='catalog'?line.product_id:null):line.id;
    if(sourceType==='order')saleId=normalizedSaleId(saleId,line);
    const quantity=lineQuantity(line.qty);
    if(!saleId||quantity==null){reviews++;await exception(env,job,'line_'+index,'Exact catalog item and selling quantity required / Faltan producto y cantidad exactos',{name:line.name||null,qty:line.qty??null},snapshotHash);continue;}
    totals.set(saleId,(totals.get(saleId)||0)+quantity);
  }
  for(const [saleId,total] of totals) {
    const tracked=await env.DB.prepare('SELECT DISTINCT stock_item_id FROM inventory_sale_deductions WHERE source_type=? AND source_id=? AND sale_item_id=?').bind(sourceType,sourceId,saleId).all();
    for(const row of tracked?.results||[])touchedStocks.add(row.stock_item_id);
    let settled=false;
    for(let retry=0;retry<3&&!settled;retry++) {
      const existing=await env.DB.prepare('SELECT COALESCE(SUM(sale_qty),0) AS qty FROM inventory_sale_deductions WHERE source_type=? AND source_id=? AND sale_item_id=?').bind(sourceType,sourceId,saleId).first();
      const qty=total-Number(existing?.qty||0);
      if(qty===0){settled=true;break;}
      if(qty<0){reviews++;await exception(env,job,saleId,'Quantity reduced after a paid sale; no automatic food restock / Cantidad reducida: no reponer comida automáticamente',{sale_id:saleId,total,accounted:existing.qty},snapshotHash);settled=true;break;}
      const sale=await env.DB.prepare('SELECT * FROM menu_items WHERE id=?').bind(saleId).first();
      if(!sale){reviews++;await exception(env,job,saleId,'Catalog item not linked / Producto sin vincular al catálogo',{sale_id:saleId,qty},snapshotHash);settled=true;break;}
      const prior=await env.DB.prepare('SELECT stock_item_id,unit_factor FROM inventory_sale_deductions WHERE source_type=? AND source_id=? AND sale_item_id=? ORDER BY created_at LIMIT 1').bind(sourceType,sourceId,saleId).first();
      let stock=sale,factor=1;
      if(prior){stock=await env.DB.prepare('SELECT * FROM menu_items WHERE id=?').bind(prior.stock_item_id).first();factor=prior.unit_factor;}
      else if(sale.stock_count==null){const mapped=packMapping(saleId);if(mapped){const canonical=await env.DB.prepare('SELECT * FROM menu_items WHERE id=?').bind(mapped.id).first();if(canonical?.stock_count!=null){stock=canonical;factor=mapped.factor;}}}
      if(!stock)throw Error('Saved stock mapping is unavailable.');
      touchedStocks.add(stock.id);
      const requested=qty*factor;if(!Number.isSafeInteger(requested)||requested<1)throw Error('Inventory selling quantity is invalid.');
      const held=await env.DB.prepare('SELECT MIN(reserved_at) AS reserved_at FROM inventory_sale_reservations WHERE order_id=? AND menu_item_id=?').bind(sourceId,stock.id).first();
      const countedAt=Number(stock.stock_counted_at)||0,effectiveAt=Number(job.effective_at)||Number(source.row.created_at),knownTime=['square_capture','owner_paid','quote_paid','owner_confirmed'].includes(job.time_basis);
      const coveredByHold=countedAt>0&&stock.stock_count_basis==='unreserved'&&held?.reserved_at!=null&&Number(held.reserved_at)<=countedAt;
      const covered=countedAt>0&&(knownTime&&effectiveAt<=countedAt||coveredByHold);
      if(!coveredByHold&&!knownTime&&Number(source.row.created_at)<=countedAt){reviews++;await exception(env,job,saleId,'Sale timing needs count reconciliation / Hay que conciliar la venta con el conteo',{sale_id:saleId,counted_at:countedAt,effective_at:effectiveAt,basis:job.time_basis},snapshotHash);settled=true;break;}
      const before=stock.stock_count==null?null:Number(stock.stock_count),deducted=before==null||covered?0:Math.min(before,requested),after=before==null?null:before-deducted;
      const state=before==null?'uncounted':covered?'covered_by_recount':'applied',shortage=before==null||covered?0:requested-deducted,at=Date.now();
      const movementId='ich_sale_'+(await hash([sourceType,sourceId,saleId,snapshotHash].join(':'))).slice(0,48),revision=Number(stock.inventory_revision||0);
      const afterRow={...stock,stock_count:after,inventory_revision:revision+1,last_inventory_change_id:movementId,sale_source_type:sourceType,sale_source_id:sourceId,sale_item_id:saleId,sale_qty:qty,requested_qty:requested,deducted_qty:deducted,shortage_qty:shortage,sale_state:state};
      const audit=changeInsert({itemId:stock.id,action:'paid_sale',actorId,before:stock,after:afterRow,at,changeId:movementId,table:'menu_items',marker:'last_inventory_change_id'});
      const insert=env.DB.prepare(`INSERT OR IGNORE INTO inventory_sale_deductions(id,source_type,source_id,sale_item_id,snapshot_hash,stock_item_id,unit_factor,sale_qty,requested_qty,deducted_qty,shortage_qty,state,effective_at,time_basis,counted_at,before_count,after_count,before_revision,after_revision,actor_id,created_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM menu_items WHERE id=? AND inventory_revision=? AND stock_count IS ?) AND EXISTS(SELECT 1 FROM inventory_sale_jobs WHERE source_type=? AND source_id=? AND snapshot_json IS ?) AND ${source.guard}`)
       .bind(movementId,sourceType,sourceId,saleId,snapshotHash,stock.id,factor,qty,requested,deducted,shortage,state,effectiveAt,job.time_basis,stock.stock_counted_at??null,before,after,revision,revision+1,actorId,at,stock.id,revision,before,sourceType,sourceId,job.snapshot_json,...source.args);
      const results=await env.DB.batch([insert,
       env.DB.prepare('UPDATE menu_items SET stock_count=?,inventory_revision=inventory_revision+1,last_inventory_change_id=?,updated_at=? WHERE id=? AND inventory_revision=? AND changes()=1').bind(after,movementId,at,stock.id,revision),
       // Retain offer quantity and its existing reservation; payment is not a second reservation.
       env.DB.prepare('UPDATE inventory_sale_offers SET inventory_revision=? WHERE menu_item_id=? AND inventory_revision=? AND changes()=1').bind(revision+1,stock.id,revision),
       env.DB.prepare(audit.statement.sql.replace('INSERT INTO inventory_changes','INSERT OR IGNORE INTO inventory_changes')).bind(...audit.statement.args),
       // Old checkouts/manual paid sales did not reserve an offer. Debit the current offer once.
       env.DB.prepare(`INSERT OR IGNORE INTO inventory_sale_reservations(order_id,menu_item_id,offer_revision,quantity,reserved_at) SELECT ?,o.menu_item_id,o.revision,?,? FROM inventory_sale_offers o WHERE o.menu_item_id=? AND o.enabled=1 AND o.counted_at<=? AND o.sale_expires_at>? AND ?='applied' AND EXISTS(SELECT 1 FROM inventory_sale_deductions WHERE id=?) AND NOT EXISTS(SELECT 1 FROM inventory_sale_reservations WHERE order_id=? AND menu_item_id=?)`).bind(sourceType==='order'?sourceId:'quote:'+sourceId,requested,at,stock.id,effectiveAt,at,state,movementId,sourceType==='order'?sourceId:'quote:'+sourceId,stock.id)
      ]);
      if(!changes(results[0])){const receipt=await env.DB.prepare('SELECT id FROM inventory_sale_deductions WHERE id=?').bind(movementId).first();if(receipt){settled=true;break;}continue;}
      if(changes(results[1])!==1||changes(results[3])!==1)throw Error('Paid inventory movement was not confirmed.');
      movements.push({id:movementId,stock_item_id:stock.id,before,after,deducted,requested,state});settled=true;
      if(shortage||state==='uncounted'){reviews++;await exception(env,job,saleId,shortage?'Recorded stock was short / Faltaron existencias registradas':'Sold item has no counted baseline / Producto vendido sin conteo',{stock_item_id:stock.id,qty:requested,shortage,baseline:before},snapshotHash);}
      await notifyInventory(env,movementId);

    }
    if(!settled)throw Error('Inventory changed while applying the paid sale. Retry is required.');
  }
  const outstanding=await env.DB.prepare('SELECT COUNT(*) AS n FROM inventory_sale_exceptions WHERE source_type=? AND source_id=? AND snapshot_hash=? AND resolved_at IS NULL').bind(sourceType,sourceId,snapshotHash).first();
  reviews=Math.max(reviews,Number(outstanding?.n||0));
  const finished=await env.DB.prepare('UPDATE inventory_sale_jobs SET state=?,attempts=attempts+1,error=NULL,updated_at=? WHERE source_type=? AND source_id=? AND snapshot_json IS ?').bind(reviews?'review':'done',Date.now(),sourceType,sourceId,job.snapshot_json).run();
  if(changes(finished)!==1)return {ok:true,state:'pending_retry',movements,reviews};
  for(const stockId of touchedStocks){try{const promo=await env.DB.prepare('SELECT locale FROM inventory_sale_promotions WHERE menu_item_id=?').bind(stockId).first();if(promo)await reconcileInventoryPromotion(env,{itemId:stockId,locale:promo.locale});}catch{/* The durable stock movement is retained; pending/stale promotions fail closed. */}}
  if(movements.length){try{await reconcileInventoryProduction(env,{actorId,changeId:movements[movements.length-1].id});}catch{/* Count stays saved; the existing operations tick can recompute suggestions. */}}
  return {ok:true,state:reviews?'review':'done',movements,reviews};
}
export async function processPaidInventory(env,{limit=20}={}) {
  const jobs=await env.DB.prepare("SELECT source_type,source_id FROM inventory_sale_jobs WHERE state IN ('pending','error') ORDER BY created_at LIMIT ?").bind(Math.max(1,Math.min(50,Math.floor(limit)||20))).all();
  if(jobs?.success===false||!Array.isArray(jobs?.results))throw Error('Paid inventory queue is unavailable.');
  const results=[];for(const job of jobs.results){try{results.push(await processInventoryDeductionJob(env,{sourceType:job.source_type,sourceId:job.source_id}));}catch(error){await env.DB.prepare("UPDATE inventory_sale_jobs SET state='error',attempts=attempts+1,error=?,updated_at=? WHERE source_type=? AND source_id=?").bind(String(error.message).slice(0,300),Date.now(),job.source_type,job.source_id).run();await raiseAlert(env,{alert_type:'low_stock',severity:'critical',onceEver:true,dedupe_key:'inventory_sale_sync_failed:'+job.source_type+':'+job.source_id,title:'Paid-sale stock sync pending / Inventario pendiente de sincronizar',body:'The paid sale is saved; its stock movement needs recovery. / La venta pagada está guardada; falta recuperar su movimiento de inventario.',ref_type:job.source_type==='order'?'order':'catering_quote',ref_id:job.source_id,source:'inventory_sale',url:'/hub/kitchen/inventory.html'});results.push({ok:false,state:'error'});}}
  return {ok:results.every(r=>r.ok),processed:results.length,results};
}
