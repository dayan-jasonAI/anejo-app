// Owner-private proposal storage only. Never invokes an action executor or retries inference.
import {requireRole} from '../../../_lib/roles.js';
import {json} from '../../../_lib/util.js';
import {leadReply,validateCampaignProposal} from '../../../_lib/team_lead.js';
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(v);
const digest=async text=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
const keyFor=async(owner,key)=>'ocp_'+await digest(JSON.stringify([owner,key.toLowerCase()]));
const failure=(error,status=503)=>json({ok:false,error,review_required:true},status);
const safeErrors=new Set(['no_api_key','budget','budget_unavailable','model_error','empty_response','invalid_proposal','input_receipt_unavailable','grounding_unavailable','generation_failed','incomplete_preview_response','invalid_preview_response','invalid_preview_request','invalid_mode']);
function boundedJson(value,max){const text=JSON.stringify(value);if(!text||new TextEncoder().encode(text).length>max)throw Error('result_too_large');return text;}
const diagnosticCodes={shape:['content_array_required','single_content_block_required','text_block_required','text_string_required','text_too_long'],json:['invalid_json'],completion:['end_turn_required'],validation:['object_required','missing_field','unexpected_field','string_required','empty_string','string_too_long','array_required','too_many_items','item_string_required','empty_item','item_too_long','duplicate_item','empty_channels','unsupported_channel','unavailable_product_id']};
function safeDiagnostic(d){
 if(!d||!diagnosticCodes[d.stage]?.includes(d.code))return null;
 const out={stage:d.stage,code:d.code};
 if(['title','objective','audience','angle','cadence','success_metric','channels','product_ids','assets','assumptions','questions'].includes(d.field))out.field=d.field;
 for(const [key,max] of [['index',19],['limit',16000],['actual',1000000]])if(Number.isInteger(d[key])&&d[key]>=0&&d[key]<=max)out[key]=d[key];
 return out;
}
async function promotionStatus(env,row){
 try{
 const p=await env.DB.prepare(`SELECT p.*,b.id AS existing_brief_id,b.status AS brief_status,b.updated_at AS brief_updated_at,b.title,b.objective,b.audience,b.angle,b.channels,b.assets_json,b.cadence,b.success_metric FROM operator_campaign_promotions p LEFT JOIN team_briefs b ON b.id=p.brief_id WHERE p.preview_id=? AND p.owner_id=?`).bind(row.id,row.owner_id).first();
 if(!p)return {promotion_status:'not_recorded',promotion:null};
 const reviewed=JSON.parse(p.proposal_json);
 const matches=!!p.existing_brief_id&&['title','objective','audience','angle','cadence','success_metric'].every(k=>p[k]===reviewed[k])&&p.channels===JSON.stringify(reviewed.channels)&&p.assets_json===JSON.stringify(reviewed.assets);
 return {promotion_status:'recorded',promotion:{promotion_id:p.id,preview_id:p.preview_id,brief_id:p.brief_id,proposal_sha256:p.proposal_sha256,review_scope:p.review_scope,created_at:p.created_at,brief_status:p.brief_status??null,brief_updated_at:p.brief_updated_at??null,brief_matches_reviewed_proposal:matches}};
 }catch{return {promotion_status:'unavailable',promotion:null};}
}
async function projection(env,row){
 const base={id:row.id,request_id:row.request_id,idea_id:row.idea_id,state:row.state,created_at:row.created_at,updated_at:row.updated_at,review_required:true,private:true,generated:row.state==='succeeded'};
 if(row.state==='succeeded')return {...base,generated:!JSON.parse(row.source_receipts_json)?.revision, ...await promotionStatus(env,row),proposal:JSON.parse(row.proposal_json),proposal_sha256:await digest(row.proposal_json),source_receipts:JSON.parse(row.source_receipts_json),model:row.model};
 if(row.state==='failed')return {...base,error:row.error_code,preview_diagnostic:row.source_receipts_json?safeDiagnostic(JSON.parse(row.source_receipts_json).preview_diagnostic):null,source_receipts:row.source_receipts_json?JSON.parse(row.source_receipts_json):null,model:row.model};
 return {...base,outcome_unknown:Date.now()-row.updated_at>10*60*1000,detail:'Generation was claimed. Do not create another request to retry an uncertain provider outcome.'};
}
async function result(env,row){return json({ok:row.state!=='failed',saved:row.state==='succeeded',preview:await projection(env,row)},row.state==='generating'?202:200);}
async function readRow(env,id,owner){return env.DB.prepare('SELECT * FROM operator_campaign_previews WHERE id=? AND owner_id=?').bind(id,owner).first();}
// Injectable generator is a test seam, never a request/body or environment capability.
export async function createCampaignPreview(env,owner,b,generate=leadReply){
 const id=await keyFor(owner,b.request_id);let row;
 try{
 row=await readRow(env,id,owner);
 if(row){if(row.idea_id!==b.idea_id)return failure('request_key_conflict',409);return result(env,row);}
 const idea=await env.DB.prepare('SELECT id,objective FROM operator_brief_ideas WHERE id=? AND created_by=?').bind(b.idea_id,owner).first();
 if(!idea)return failure('idea_not_found',404);
 if(typeof idea.objective!=='string'||!idea.objective.trim()||idea.objective.length>1000)return failure('saved_idea_invalid',409);
 const at=Date.now(),hash=await digest(idea.objective);
 const claim=await env.DB.prepare("INSERT INTO operator_campaign_previews(id,owner_id,request_id,idea_id,topic,topic_sha256,state,created_at,updated_at) VALUES (?,?,?,?,?,?,'generating',?,?) ON CONFLICT(owner_id,request_id) DO NOTHING").bind(id,owner,b.request_id.toLowerCase(),idea.id,idea.objective,hash,at,at).run();
 if(claim.meta?.changes!==1){row=await readRow(env,id,owner);if(!row)return failure('claim_not_verified');if(row.idea_id!==b.idea_id)return failure('request_key_conflict',409);return result(env,row);}
 let generated;try{generated=await generate(env,{message:idea.objective,history:[],mode:'private_campaign_preview'});}catch{generated={ok:false,reason:'generation_failed'};}
 let proposal=null,receipts=null,error=null;
 try{
 receipts=boundedJson({preview_diagnostic:safeDiagnostic(generated.preview_diagnostic),input_context:generated.input_context??null,inference_receipt:generated.inference_receipt??null,inference_attempts:generated.inference_attempts??null},65536);
 if(!generated.ok)error=safeErrors.has(generated.reason)?generated.reason:'generation_failed';
 else if(generated.action!==null||!Array.isArray(generated.actions)||generated.actions.length||generated.review_required!==true||!Array.isArray(generated.input_context?.available_product_ids)||!validateCampaignProposal(generated.proposal,generated.input_context.available_product_ids))error='invalid_proposal';
 else proposal=boundedJson(generated.proposal,32768);
 }catch{error='invalid_proposal';proposal=null;receipts=null;}
 const state=error?'failed':'succeeded';
 const update=await env.DB.prepare("UPDATE operator_campaign_previews SET state=?,proposal_json=?,source_receipts_json=?,model=?,error_code=?,updated_at=? WHERE id=? AND owner_id=? AND state='generating'").bind(state,proposal,receipts,typeof generated.model==='string'?generated.model.slice(0,100):null,error,Date.now(),id,owner).run();
 if(update.meta?.changes!==1)return failure('generation_save_not_verified');
 row=await readRow(env,id,owner);if(!row)return failure('generation_save_not_verified');return result(env,row);
 }catch{return failure('generation_state_unavailable');}
}
async function ownerContext(request,env){const owner=await requireRole(request,env,['owner']);return owner instanceof Response?owner:owner.distinct_id?owner:failure('owner_identity_unavailable',403);}
export async function onRequestPost({request,env}){
 const owner=await ownerContext(request,env);if(owner instanceof Response)return owner;
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return failure('json_required',415);
 let body;try{const reader=request.body?.getReader();if(!reader)throw Error();let text='',size=0;const decoder=new TextDecoder();while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>4096){await reader.cancel();return failure('request_too_large',413);}text+=decoder.decode(value,{stream:true});}body=JSON.parse(text+decoder.decode());}catch{return failure('invalid_json',400);}
 if(!body||Array.isArray(body)||Object.keys(body).length!==2||!uuid(body.request_id)||typeof body.idea_id!=='string'||!/^obi_[a-f0-9]{64}$/.test(body.idea_id))return failure('invalid_preview_request',400);
 return createCampaignPreview(env,owner.distinct_id,body);
}
export async function onRequestGet({request,env}){
 const owner=await ownerContext(request,env);if(owner instanceof Response)return owner;
 const q=new URL(request.url).searchParams;
 if([...q.keys()].some(k=>!['id','request_id','idea_id'].includes(k))||[...q.keys()].length>1)return failure('invalid_query',400);
 try{
 if(q.has('id')||q.has('request_id')){
  if(q.has('request_id')&&!uuid(q.get('request_id')))return failure('invalid_query',400);
  const id=q.has('id')?q.get('id'):await keyFor(owner.distinct_id,q.get('request_id'));
  if(!/^ocp_[a-f0-9]{64}$/.test(id))return failure('invalid_query',400);
  const row=await readRow(env,id,owner.distinct_id);return row?result(env,row):failure('preview_not_found',404);
 }
 if(q.has('idea_id')&&!/^obi_[a-f0-9]{64}$/.test(q.get('idea_id')))return failure('invalid_query',400);
 const rows=await env.DB.prepare('SELECT * FROM operator_campaign_previews WHERE owner_id=?'+(q.has('idea_id')?' AND idea_id=?':'')+' ORDER BY created_at DESC,id DESC LIMIT 20').bind(...(q.has('idea_id')?[owner.distinct_id,q.get('idea_id')]:[owner.distinct_id])).all();
 if(rows?.success===false||!Array.isArray(rows?.results))throw Error();
 return json({ok:true,limit:20,review_required:true,previews:await Promise.all(rows.results.map(row=>projection(env,row)))});
 }catch{return failure('preview_read_unavailable');}
}

