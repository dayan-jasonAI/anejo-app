import {buildSpine} from './team_lead.js';
export const proposalDigest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
// Raw governing DB values, not just timestamps: price/content edits must fail the CAS even
// when an older writer neglects updated_at. This guards D1 rows only, not external storage.
const sourceRows=(table,columns,where)=>`(SELECT COALESCE(group_concat(item,','),'') FROM (SELECT json_array(${columns}) AS item FROM ${table} WHERE ${where} ORDER BY id))`;
export const PROMOTION_AUTHORITY_CAS=`json_array(${sourceRows('menu_items','id,kind,name,name_es,price_cents,description,description_es,image,sort,active,availability,stock_count,updated_at','1=1')},${sourceRows('docs','id,title,body,active,doc_type,updated_at',"doc_type='brand'")},${sourceRows('training_rules','id,text,active,updated_at','1=1')},${sourceRows('training_examples','id,media_key,note,flag,active,updated_at','1=1')})`;
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function usable(c,name){return c&&hash(c.rendered_sha256)&&['ok','empty'].includes(c.read_status)&&!c.truncated&&!Object.values(typeof c.selection_may_be_limited==='object'?c.selection_may_be_limited:{limited:c.selection_may_be_limited}).some(Boolean)&&Object.values(c.reads||{}).every(v=>['ok','empty'].includes(v))&&(name!=='menu'||(c.source==='d1'&&c.read_status==='ok'));}
export async function currentPromotionAuthority(env){
 const spine=await buildSpine(env),menu=[...spine.menu,...spine.other_items];
 const components={brand:spine.input_components.brand,training:spine.input_components.training,menu:{...spine.coverage.menu,truncated:false,rendered_sha256:await proposalDigest(JSON.stringify(menu))}};
 if(!Object.entries(components).every(([name,c])=>usable(c,name)))return {ok:false,error:'authority_unavailable'};
 const stock=await env.DB.prepare('SELECT id,stock_count FROM menu_items WHERE active=1').all();
 if(stock?.success===false||!Array.isArray(stock?.results))return {ok:false,error:'authority_unavailable'};
 const unavailableStock=new Set(stock.results.filter(x=>x.stock_count!==null&&Number(x.stock_count)<=0).map(x=>x.id));
 return {ok:true,components,available_product_ids:menu.filter(x=>x.available&&!unavailableStock.has(x.id)).map(x=>x.id)};
}
export function priorAuthorityMatches(receipts,current){
 const prior=receipts?.input_context?.components;
 return !!prior&&['brand','training','menu'].every(name=>usable(prior[name],name)&&prior[name].source===current.components[name].source&&prior[name].rendered_sha256===current.components[name].rendered_sha256);
}
