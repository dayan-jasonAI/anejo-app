// Exact catalog photos and saved sale quantities. No model generation, client send or payout.
import Card from '../../public/hub/assets/inventory-story-card.js';
import { saleOfferSnapshot, saveSaleOffer } from './inventory_sales.js';
import { id } from './util.js';
export const INVENTORY_STORY_VERSION='stock-story-v1';
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?new TextEncoder().encode(value):value))].map(b=>b.toString(16).padStart(2,'0')).join('');
const rows=async(env,sql,args=[])=>{const r=await env.DB.prepare(sql).bind(...args).all();if(r?.success===false||!Array.isArray(r?.results))throw Error('Inventory sales records are unavailable.');return r.results;};
const event=(env,itemId,postId,hash,action,actor,details,at)=>env.DB.prepare('INSERT INTO inventory_sale_promotion_events(id,menu_item_id,post_id,snapshot_hash,action,actor_id,details_json,created_at)VALUES(?,?,?,?,?,?,?,?)').bind(id('ise'),itemId,postId||null,hash||null,action,actor||null,JSON.stringify(details),at);
export async function inventorySaleSettings(env){return env.DB.prepare('SELECT * FROM inventory_sale_settings WHERE id=1').first();}
export function sellingUnits(offer){
 const packed=/\b(\d+)\s*(?:pieces|piezas|units|unidades)\b/i.test(offer.name||'');
 return packed?{en:'packs',es:'paquetes'}:{en:offer.kind==='bowl'?'bowls':'units',es:offer.kind==='bowl'?'tazones':'unidades'};
}
function descriptor(offer){return {item_id:offer.item_id,name:offer.name,name_es:offer.name_es,image:offer.image,price_cents:offer.price_cents,remaining:offer.remaining,offer_revision:offer.revision,inventory_revision:offer.inventory_revision,counted_at:offer.counted_at,sale_expires_at:offer.sale_expires_at,cta_url:offer.cta_url,kind:offer.kind||null,template:INVENTORY_STORY_VERSION};}
async function currentSource(env,itemId,at=Date.now()){const s=await saleOfferSnapshot(env,at);if(!s.ok)throw Error('Inventory sale availability could not be verified.');const offer=s.offers.find(o=>o.item_id===itemId);return offer?{offer,source:descriptor(offer),hash:await digest(JSON.stringify(descriptor(offer))),read_at:s.read_at}:null;}
export function inventoryPromotionGuard(source,at=Date.now()){
 return {sql:`EXISTS(SELECT 1 FROM inventory_sale_offers o JOIN menu_items m ON m.id=o.menu_item_id WHERE o.menu_item_id=? AND o.revision=? AND o.inventory_revision=? AND o.enabled=1 AND o.sale_expires_at>? AND m.active=1 AND m.availability='available' AND m.inventory_revision=? AND m.name IS ? AND m.name_es IS ? AND m.price_cents=? AND m.kind IS ? AND (CASE WHEN m.image LIKE '/assets/img/%' THEN m.image ELSE '/assets/img/'||m.image END)=? AND o.quantity-COALESCE((SELECT SUM(quantity) FROM inventory_sale_reservations r WHERE r.menu_item_id=o.menu_item_id AND r.offer_revision=o.revision),0)=?)`,args:[source.item_id,source.offer_revision,source.inventory_revision,at,source.inventory_revision,source.name,source.name_es,source.price_cents,source.kind,source.image,source.remaining]};
}
async function asset(env,path){
 if(!/^\/assets\/(?:img|fonts)\/[A-Za-z0-9_./-]+$/.test(path)||path.split('/').includes('..')||!env.ASSETS?.fetch)throw Error('Catalog artwork is unavailable.');
 const response=await env.ASSETS.fetch(new Request('https://anejocateringco.com'+path));
 if(!response.ok||Number(response.headers.get('content-length'))>6*1024*1024)throw Error('Catalog artwork is unavailable.');
 const reader=response.body?.getReader();if(!reader)throw Error('Catalog artwork is unavailable.');let size=0;const chunks=[];
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>6*1024*1024)throw Error('Catalog artwork exceeds the image limit.');chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let off=0;for(const part of chunks){bytes.set(part,off);off+=part.length;}return bytes;
}
function dataUrl(bytes,type){let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return 'data:'+type+';base64,'+btoa(binary);}
const photoType=path=>/\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':'image/jpeg';
function caption(source,locale,readAt){const units=sellingUnits(source),name=locale==='es'?(source.name_es||source.name):source.name;const checked=new Date(readAt).toLocaleString(locale==='es'?'es-US':'en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});return locale==='es'?`${name}: ${source.remaining} ${units.es} disponibles al consultar (${checked} ET). Consulta existencias y elige tu entrega en anejocateringco.com${source.cta_url}.`:`${name}: ${source.remaining} ${units.en} available as of (${checked} ET). Check current stock and choose delivery at anejocateringco.com${source.cta_url}.`;}
export async function reconcileInventoryPromotion(env,{itemId,actorId=null,locale='es',force=false,at=Date.now()}={}){
 if(!['en','es'].includes(locale))throw Error('Choose English or Spanish.');
 const current=await currentSource(env,itemId,at),prior=await env.DB.prepare('SELECT * FROM inventory_sale_promotions WHERE menu_item_id=?').bind(itemId).first();
 if(!current){if(prior){await env.DB.batch([env.DB.prepare("UPDATE inventory_sale_promotions SET state='withdrawn',error='Inventory is no longer available for this promotion.',reviewed_by=NULL,reviewed_at=NULL,updated_at=? WHERE menu_item_id=?").bind(at,itemId),env.DB.prepare("UPDATE social_posts SET status='draft',scheduled_at=NULL,error='Inventory is no longer available for this promotion.',updated_at=? WHERE id=? AND status IN('draft','scheduled','failed')").bind(at,prior.post_id),event(env,itemId,prior.post_id,prior.snapshot_hash,'withdrawn',actorId,{},at)]);}return {ok:true,state:'withdrawn'};}
 const {source,hash,read_at:readAt}=current;
 const previousPost=prior?.post_id?await env.DB.prepare('SELECT status FROM social_posts WHERE id=?').bind(prior.post_id).first():null;
 if(previousPost?.status==='publishing')return {ok:true,state:'publishing',post_id:prior.post_id};
 // A published dated Story is history. Sales deplete the website quantity, not a new Story per sale.
 if(previousPost?.status==='published'&&prior.offer_revision===source.offer_revision)return {ok:true,state:'published',post_id:prior.post_id};
 if(prior&&prior.snapshot_hash===hash&&prior.locale===locale&&prior.svg_key&&!force&&['preview_ready','ready_for_review','reviewed'].includes(prior.state))return {ok:true,...prior};
 const postId=previousPost?.status==='published'?id('sp_inv'):prior?.post_id||id('sp_inv');
 const before=prior?.snapshot_hash||null,guard=inventoryPromotionGuard(source);
 await env.DB.prepare(`INSERT INTO inventory_sale_promotions(menu_item_id,offer_revision,snapshot_hash,snapshot_json,post_id,locale,state,created_at,updated_at)SELECT ?,?,?,?,?,?,'pending',?,? WHERE ${guard.sql} ON CONFLICT(menu_item_id) DO UPDATE SET offer_revision=excluded.offer_revision,snapshot_hash=excluded.snapshot_hash,snapshot_json=excluded.snapshot_json,post_id=excluded.post_id,locale=excluded.locale,state='pending',svg_key=NULL,jpeg_key=NULL,jpeg_sha256=NULL,error=NULL,reviewed_by=NULL,reviewed_at=NULL,updated_at=excluded.updated_at`).bind(itemId,source.offer_revision,hash,JSON.stringify({source}),postId,locale,at,at,...guard.args).run();
 try{
  if(!env.MEDIA?.put)throw Error('Story media storage is unavailable.');
  const [photo,bg,serif,sans]=await Promise.all([asset(env,source.image),asset(env,'/assets/img/marketing/anejo-stock-story-background.png'),asset(env,'/assets/fonts/CormorantGaramond-Regular.ttf'),asset(env,'/assets/fonts/JosefinSans-Regular.ttf')]);
  const photoSha=await digest(photo),unit=sellingUnits(source),checked=new Date(readAt).toLocaleString(locale==='es'?'es-US':'en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const model={locale,quantity:source.remaining,priceCents:source.price_cents,productId:itemId,productName:locale==='es'?(source.name_es||source.name):source.name,unitLabel:unit.en,unitLabelEs:unit.es,ctaUrl:source.cta_url,checkedAt:(locale==='es'?'Disponibilidad consultada: ':'Availability checked: ')+checked+' ET',sourceDataUrl:dataUrl(photo,photoType(source.image)),backgroundDataUrl:dataUrl(bg,'image/png'),fontDataUrl:dataUrl(serif,'font/ttf'),sansFontDataUrl:dataUrl(sans,'font/ttf')};
  const svg=Card.buildSvg(model),svgKey=`studio/inventory/${(await digest(itemId)).slice(0,24)}/${hash.slice(0,24)}-${locale}-${photoSha.slice(0,12)}.svg`;
  await env.MEDIA.put(svgKey,new TextEncoder().encode(svg),{httpMetadata:{contentType:'image/svg+xml'}});
  const fresh=await currentSource(env,itemId);if(!fresh||fresh.hash!==hash)throw Error('Inventory changed while the Story was being prepared. Refresh the preview.');
  const savedAt=Date.now();
  const readyGuard=inventoryPromotionGuard(source);
  const results=await env.DB.batch([
   env.DB.prepare(`UPDATE inventory_sale_promotions SET state='preview_ready',svg_key=?,snapshot_json=?,error=NULL,updated_at=? WHERE menu_item_id=? AND snapshot_hash=? AND locale=? AND state='pending' AND ${readyGuard.sql}`).bind(svgKey,JSON.stringify({source,photo_sha256:photoSha,template:INVENTORY_STORY_VERSION}),savedAt,itemId,hash,locale,...readyGuard.args),
   env.DB.prepare(`INSERT INTO social_posts(id,platform,caption,media_key,media_type,public_token,status,scheduled_at,image_brief,source,created_by,created_at,updated_at,auto_audit_required) SELECT ?,'instagram',?,NULL,'STORIES',?,'draft',NULL,?,'inventory',?,?,?,NULL WHERE changes()=1 ON CONFLICT(id) DO UPDATE SET caption=excluded.caption,media_key=NULL,status='draft',scheduled_at=NULL,audit_status=NULL,audit_at=NULL,error=NULL,updated_at=excluded.updated_at WHERE social_posts.status IN('draft','scheduled','failed')`).bind(postId,caption(source,locale,readAt),crypto.randomUUID().replaceAll('-',''),`Exact catalog photo for ${itemId}; ${source.remaining} saved sale units; ${hash}`,actorId,savedAt,savedAt),
   event(env,itemId,postId,hash,'preview_generated',actorId,{previous_snapshot:before,photo_sha256:photoSha,locale},savedAt)
  ]);
  if(results[0]?.meta?.changes!==1||results[1]?.meta?.changes!==1)throw Error('Inventory changed while the Story was being prepared. Refresh the preview.');
  return {ok:true,state:'preview_ready',post_id:postId,snapshot_hash:hash};
 }catch(error){await env.DB.prepare("UPDATE inventory_sale_promotions SET state='error',error=?,updated_at=? WHERE menu_item_id=? AND snapshot_hash=? AND locale=?").bind(String(error.message||'Story generation failed.').slice(0,300),Date.now(),itemId,hash,locale).run();return {ok:false,state:'error',error:String(error.message||'Story generation failed.')};}
}
export async function applyInventorySaleIntent(env,{body,changeId,actorId,at,locale='es'}={}){
 if(!Object.hasOwn(body||{},'for_sale'))return {ok:true,state:'not_requested'};
 if(typeof body.for_sale!=='boolean')return {ok:false,error:'Choose a valid sale availability.'};
 const row=await env.DB.prepare('SELECT id,stock_count,inventory_revision,last_inventory_change_id FROM menu_items WHERE id=?').bind(body.id).first();
 if(!row||row.last_inventory_change_id!==changeId)return {ok:false,error:'Inventory changed. Refresh before generating its promotion.'};
 const qty=row.stock_count==null?0:Number(row.stock_count),enabled=body.for_sale&&qty>0;
 const sale=await saveSaleOffer(env,{itemId:row.id,quantity:qty,enabled,expectedRevision:body.sale_expected_revision??null,inventoryRevision:row.inventory_revision,changeId,actorId,expiresAt:body.sale_expires_at??null,at});
 if(!sale.ok)return sale;
 return reconcileInventoryPromotion(env,{itemId:row.id,actorId,locale});
}
export async function inventoryPromotionsView(env){const snapshot=await saleOfferSnapshot(env);if(!snapshot.ok)throw Error('Inventory sale availability could not be verified.');return {...snapshot,settings:await inventorySaleSettings(env),declarations:await rows(env,'SELECT menu_item_id,revision,enabled,sale_expires_at FROM inventory_sale_offers'),promotions:await rows(env,'SELECT menu_item_id,offer_revision,snapshot_hash,post_id,locale,state,error,jpeg_sha256,reviewed_by,reviewed_at,updated_at FROM inventory_sale_promotions ORDER BY updated_at DESC')};}
export async function verifyInventoryStoryReview(env,post){if(post?.source!=='inventory')return {ok:true};if(post.media_type!=='STORIES'||post.platform&&post.platform!=='instagram')return {ok:false,error:'Review this media as an Instagram Story before publishing.'};const p=await env.DB.prepare('SELECT * FROM inventory_sale_promotions WHERE post_id=?').bind(post.id).first();if(!p||p.state!=='reviewed'||!p.reviewed_by||!p.jpeg_key||!p.jpeg_sha256)return {ok:false,error:'Review the current inventory Story before publishing.'};const live=await currentSource(env,p.menu_item_id);if(!live||live.hash!==p.snapshot_hash)return {ok:false,error:'Inventory changed. Refresh and review the Story before publishing.'};const old=JSON.parse(p.snapshot_json);const mediaRows=await rows(env,'SELECT media_key FROM social_post_media WHERE post_id=? ORDER BY seq,created_at',[post.id]);if(mediaRows.length!==1||mediaRows[0].media_key!==p.jpeg_key)return {ok:false,error:'The reviewed Story media changed.'};try{if(await digest(await asset(env,live.source.image))!==old.photo_sha256)return {ok:false,error:'The catalog photo changed. Refresh and review the Story.'};const media=await env.MEDIA.get(p.jpeg_key);if(!media||await digest(new Uint8Array(await media.arrayBuffer()))!==p.jpeg_sha256)return {ok:false,error:'The reviewed Story media changed.'};}catch{return {ok:false,error:'Story media could not be verified.'};}return {ok:true};}
export {digest as inventorySaleDigest};
