// Public, current availability only. Costs, staff, raw ingredients and private photos never leave Hub.
import {json} from '../_lib/util.js';
import {saleOfferSnapshot} from '../_lib/inventory_sales.js';
import {inventorySaleSettings,sellingUnits} from '../_lib/inventory_sale_promotions.js';
export async function onRequestGet({env}){
 try{const settings=await inventorySaleSettings(env);if(!settings)return json({ok:false,items:[],error:'Availability is temporarily unavailable.'},503,{'Cache-Control':'no-store'});
  if(!settings.website_enabled)return json({ok:true,enabled:false,read_at:Date.now(),items:[]},200,{'Cache-Control':'no-store'});
  const s=await saleOfferSnapshot(env);if(!s.ok)throw Error('unavailable');return json({ok:true,enabled:true,read_at:s.read_at,items:s.offers.map(o=>({id:o.item_id,name:o.name,name_es:o.name_es,image:o.image,price_cents:o.price_cents,quantity:o.remaining,offer_revision:o.revision,counted_at:o.counted_at,show_until:o.sale_expires_at,unit:sellingUnits(o),cta_url:o.cta_url}))},200,{'Cache-Control':'no-store'});
 }catch{return json({ok:false,items:[],error:'Availability is temporarily unavailable.'},503,{'Cache-Control':'no-store'});}
}
