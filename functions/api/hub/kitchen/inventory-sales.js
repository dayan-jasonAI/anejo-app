import {requireRole} from '../../../_lib/roles.js';
import {json,bad} from '../../../_lib/util.js';
import {inventoryPromotionsView,reconcileInventoryPromotion,verifyInventoryStoryReview,inventorySaleDigest,inventorySaleSettings,inventoryPromotionGuard} from '../../../_lib/inventory_sale_promotions.js';
import {readBoundedJson,jpegDimensions} from '../../../_lib/marketing_render_receipt.js';
const headers={'Cache-Control':'private, no-store'};
export async function onRequestGet({request,env}){
 const ctx=await requireRole(request,env,['owner','kitchen']);if(ctx instanceof Response)return ctx;
 try{
  const u=new URL(request.url),itemId=u.searchParams.get('preview');
  if(itemId){const p=await env.DB.prepare('SELECT svg_key,jpeg_key,snapshot_hash FROM inventory_sale_promotions WHERE menu_item_id=?').bind(itemId).first();const key=u.searchParams.get('jpeg')==='1'?p?.jpeg_key:p?.svg_key;if(!key||p.snapshot_hash!==u.searchParams.get('snapshot'))return bad('Refresh the current Story preview.',409);const media=await env.MEDIA.get(key);if(!media)return bad('Story preview is unavailable.',503);return new Response(media.body,{headers:{...headers,'Content-Type':u.searchParams.get('jpeg')==='1'?'image/jpeg':'image/svg+xml','Content-Security-Policy':"sandbox; default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'",'X-Content-Type-Options':'nosniff'}});}
  return json({ok:true,actor_role:ctx.role,...await inventoryPromotionsView(env)},200,headers);
 }catch{return json({ok:false,error:'Inventory sales are temporarily unavailable.'},503,headers);}
}
export async function onRequestPost({request,env}){
 const ctx=await requireRole(request,env,['owner','kitchen']);if(ctx instanceof Response)return ctx;
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return bad('Open the Hub to update inventory promotions.',403);
 let b;try{b=await readBoundedJson(request);}catch{return bad('Invalid Story request.');}
 const at=Date.now(),itemId=String(b?.item_id||'');
 try{
  if(b.op==='reconcile')return json(await reconcileInventoryPromotion(env,{itemId,actorId:ctx.distinct_id,locale:b.locale||'es',force:!!b.force}),200,headers);
  if(b.op==='website_setting'){
   if(ctx.role!=='owner')return bad('Only the owner can enable website stock alerts.',403);
   if(typeof b.enabled!=='boolean'||b.reviewed!==true)return bad('Review the website availability preview before enabling it.');
   await env.DB.prepare('UPDATE inventory_sale_settings SET website_enabled=?,reviewed_by=?,reviewed_at=?,updated_at=? WHERE id=1').bind(b.enabled?1:0,ctx.distinct_id,at,at).run();return json({ok:true,settings:await inventorySaleSettings(env)},200,headers);
  }
  const p=await env.DB.prepare('SELECT * FROM inventory_sale_promotions WHERE menu_item_id=?').bind(itemId).first();
  if(!p||p.snapshot_hash!==b.snapshot_hash)return bad('Inventory changed. Refresh the Story preview.',409);
  if(b.op==='render'){
   if(p.state!=='preview_ready'&&p.state!=='ready_for_review')return bad('Refresh the current Story preview.',409);
   if(typeof b.data_url!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/.test(b.data_url))return bad('Upload the rendered JPEG Story.');
   const raw=atob(b.data_url.split(',')[1]);if(raw.length>5*1024*1024)return bad('Story image exceeds the upload limit.');const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0)),size=jpegDimensions(bytes);
   if(size?.width!==1080||size?.height!==1920)return bad('Story image must be 1080 × 1920.');
   const sha=await inventorySaleDigest(bytes),key=`studio/inventory/${p.post_id}/${sha}.jpg`;await env.MEDIA.put(key,bytes,{httpMetadata:{contentType:'image/jpeg'}});
   const guard=inventoryPromotionGuard(JSON.parse(p.snapshot_json).source);
   const result=await env.DB.batch([
    env.DB.prepare(`UPDATE inventory_sale_promotions SET jpeg_key=?,jpeg_sha256=?,state='ready_for_review',reviewed_by=NULL,reviewed_at=NULL,updated_at=? WHERE menu_item_id=? AND snapshot_hash=? AND state IN('preview_ready','ready_for_review') AND ${guard.sql}`).bind(key,sha,at,itemId,p.snapshot_hash,...guard.args),
    env.DB.prepare("UPDATE social_posts SET media_key=?,status='draft',scheduled_at=NULL,updated_at=? WHERE id=? AND status IN('draft','scheduled','failed') AND changes()=1").bind(key,at,p.post_id),
    env.DB.prepare(`INSERT INTO social_post_media(id,post_id,seq,media_key,public_token,created_at,origin) SELECT ?,?,0,?,?,?,'catalog_inventory' WHERE changes()=1 ON CONFLICT(id) DO UPDATE SET media_key=excluded.media_key WHERE social_post_media.post_id=excluded.post_id`).bind('sm_inv_'+p.post_id,p.post_id,key,crypto.randomUUID().replaceAll('-',''),at)
   ]);
   if(result[0]?.meta?.changes!==1||result[1]?.meta?.changes!==1)return bad('Inventory changed. Refresh the Story preview.',409);
   return json({ok:true,state:'ready_for_review',jpeg_sha256:sha},200,headers);
  }
  if(b.op==='approve'){
   if(ctx.role!=='owner')return bad('Only the owner can approve an inventory Story.',403);
   if(b.reviewed!==true||p.state!=='ready_for_review'||b.jpeg_sha256!==p.jpeg_sha256)return bad('Review the exact rendered Story before approving.');
   // Validate the same exact receipt the publisher will check, without creating a publication.
   const changed=await env.DB.prepare("UPDATE inventory_sale_promotions SET state='reviewed',reviewed_by=?,reviewed_at=?,updated_at=? WHERE menu_item_id=? AND snapshot_hash=? AND jpeg_sha256=? AND state='ready_for_review'").bind(ctx.distinct_id,at,at,itemId,p.snapshot_hash,p.jpeg_sha256).run();
   if(changed?.meta?.changes!==1)return bad('Inventory changed. Refresh the Story preview.',409);
   const check=await verifyInventoryStoryReview(env,{id:p.post_id,source:'inventory'});
   if(!check.ok){await env.DB.prepare("UPDATE inventory_sale_promotions SET state='ready_for_review',reviewed_by=NULL,reviewed_at=NULL WHERE menu_item_id=? AND snapshot_hash=?").bind(itemId,p.snapshot_hash).run();return bad(check.error,409);}
   await env.DB.prepare('INSERT INTO inventory_sale_promotion_events(id,menu_item_id,post_id,snapshot_hash,action,actor_id,details_json,created_at)VALUES(?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),itemId,p.post_id,p.snapshot_hash,'owner_preview_approved',ctx.distinct_id,JSON.stringify({jpeg_sha256:p.jpeg_sha256,locale:p.locale,publication:false}),at).run();
   return json({ok:true,state:'reviewed',post_id:p.post_id},200,headers);
  }
  return bad('Unknown inventory promotion action.');
 }catch{return json({ok:false,error:'The inventory promotion could not be saved.'},503,headers);}
}
