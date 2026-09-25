// Internal saved-design audit: private JPEG bytes and caption bound to one revision.
// Published reviews write audit evidence only; they do not edit or reapprove public posts.
import { DESIGN_FACTS_BY_SHA256, DESIGN_FACTS_VERSION } from './audit_design_facts.generated.js';
import { auditDraft } from './governance.js';
import { VERSION as VISUAL_AUDIT_VERSION } from './visual_audit_rubric.js';

// Length-safe JSON entries, ordered by editorial sequence. Included in the atomic write
// predicate so an in-flight provider response cannot certify changed media or ordering.
const MEDIA = `(SELECT COALESCE(group_concat(item, ','), '') FROM
  (SELECT json_array(id, seq, media_key) AS item FROM social_post_media
   WHERE post_id=social_posts.id ORDER BY seq, id))`;

export const SOCIAL_AUDIT_SNAPSHOT = `json_array(COALESCE(caption,''),COALESCE(image_brief,''),COALESCE(media_key,''),COALESCE(media_type,''),${MEDIA})`;

// Ordered source version sets, including membership changes from active toggles/deletion.
// A shared SQL expression permits comparison inside the same conditional write.
const versions = (table, where) => `(SELECT COALESCE(group_concat(item, ','), '') FROM (SELECT json_array(id,updated_at) AS item FROM ${table} WHERE ${where} ORDER BY id))`;
export const SOCIAL_AUDIT_CONTEXT = `json_array(${versions('docs', "active=1 AND doc_type='brand'")},${versions('training_rules','active=1')},${versions('training_examples','active=1')},${versions('menu_items','active=1')})`;
export const SOCIAL_AUDIT_CURRENT = `(audit_snapshot=${SOCIAL_AUDIT_SNAPSHOT} AND audit_context_snapshot=${SOCIAL_AUDIT_CONTEXT} AND json_valid(audit_detail_json) AND CASE WHEN json_valid(audit_detail_json) THEN json_extract(audit_detail_json,'$.rubric_version')='${VISUAL_AUDIT_VERSION}' ELSE 0 END)`;

export async function loadAuditImages(env, mediaSnapshot) {
  if (!env.MEDIA) throw new Error('Media storage unavailable');
  const slides=JSON.parse('['+mediaSnapshot+']');
  if (!slides.length || slides.length>10) throw new Error('Audit requires one to ten JPEG slides');
  let total=0; const images=[];
  for (const [mediaId, seq,key] of slides) {
    if (!/^(studio|marketing-library)\//.test(key) || key.includes('..') || !/\.jpe?g$/i.test(key)) throw new Error('Audit supports saved marketing JPEGs only');
    const object=await env.MEDIA.get(key);
    if (!object || !Number.isFinite(object.size) || object.size>5*1024*1024) throw new Error('Image missing or exceeds 5MB');
    total+=object.size;if(total>15*1024*1024) throw new Error('Carousel images exceed the 15MB audit limit');
    const bytes=new Uint8Array(await object.arrayBuffer());
    if(bytes.length!==object.size || bytes.length<4 || bytes[0]!==255 || bytes[1]!==216 || bytes[2]!==255) throw new Error('Invalid JPEG content');
    let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
    const sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b=>b.toString(16).padStart(2,'0')).join('');
    const designFacts=Object.hasOwn(DESIGN_FACTS_BY_SHA256,sha256)?DESIGN_FACTS_BY_SHA256[sha256]:null;
    let unreviewedRender=null,renderReceiptStatus=designFacts?'reviewed_registry':'not_found';
    if(!designFacts && env.DB){
      try {
        const receipt=await env.DB.prepare("SELECT id,source_key,source_sha256,output_bytes,declaration_json,evidence_tier FROM marketing_render_receipts WHERE output_sha256=? AND output_key=? AND state='attached' LIMIT 1").bind(sha256,key).first();
        if(receipt && receipt.evidence_tier==='browser_declared' && receipt.output_bytes===bytes.length && receipt.declaration_json.length<=12288){
          unreviewedRender={receipt_id:receipt.id,source_key:receipt.source_key,source_sha256:receipt.source_sha256,evidence_tier:'browser_declared',declaration:JSON.parse(receipt.declaration_json)};
          renderReceiptStatus='browser_declared_bytes_matched';
        }
      } catch { renderReceiptStatus='receipt_read_unavailable'; }
    }
    images.push({key,data:btoa(binary),sourceReceipt:{media_id:mediaId,seq,key,sha256,byte_length:bytes.length,design_facts_version:DESIGN_FACTS_VERSION,design_facts:designFacts,render_receipt_status:renderReceiptStatus,unreviewed_render:unreviewedRender}});
  }
  return images;
}

