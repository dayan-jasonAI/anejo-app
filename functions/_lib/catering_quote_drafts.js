// Internal durable working copies only: no provider or messaging imports.
import {normalizeQuoteLines,MAX_TOTAL_CENTS} from './catering_quote_lines.js';
import {quoteLineTotals} from './catering_quote_totals.js';
import {isoDate} from './daily_lunch.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fail=(error,status=409)=>({ok:false,error,http_status:status});
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const parse=v=>{try{return JSON.parse(v||'{}');}catch{return {};}};
const moneyKeys=new Set(['total_cents','delivery_fee_cents','cents','original_cents','catalog_unit_cents','unit_cents']);
const limits={quote_id:100,lead_id:100,customer_name:120,customer_email:160,customer_phone:40,event_date:10,note:2000,lang:2,name:120,name_es:120,detail:160,detail_es:160,product_id:100,sku:100,image:500,override_reason:500,pricing_mode:20};
function field(key,value){
 if(value===null)return null;
 if(moneyKeys.has(key)){if(!Number.isSafeInteger(value)||value<0||value>MAX_TOTAL_CENTS)throw Error(key+' must be whole nonnegative cents or null.');return value;}
 if(key==='guests'||key==='expected_updated_at'){if(value===''&&key==='guests')return '';if(!Number.isSafeInteger(value)||value<0||value>(key==='guests'?10000:Number.MAX_SAFE_INTEGER))throw Error('Invalid '+key+'.');return value;}
 if(key==='owner_override'){if(typeof value!=='boolean')throw Error('Invalid owner override.');return value;}
 if(key==='qty'){if(!['string','number'].includes(typeof value)||String(value).length>12||typeof value==='number'&&!Number.isFinite(value))throw Error('Invalid line quantity.');return value;}
 if(typeof value!=='string'||value.length>limits[key])throw Error('Invalid or overlong '+key+'.');
 if(key==='event_date'&&value!==''&&!isoDate(value))throw Error('Enter a valid calendar date.');
 if(key==='pricing_mode'&&!['catalog','custom','quoted',''].includes(value))throw Error('Invalid pricing mode.');
 if(key==='lang'&&!['','en','es'].includes(value))throw Error('Invalid quote language.');
 if(key==='image'&&value&&!/^(?:\/assets\/img\/)?[a-zA-Z0-9_./%-]+\.(?:jpg|jpeg|png|webp|avif)$/.test(value))throw Error('Use a local catalog image.');
 if(key==='image'&&value.includes('..'))throw Error('Use a safe catalog image path.');
 return value;
}
function pick(raw,keys){const out={};for(const key of keys)if(raw[key]!==undefined)out[key]=field(key,raw[key]);return out;}
export function cleanDraftPayload(raw){
 if(!object(raw))return fail('Draft payload must be an object.',400);
 try{
  const out=pick(raw,['quote_id','expected_updated_at','lead_id','customer_name','customer_email','customer_phone','event_date','guests','note','lang','total_cents','delivery_fee_cents']);
  if(raw.lines!==undefined){if(!Array.isArray(raw.lines)||raw.lines.length>40)throw Error('Use up to 40 draft lines.');out.lines=raw.lines.map(line=>{if(!object(line))throw Error('Invalid draft line.');return pick(line,['name','name_es','qty','cents','detail','detail_es','product_id','sku','image','owner_override','override_reason','original_cents','catalog_unit_cents','unit_cents','pricing_mode']);});}
  if(raw.recommendations!==undefined){if(!Array.isArray(raw.recommendations)||raw.recommendations.length>10)throw Error('Use up to 10 optional recommendations.');out.recommendations=raw.recommendations.map(r=>{if(!object(r)||typeof r.sku!=='string'||r.sku.length>100||!Number.isSafeInteger(r.packs)||r.packs<1||r.packs>100||!Number.isSafeInteger(r.expected_cents)||r.expected_cents<0||r.expected_cents>MAX_TOTAL_CENTS)throw Error('Invalid optional recommendation.');return {sku:r.sku,packs:r.packs,expected_cents:r.expected_cents};});}
  if(JSON.stringify(out).length>60000)throw Error('Draft is too large.');
  return {ok:true,payload:out};
 }catch(error){return fail(error.message,400);}
}
function present(row){if(!row)return null;return {id:row.id,version:row.version,state:row.state,payload:parse(row.payload_json),quote_id:row.quote_id||null,prepared_quote_updated_at:row.prepared_quote_updated_at||null,created_at:row.created_at,updated_at:row.updated_at};}
export async function loadDraft(env,id){if(!uuid.test(String(id||'')))return fail('Use a valid draft UUID.',400);const row=await env.DB.prepare('SELECT * FROM catering_quote_drafts WHERE id=?').bind(id).first();return row?{ok:true,draft:present(row)}:fail('Draft not found.',404);}
export async function listDrafts(env,includeArchived=false){const read=await env.DB.prepare("SELECT * FROM catering_quote_drafts WHERE (?=1 OR state!='archived') ORDER BY updated_at DESC LIMIT 100").bind(includeArchived?1:0).all();return {ok:true,drafts:(read.results||[]).map(row=>{const d=present(row),p=d.payload;delete d.payload;return {...d,summary:{customer_name:p.customer_name||'',customer_email:p.customer_email||'',event_date:p.event_date||'',guests:p.guests??null,line_count:p.lines?.length||0,lead_id:p.lead_id||null}};})};}
const validRequest=body=>uuid.test(String(body?.id||''))&&Number.isSafeInteger(body.expected_version)&&body.expected_version>=0;
export async function saveDraft(env,body,actor){
 if(!validRequest(body))return fail('Provide a draft UUID and expected_version.',400);
 const cleaned=cleanDraftPayload(body.payload);if(!cleaned.ok)return cleaned;const now=Date.now();
 const result=body.expected_version===0?await env.DB.prepare("INSERT OR IGNORE INTO catering_quote_drafts(id,version,state,payload_json,created_by,updated_by,created_at,updated_at) VALUES(?,1,'draft',?,?,?,?,?)").bind(body.id,JSON.stringify(cleaned.payload),actor,actor,now,now).run():await env.DB.prepare("UPDATE catering_quote_drafts SET payload_json=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(JSON.stringify(cleaned.payload),actor,now,body.id,body.expected_version).run();
 if(result.meta?.changes!==1&&body.expected_version===0){const existing=await env.DB.prepare('SELECT * FROM catering_quote_drafts WHERE id=?').bind(body.id).first();if(existing?.version===1&&existing.state==='draft'&&existing.payload_json===JSON.stringify(cleaned.payload))return {ok:true,draft:present(existing),replayed:true};}
 if(result.meta?.changes!==1)return fail('Draft changed, was prepared or archived. Reload it before saving; your current edits were not saved.');
 return loadDraft(env,body.id);
}
export async function archiveDraft(env,body,actor){
 if(!validRequest(body)||body.expected_version===0)return fail('Provide the saved draft version.',400);
 const result=await env.DB.prepare("UPDATE catering_quote_drafts SET state='archived',version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='draft'").bind(actor,Date.now(),body.id,body.expected_version).run();
 return result.meta?.changes===1?loadDraft(env,body.id):fail('Draft changed, was prepared or already archived. Reload before continuing.');
}
const phone=v=>String(v||'').replace(/\D/g,'').replace(/^1(?=\d{10}$)/,'');
function canonicalLines(lines){const normalized=normalizeQuoteLines(lines);if(!normalized.ok)return null;return normalized.lines.map(l=>({name:l.name,name_es:l.name_es||'',qty:String(l.qty),cents:l.cents,product_id:l.product_id||'',detail:l.detail||'',detail_es:l.detail_es||'',image:l.image||''}));}
export function draftMatchesQuote(payload,q){
 const b=parse(q.quote_json),email=v=>String(v||'').trim().toLowerCase();
 if(Number(b.tax_cents||0)!==0||Number(b.discount_cents||0)!==0)return false;
 if(!payload.customer_name?.trim()||!email(payload.customer_email)||!isoDate(payload.event_date)||!Number.isSafeInteger(payload.guests)||payload.guests<1)return false;
 if(payload.customer_name.trim()!==q.customer_name||email(payload.customer_email)!==email(q.customer_email)||phone(payload.customer_phone)!==phone(q.customer_phone)||payload.event_date!==q.event_date||payload.guests!==q.guests)return false;
 if(String(payload.note||'').trim()!==String(q.note||'').trim())return false;
 const recommendations=(payload.recommendations||[]).map(r=>({sku:r.sku,packs:r.packs,cents:r.expected_cents}));
 const quoted=(b.recommendations||[]).map(r=>({sku:r.sku,packs:r.packs,cents:r.cents}));
 if(JSON.stringify(recommendations)!==JSON.stringify(quoted))return false;
 if(payload.lead_id&&payload.lead_id!==(q.source_lead_id||b.lead_id))return false;
 const fee=payload.delivery_fee_cents??null;if(fee!==(b.delivery_fee_cents??null))return false;
 if(payload.lines?.length){const expected=quoteLineTotals(payload.lines,fee);if(!expected.ok||expected.total_cents!==q.total_cents)return false;const stored=canonicalLines(b.lines);return stored!==null&&JSON.stringify(canonicalLines(payload.lines))===JSON.stringify(stored);}
 return Number.isSafeInteger(payload.total_cents)&&payload.total_cents>0&&payload.total_cents===q.total_cents&&!(b.lines?.length);
}
export async function attachDraft(env,body,actor){
 if(!validRequest(body)||body.expected_version===0||typeof body.quote_id!=='string'||body.quote_id.length>100)return fail('Provide a saved draft version and prepared quote ID.',400);
 const row=await env.DB.prepare('SELECT * FROM catering_quote_drafts WHERE id=?').bind(body.id).first();if(!row)return fail('Draft not found.',404);
 if(row.state==='prepared'&&row.quote_id===body.quote_id)return {ok:true,draft:present(row),replayed:true};
 if(row.version!==body.expected_version||row.state!=='draft')return fail('Draft changed, was prepared or archived. Reload before linking.');
 const q=await env.DB.prepare('SELECT * FROM catering_quotes WHERE id=?').bind(body.quote_id).first();
 if(!q||!['unpaid','paid'].includes(q.deposit_status)||!draftMatchesQuote(parse(row.payload_json),q))return fail('The saved quote does not match this draft. Linkage is unverified; nothing was changed.');
 const p=parse(row.payload_json);
 if(p.quote_id){const revision=await env.DB.prepare("SELECT replacement_quote_id,source_updated_at FROM catering_quote_revisions WHERE source_quote_id=? AND state='complete'").bind(p.quote_id).first();if(revision?.replacement_quote_id!==q.id||(p.expected_updated_at!==undefined&&p.expected_updated_at!==revision.source_updated_at))return fail('The completed revision does not match this draft source. Linkage remains unverified.');}
 const pending=await env.DB.prepare("SELECT source_quote_id FROM catering_quote_revisions WHERE source_quote_id=? OR (replacement_quote_id=? AND state!='complete') UNION ALL SELECT source_quote_id FROM catering_quote_duplicate_retirements WHERE (source_quote_id=? OR target_quote_id=?) AND state!='complete'").bind(q.id,q.id,q.id,q.id).first();
 if(pending)return fail('The prepared quote is still being reconciled. Linkage remains unverified.');
 const changed=await env.DB.prepare("UPDATE catering_quote_drafts SET state='prepared',quote_id=?,prepared_quote_updated_at=?,version=version+1,updated_by=?,updated_at=? WHERE id=? AND version=? AND state='draft' AND EXISTS(SELECT 1 FROM catering_quotes WHERE id=? AND updated_at=? AND deposit_status IN ('unpaid','paid')) AND NOT EXISTS(SELECT 1 FROM catering_quote_revisions WHERE source_quote_id=? OR (replacement_quote_id=? AND state!='complete')) AND NOT EXISTS(SELECT 1 FROM catering_quote_duplicate_retirements WHERE (source_quote_id=? OR target_quote_id=?) AND state!='complete')").bind(q.id,q.updated_at,actor,Date.now(),row.id,row.version,q.id,q.updated_at,q.id,q.id,q.id,q.id).run();
 return changed.meta?.changes===1?loadDraft(env,row.id):fail('Draft or quote changed before linking. Reload and verify the saved quote.');
}
export async function recoverDraft(env,body,actor){
 if(!validRequest(body)||body.expected_version===0)return fail('Provide a saved draft and expected version.',400);
 const loaded=await loadDraft(env,body.id);if(!loaded.ok)return loaded;const d=loaded.draft;
 if(d.state==='prepared')return {ok:true,draft:d,replayed:true};
 if(d.state!=='draft'||d.version!==body.expected_version)return fail('Draft changed or was archived. Reload before recovery.');
 let quoteId=null;
 if(d.payload.quote_id){const journal=await env.DB.prepare("SELECT replacement_quote_id FROM catering_quote_revisions WHERE source_quote_id=? AND state='complete'").bind(d.payload.quote_id).first();quoteId=journal?.replacement_quote_id;}
 else {const claims=await env.DB.prepare("SELECT quote_id FROM catering_quote_creations WHERE json_valid(payload_json) AND json_extract(payload_json,'$.quoteBreakdown.draft_id')=?").bind(d.id).all();if(claims.results?.length===1)quoteId=claims.results[0].quote_id;}
 if(!quoteId)return fail('No unique persisted checkout identity is linked to this draft. Linkage is unverified; select the actual saved quote.');
 return attachDraft(env,{...body,quote_id:quoteId},actor);
}