// A private edit creates a new immutable proposal. It never changes the parent,
// refreshes authority receipts, calls a model, or activates team planning.
export async function onRequestPatch({request,env}){
 const owner=await ownerContext(request,env);if(owner instanceof Response)return owner;
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return failure('json_required',415);
 let b;
 try{
  const reader=request.body?.getReader();if(!reader)throw Error();let text='',size=0;const decoder=new TextDecoder();
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>40000){await reader.cancel();return failure('request_too_large',413);}text+=decoder.decode(value,{stream:true});}
  b=JSON.parse(text+decoder.decode());
 }catch{return failure('invalid_json',400);}
 const fields=['request_id','preview_id','expected_proposal_sha256','proposal'];
 if(!b||Array.isArray(b)||Object.keys(b).length!==fields.length||!fields.every(k=>Object.hasOwn(b,k))||!uuid(b.request_id)||typeof b.preview_id!=='string'||!/^ocp_[a-f0-9]{64}$/.test(b.preview_id)||typeof b.expected_proposal_sha256!=='string'||!/^[a-f0-9]{64}$/.test(b.expected_proposal_sha256))return failure('invalid_revision_request',400);
 try{
  const parent=await readRow(env,b.preview_id,owner.distinct_id);
  if(!parent||parent.state!=='succeeded')return failure('preview_not_found',404);
  if(await digest(parent.proposal_json)!==b.expected_proposal_sha256)return failure('proposal_changed',409);
  const originalReceipts=JSON.parse(parent.source_receipts_json);
  const ids=originalReceipts?.input_context?.available_product_ids;
  if(!Array.isArray(ids)||!validateCampaignProposal(b.proposal,ids))return failure('invalid_proposal',400);
  const proposal=boundedJson(b.proposal,32768),proposalHash=await digest(proposal);
  const id=await keyFor(owner.distinct_id,b.request_id);
  const matches=row=>row&&row.proposal_json===proposal&&JSON.parse(row.source_receipts_json)?.revision?.parent_id===parent.id&&JSON.parse(row.source_receipts_json)?.revision?.parent_proposal_sha256===b.expected_proposal_sha256;
  let prior=await readRow(env,id,owner.distinct_id);
  if(prior)return matches(prior)?result(env,prior):failure('request_key_conflict',409);
  const at=Date.now();
  const receipts=boundedJson({...originalReceipts,revision:{parent_id:parent.id,parent_proposal_sha256:b.expected_proposal_sha256,proposal_sha256:proposalHash,actor_id:owner.distinct_id,created_at:at,kind:'private_edit',approval:false}},65536);
  await env.DB.prepare("INSERT INTO operator_campaign_previews(id,owner_id,request_id,idea_id,topic,topic_sha256,state,proposal_json,source_receipts_json,model,error_code,created_at,updated_at) SELECT ?,?,?,?,?,?,'succeeded',?,?,?,NULL,?,? FROM operator_campaign_previews WHERE id=? AND owner_id=? AND state='succeeded' AND proposal_json=? AND source_receipts_json=? ON CONFLICT(owner_id,request_id) DO NOTHING")
   .bind(id,owner.distinct_id,b.request_id.toLowerCase(),parent.idea_id,parent.topic,parent.topic_sha256,proposal,receipts,parent.model,at,at,parent.id,owner.distinct_id,parent.proposal_json,parent.source_receipts_json).run();
  prior=await readRow(env,id,owner.distinct_id);
  return matches(prior)?result(env,prior):failure('revision_save_not_verified',409);
 }catch{return failure('revision_state_unavailable');}
}
