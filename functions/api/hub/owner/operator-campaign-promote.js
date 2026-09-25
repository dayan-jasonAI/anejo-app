import {requireRole} from '../../../_lib/roles.js';
import {json} from '../../../_lib/util.js';
import {validateCampaignProposal} from '../../../_lib/team_lead.js';
import {proposalDigest,currentPromotionAuthority,priorAuthorityMatches,PROMOTION_AUTHORITY_CAS} from '../../../_lib/operator_campaign_promotion.js';
const fail=(error,status=409)=>json({ok:false,promoted:false,error,review_scope:'team_planning_only'},status);
const success=row=>json({ok:true,promoted:true,brief_id:row.brief_id,promotion_id:row.id,preview_id:row.preview_id,proposal_sha256:row.proposal_sha256,review_scope:'team_planning_only'});
export async function onRequestPost({request,env}){
 const owner=await requireRole(request,env,['owner']);if(owner instanceof Response)return owner;if(!owner.distinct_id)return fail('owner_identity_unavailable',403);
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')||''))return fail('json_required',415);
 let b;try{const reader=request.body?.getReader();if(!reader)throw Error();const chunks=[];let n=0;while(true){const {done,value}=await reader.read();if(done)break;n+=value.length;if(n>4096){await reader.cancel();return fail('request_too_large',413);}chunks.push(value);}const bytes=new Uint8Array(n);let i=0;for(const c of chunks){bytes.set(c,i);i+=c.length;}b=JSON.parse(new TextDecoder().decode(bytes));}catch{return fail('invalid_json',400);}
 const fields=['request_id','preview_id','expected_proposal_sha256','acknowledge_open_questions'];
 if(!b||Array.isArray(b)||Object.keys(b).length!==4||!fields.every(k=>Object.hasOwn(b,k))||typeof b.request_id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(b.request_id)||!/^ocp_[a-f0-9]{64}$/.test(b.preview_id)||!/^[a-f0-9]{64}$/.test(b.expected_proposal_sha256)||b.acknowledge_open_questions!==true)return fail('invalid_promotion_request',400);
 const requestId=b.request_id.toLowerCase();
 try{
 const prior=await env.DB.prepare('SELECT * FROM operator_campaign_promotions WHERE owner_id=? AND request_id=?').bind(owner.distinct_id,requestId).first();
 if(prior)return prior.preview_id===b.preview_id&&prior.proposal_sha256===b.expected_proposal_sha256?success(prior):fail('request_key_conflict');
 const existing=await env.DB.prepare('SELECT * FROM operator_campaign_promotions WHERE preview_id=? AND owner_id=?').bind(b.preview_id,owner.distinct_id).first();
 if(existing)return existing.proposal_sha256===b.expected_proposal_sha256?success(existing):fail('proposal_changed');
 const preview=await env.DB.prepare("SELECT * FROM operator_campaign_previews WHERE id=? AND owner_id=? AND state='succeeded'").bind(b.preview_id,owner.distinct_id).first();
 if(!preview)return fail('preview_not_found',404);
 const hash=await proposalDigest(preview.proposal_json);if(hash!==b.expected_proposal_sha256)return fail('proposal_changed');
 const snapshot=await env.DB.prepare(`SELECT ${PROMOTION_AUTHORITY_CAS} AS value`).first('value');
 const authority=await currentPromotionAuthority(env);if(!authority.ok)return fail('authority_unavailable',503);
 const receipts=JSON.parse(preview.source_receipts_json),proposal=JSON.parse(preview.proposal_json);
 if(!priorAuthorityMatches(receipts,authority)||!validateCampaignProposal(proposal,authority.available_product_ids))return fail('stale_preview_regenerate_required');
 const id='opm_'+await proposalDigest(preview.id),briefId='tb_'+await proposalDigest('promotion:'+preview.id),at=Date.now();
 const results=await env.DB.batch([
 env.DB.prepare(`INSERT INTO team_briefs(id,title,objective,audience,angle,channels,assets_json,cadence,success_metric,status,created_by,created_at,updated_at)
 SELECT ?,?,?,?,?,?,?,?,?,'draft',?,?,? FROM operator_campaign_previews WHERE id=? AND owner_id=? AND state='succeeded' AND proposal_json=? AND source_receipts_json=? AND ${PROMOTION_AUTHORITY_CAS}=? ON CONFLICT(id) DO NOTHING`)
 .bind(briefId,proposal.title,proposal.objective,proposal.audience,proposal.angle,JSON.stringify(proposal.channels),JSON.stringify(proposal.assets),proposal.cadence,proposal.success_metric,owner.distinct_id,at,at,preview.id,owner.distinct_id,preview.proposal_json,preview.source_receipts_json,snapshot),
 env.DB.prepare(`INSERT INTO operator_campaign_promotions(id,preview_id,owner_id,request_id,brief_id,proposal_sha256,proposal_json,source_receipts_json,authority_json,review_scope,acknowledged_open_questions,created_at)
 SELECT ?,?,?,?,?,?,?,?,?,'team_planning_only',1,? WHERE changes()=1`).bind(id,preview.id,owner.distinct_id,requestId,briefId,hash,preview.proposal_json,preview.source_receipts_json,JSON.stringify(authority),at)
 ]);
 const saved=await env.DB.prepare('SELECT * FROM operator_campaign_promotions WHERE preview_id=? AND owner_id=?').bind(preview.id,owner.distinct_id).first();
 if(saved&&saved.proposal_sha256===hash)return success(saved);
 return fail(results[0]?.meta?.changes?'promotion_not_verified':'authority_or_preview_changed');
 }catch{return fail('promotion_unavailable',503);}
}