// Check recorded bytes at a trust boundary. No model call and no approval mutation.
export async function verifyAuditImageReceipts(env, mediaSnapshot, auditDetail) {
  try {
    const detail = typeof auditDetail === 'string' ? JSON.parse(auditDetail) : auditDetail;
    const sources = detail?.input_coverage?.slide_sources;
    if (!Array.isArray(sources) || !sources.length || sources.length>10) return false;
    const images = await loadAuditImages(env,mediaSnapshot);
    return images.length===sources.length && images.every((image,index)=>{
      const expected=sources[index], actual=image.sourceReceipt;
      return expected?.slide===index+1 && expected.media_id===actual.media_id &&
        expected.seq===actual.seq && expected.key===actual.key && expected.sha256===actual.sha256 &&
        expected.byte_length===actual.byte_length;
    });
  } catch { return false; }
}

export async function auditSavedDraft(env, postId, expectedCaption, judge = auditDraft) {
  if (!postId) return { ok:false, status:400, error:'Missing id.' };
  const row = await env.DB.prepare(`SELECT *, ${MEDIA} AS media_snapshot, ${SOCIAL_AUDIT_SNAPSHOT} AS revision_snapshot, ${SOCIAL_AUDIT_CONTEXT} AS context_snapshot FROM social_posts WHERE id=?`).bind(postId).first();
  if (!row) return { ok:false, status:404, error:'That post no longer exists.' };
  if (!['draft','failed','published'].includes(row.status)) return { ok:false, status:409, error:'Audit a draft, failed post or published saved design. Scheduled and publishing posts cannot be audited.' };
  if (expectedCaption !== undefined && expectedCaption !== (row.caption || '')) {
    return { ok:false, status:409, error:'Save your caption changes before auditing.' };
  }
  let images=[], mediaError=null;
  try { images=await loadAuditImages(env,row.media_snapshot); } catch(error) { mediaError=error.message; }
  const audit = mediaError ? {brand_score:0,verdict:'flag',flags:[{type:'audit_unavailable',detail:'Finished-image audit unavailable: '+mediaError}]} : await judge(env, { caption:row.caption, image_brief:row.image_brief, images });
  // R2 keys can be overwritten without changing the SQL snapshot. Refuse to save a
  // provider result against bytes that changed while it was judging the earlier image.
  if (!mediaError) {
    try {
      const latest = await loadAuditImages(env,row.media_snapshot);
      if (latest.some((image,index)=>image.sourceReceipt.sha256!==images[index].sourceReceipt.sha256)) {
        return {ok:false,status:409,error:'Saved image bytes changed during the audit. Review and audit again.'};
      }
    } catch {
      return {ok:false,status:409,error:'Saved image bytes could not be reverified after the audit. Review and audit again.'};
    }
  }
  const scope = !mediaError && !audit.flags.some(f=>f.type==='audit_unavailable') ? 'caption_and_media' : 'unavailable';
  const auditTarget = row.status === 'published' ? 'published_saved_source' : 'draft_saved_source';
  const detail = audit.rubric_version ? JSON.stringify({audit_target:auditTarget,rubric_version:audit.rubric_version,complete:audit.complete ?? null,criteria_met:audit.criteria_met ?? null,criteria_applicable:audit.criteria_applicable ?? null,unknowns:audit.unknowns ?? null,product_evidence:audit.product_evidence ?? null,observations:audit.observations ?? null,suggestions:audit.suggestions ?? null,input_coverage:audit.input_coverage ?? null,score_meaning:audit.score_meaning ?? null,audit_diagnostic:audit.audit_diagnostic ?? null}) : JSON.stringify({audit_target:auditTarget});
  const result = await env.DB.prepare(`UPDATE social_posts SET audit_score=?, audit_flags=?, audit_at=?, audit_status=?, audit_scope=?, audit_snapshot=?, audit_detail_json=?, audit_context_snapshot=?
    WHERE id=? AND status=? AND COALESCE(caption,'')=?
    AND COALESCE(image_brief,'')=? AND COALESCE(media_key,'')=? AND COALESCE(media_type,'')=?
    AND ${MEDIA}=? AND ${SOCIAL_AUDIT_CONTEXT}=?`).bind(audit.brand_score, JSON.stringify(audit.flags), Date.now(), audit.verdict, scope, row.revision_snapshot, detail, row.context_snapshot,
      postId, row.status, row.caption || '', row.image_brief || '', row.media_key || '', row.media_type || '', row.media_snapshot, row.context_snapshot).run();
  if (result.meta?.changes !== 1) return { ok:false, status:409, error:'This saved post or its source guidance changed during the audit. Review and audit it again.' };
  return { ok:true, id:postId, audit, scope, visual_review_required:true, audit_target:auditTarget };
}
