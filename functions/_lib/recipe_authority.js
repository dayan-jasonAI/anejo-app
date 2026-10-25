// Owner-approved recipe versions, exact catalog links and source evidence. Never infer approval
// from an old 'published' flag, an AI draft, a matching name or another program's portion size.
import {id} from './util.js';
const parse=(value,fallback)=>{try{return JSON.parse(value)||fallback;}catch{return fallback;}};
const text=(value,max=2000)=>String(value==null?'':value).trim().slice(0,max);
const list=value=>Array.isArray(value)?value:[];
const digest=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');
const numeric=(value)=>Number.isFinite(value)&&value>=0?value:null;
const media=value=>typeof value==='string'&&/^\/(?:api\/hub\/media\/(?:kitchen|studio|training)\/|assets\/img\/)[A-Za-z0-9_./-]+$/.test(value)&&!value.includes('..')?value:null;
export function normalizeRecipeSpec(input={}){
 const b=input&&typeof input==='object'?input:{};
 return {
  name:text(b.name,180),name_es:text(b.name_es,180),summary:text(b.summary),portion:text(b.portion,500),
  yield_count:numeric(b.yield_count),yield_unit:text(b.yield_unit,40),prep_minutes:numeric(b.prep_minutes),cook_minutes:numeric(b.cook_minutes),
  ingredients:list(b.ingredients).slice(0,120).map(i=>({item:text(typeof i==='string'?i:i?.item,250),quantity:numeric(i?.quantity),unit:text(i?.unit,40),basis:['raw','cooked','as_purchased','count'].includes(i?.basis)?i.basis:'unknown',inventory_id:text(i?.inventory_id,100)||null,qty:text(i?.qty,120)})).filter(i=>i.item),
  steps:list(b.steps).slice(0,80).map(s=>({text:text(typeof s==='string'?s:s?.text,2000),minutes:numeric(s?.minutes),temperature:text(s?.temperature,150)})).filter(s=>s.text),
  equipment:list(b.equipment).slice(0,30).map(x=>text(x,150)).filter(Boolean),
  cook_temperature:text(b.cook_temperature,1000),holding:text(b.holding,1500),cooling_reheating:text(b.cooling_reheating,1500),storage:text(b.storage,1000),shelf_life:text(b.shelf_life,500),allergens:text(b.allergens,1000),packaging:text(b.packaging,1000),
  photos:list(b.photos).slice(0,12).map(media).filter(Boolean),training_media:list(b.training_media).slice(0,12).map(media).filter(Boolean),
  source_reference:text(b.source_reference,2000),unknowns:list(b.unknowns).slice(0,40).map(x=>text(x,300)).filter(Boolean),
  menu_links:list(b.menu_links).slice(0,250).map(x=>({menu_item_id:text(x?.menu_item_id,120),portions_per_sale_unit:numeric(x?.portions_per_sale_unit)})).filter(x=>x.menu_item_id),
 };
}
export function recipeApprovalGaps(spec){
 const s=normalizeRecipeSpec(spec),missing=[];
 for(const key of ['name','portion','yield_unit','cook_temperature','holding','cooling_reheating','storage','shelf_life','allergens','packaging','source_reference'])if(!s[key])missing.push(key);
 if(!(s.yield_count>0))missing.push('yield_count');for(const key of ['prep_minutes','cook_minutes'])if(s[key]===null)missing.push(key);
 if(!s.ingredients.length)missing.push('ingredients');
 s.ingredients.forEach((i,index)=>{if(!(i.quantity>0)||!i.unit||i.basis==='unknown')missing.push('ingredient_'+(index+1)+'_quantity_unit_basis');});
 if(!s.steps.length)missing.push('steps');if(!s.equipment.length)missing.push('equipment');if(!s.photos.length)missing.push('photos');
 if(s.unknowns.length)missing.push('unresolved_unknowns');
 const seen=new Set();for(const link of s.menu_links){if(!(link.portions_per_sale_unit>0)||seen.has(link.menu_item_id))missing.push('catalog_unit_mapping');seen.add(link.menu_item_id);}
 return missing;
}
export function specFromLegacy(recipe){
 return normalizeRecipeSpec({...recipe,ingredients:parse(recipe.ingredients,[]),steps:parse(recipe.steps,[]),photos:recipe.hero_photo?[recipe.hero_photo]:[],unknowns:['Needs Dayan confirmation: legacy publication has no verified owner version receipt.']});
}
export async function latestRecipeRevision(env,recipeId){return env.DB.prepare('SELECT * FROM recipe_revisions WHERE recipe_id=? ORDER BY version DESC LIMIT 1').bind(recipeId).first();}
export async function saveRecipeRevision(env,b,ctx){
 const r=await env.DB.prepare('SELECT * FROM recipes WHERE id=?').bind(b.recipe_id).first();if(!r)throw Error('Recipe not found.');
 const latest=await latestRecipeRevision(env,r.id);
 if((b.expected_revision_id||null)!==(latest?.id||null))throw Error('A newer revision exists. Reload it before saving.');
 const spec=normalizeRecipeSpec(b.spec);if(!spec.name)throw Error('Recipe name is required.');
 const version=(latest?.version||0)+1,revisionId=id('rrv'),at=Date.now(),payload=JSON.stringify(spec),hash=await digest(spec);
 const inserted=await env.DB.prepare(`INSERT INTO recipe_revisions(id,recipe_id,version,based_on_updated_at,payload_json,content_hash,status,created_by,created_at)
 SELECT ?,?,?,?,?,?,'draft',?,? WHERE EXISTS(SELECT 1 FROM recipes WHERE id=? AND updated_at=?) AND NOT EXISTS(SELECT 1 FROM recipe_revisions WHERE recipe_id=? AND version>=?)`).bind(revisionId,r.id,version,r.updated_at,payload,hash,ctx.distinct_id||ctx.email,at,r.id,r.updated_at,r.id,version).run();
 if(inserted.meta?.changes!==1)throw Error('Recipe changed during save. Reload before trying again.');
 return env.DB.prepare('SELECT * FROM recipe_revisions WHERE id=?').bind(revisionId).first();
}
export async function submitRecipeRevision(env,revisionId,ctx){
 const row=await env.DB.prepare('SELECT * FROM recipe_revisions WHERE id=?').bind(revisionId).first();if(!row)throw Error('Revision not found.');
 if(ctx.role!=='owner'&&row.created_by!==ctx.distinct_id)throw Error('Only the author or owner may submit this draft.');
 await env.DB.prepare("UPDATE recipe_revisions SET status='submitted',submitted_at=? WHERE id=? AND status='draft'").bind(Date.now(),row.id).run();
 return env.DB.prepare('SELECT * FROM recipe_revisions WHERE id=?').bind(row.id).first();
}
export async function approveRecipeRevision(env,b,ctx){
 if(ctx.role!=='owner'||b.owner_reviewed!==true||b.source_verified!==true)throw Error('The owner must review this exact recipe and verify its source before approving.');
 const row=await env.DB.prepare('SELECT * FROM recipe_revisions WHERE id=?').bind(b.revision_id).first();
 if(!row||row.status!=='submitted'||row.content_hash!==b.content_hash)throw Error('Open the current submitted version before approving.');
 const latest=await latestRecipeRevision(env,row.recipe_id);if(latest?.id!==row.id)throw Error('A newer version exists. Review that version first.');
 const s=normalizeRecipeSpec(parse(row.payload_json,{})),gaps=recipeApprovalGaps(s);if(gaps.length)throw Error('Needs Dayan confirmation: '+gaps.join(', '));
 for(const link of s.menu_links)if(!await env.DB.prepare('SELECT id FROM menu_items WHERE id=?').bind(link.menu_item_id).first())throw Error('Catalog item no longer exists: '+link.menu_item_id);
 for(const ingredient of s.ingredients)if(ingredient.inventory_id&&!await env.DB.prepare('SELECT id FROM inventory_items WHERE id=? AND active=1').bind(ingredient.inventory_id).first())throw Error('Linked inventory item is missing or inactive.');
 const at=Date.now(),actor=ctx.distinct_id||ctx.email,docId='doc_authority_'+row.recipe_id;
 const guard="EXISTS(SELECT 1 FROM recipe_revisions v JOIN recipes r ON r.id=v.recipe_id WHERE v.id=? AND v.status='submitted' AND v.content_hash=? AND r.updated_at=v.based_on_updated_at AND NOT EXISTS(SELECT 1 FROM recipe_revisions newer WHERE newer.recipe_id=v.recipe_id AND newer.version>v.version))";
 const args=[row.id,row.content_hash];
 const approved="EXISTS(SELECT 1 FROM recipe_revisions v WHERE v.id=? AND v.status='approved' AND v.approved_at=? AND v.approved_by=?)";
 const receipt=[row.id,at,actor];
 const commands=[
  env.DB.prepare(`UPDATE recipe_revisions SET status='approved',approved_by=?,approved_at=? WHERE id=? AND ${guard}`).bind(actor,at,row.id,...args),
  env.DB.prepare(`UPDATE recipes SET name=?,name_es=?,summary=?,ingredients=?,steps=?,portion=?,cook_minutes=?,hero_photo=?,status='published',published_at=?,updated_at=? WHERE id=? AND ${approved}`).bind(s.name,s.name_es||null,s.summary||null,JSON.stringify(s.ingredients.map(i=>({item:i.item,qty:i.quantity+' '+i.unit,basis:i.basis,inventory_id:i.inventory_id}))),JSON.stringify(s.steps.map(step=>step.text)),s.portion,s.cook_minutes,s.photos[0],at,at,row.recipe_id,...receipt),
  env.DB.prepare(`INSERT INTO recipe_authority(recipe_id,version_id,recipe_updated_at,approved_by,approved_at) SELECT ?,?,?,?,? WHERE ${approved} ON CONFLICT(recipe_id) DO UPDATE SET version_id=excluded.version_id,recipe_updated_at=excluded.recipe_updated_at,approved_by=excluded.approved_by,approved_at=excluded.approved_at`).bind(row.recipe_id,row.id,at,actor,at,...receipt),
  env.DB.prepare(`INSERT INTO docs(id,doc_type,title,body,recipe_id,role_scope,version,active,created_by,created_at,updated_at) SELECT ?,'recipe',?,?,?,'["kitchen","owner"]',?,1,?,?,? WHERE ${approved} ON CONFLICT(id) DO UPDATE SET title=excluded.title,body=excluded.body,version=excluded.version,active=1,updated_at=excluded.updated_at`).bind(docId,s.name,'Owner-approved recipe version '+row.version+'. '+(s.summary||''),row.recipe_id,row.version,actor,at,at,...receipt),
  ...s.menu_links.map(link=>env.DB.prepare(`INSERT INTO menu_recipe_authority(menu_item_id,recipe_id,version_id,portions_per_sale_unit,approved_by,approved_at) SELECT ?,?,?,?,?,? WHERE ${approved} ON CONFLICT(menu_item_id) DO UPDATE SET recipe_id=excluded.recipe_id,version_id=excluded.version_id,portions_per_sale_unit=excluded.portions_per_sale_unit,approved_by=excluded.approved_by,approved_at=excluded.approved_at`).bind(link.menu_item_id,row.recipe_id,row.id,link.portions_per_sale_unit,actor,at,...receipt)),
 ];
 const result=await env.DB.batch(commands);if(result[0]?.meta?.changes!==1)throw Error('Recipe changed during approval. Nothing was approved.');
 return {recipe_id:row.recipe_id,version_id:row.id,version:row.version,approved_by:actor,approved_at:at};
}
export async function getApprovedRecipeAuthority(env,{menuItemId,recipeId}={}){
 const row=menuItemId?await env.DB.prepare(`SELECT a.*,v.version,v.payload_json,v.content_hash,m.portions_per_sale_unit FROM menu_recipe_authority m JOIN recipe_authority a ON a.recipe_id=m.recipe_id AND a.version_id=m.version_id JOIN recipe_revisions v ON v.id=a.version_id JOIN recipes r ON r.id=a.recipe_id WHERE m.menu_item_id=? AND v.status='approved' AND v.approved_by IS NOT NULL AND r.updated_at=a.recipe_updated_at AND r.status='published'`).bind(menuItemId).first():recipeId?await env.DB.prepare(`SELECT a.*,v.version,v.payload_json,v.content_hash FROM recipe_authority a JOIN recipe_revisions v ON v.id=a.version_id JOIN recipes r ON r.id=a.recipe_id WHERE a.recipe_id=? AND v.status='approved' AND v.approved_by IS NOT NULL AND r.updated_at=a.recipe_updated_at AND r.status='published'`).bind(recipeId).first():null;
 if(!row)return null;const spec=normalizeRecipeSpec(parse(row.payload_json,{}));if(recipeApprovalGaps(spec).length||await digest(spec)!==row.content_hash)return null;
 return {recipe_id:row.recipe_id,version_id:row.version_id,version:row.version,approved_by:row.approved_by,approved_at:row.approved_at,recipe_updated_at:row.recipe_updated_at,portions_per_sale_unit:row.portions_per_sale_unit??null,recipe:spec,...spec};
}
export async function getApprovedRecipeAuthorities(env,menuIds){const map={};for(const menuItemId of [...new Set(menuIds)])map[menuItemId]=await getApprovedRecipeAuthority(env,{menuItemId});return map;}
