// Saved-draft audit: private JPEG bytes, ordered slides and caption, bound to one revision.
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
  for (const [, ,key] of slides) {
    if (!/^(studio|marketing-library)\//.test(key) || key.includes('..') || !/\.jpe?g$/i.test(key)) throw new Error('Audit supports saved marketing JPEGs only');
    const object=await env.MEDIA.get(key);
    if (!object || !Number.isFinite(object.size) || object.size>5*1024*1024) throw new Error('Image missing or exceeds 5MB');
    total+=object.size;if(total>15*1024*1024) throw new Error('Carousel images exceed the 15MB audit limit');
    const bytes=new Uint8Array(await object.arrayBuffer());
    if(bytes.length!==object.size || bytes.length<4 || bytes[0]!==255 || bytes[1]!==216 || bytes[2]!==255) throw new Error('Invalid JPEG content');
    let binary='';for(let offset=0;offset<bytes.length;offset+=8192)binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
    images.push({key,data:btoa(binary)});
  }
  return images;
}

export async function auditSavedDraft(env, postId, expectedCaption, judge = auditDraft) {
  if (!postId) return { ok:false, status:400, error:'Missing id.' };
  const row = await env.DB.prepare(`SELECT *, ${MEDIA} AS media_snapshot, ${SOCIAL_AUDIT_SNAPSHOT} AS revision_snapshot, ${SOCIAL_AUDIT_CONTEXT} AS context_snapshot FROM social_posts WHERE id=?`).bind(postId).first();
  if (!row) return { ok:false, status:404, error:'That post no longer exists.' };
  if (!['draft','failed'].includes(row.status)) return { ok:false, status:409, error:'Return this post to draft before auditing it.' };
  if (expectedCaption !== undefined && expectedCaption !== (row.caption || '')) {
    return { ok:false, status:409, error:'Save your caption changes before auditing.' };
  }
  let images=[], mediaError=null;
  try { images=await loadAuditImages(env,row.media_snapshot); } catch(error) { mediaError=error.message; }
  const audit = mediaError ? {brand_score:0,verdict:'flag',flags:[{type:'audit_unavailable',detail:'Finished-image audit unavailable: '+mediaError}]} : await judge(env, { caption:row.caption, image_brief:row.image_brief, images });
  const scope = !mediaError && !audit.flags.some(f=>f.type==='audit_unavailable') ? 'caption_and_media' : 'unavailable';
  const detail = audit.rubric_version ? JSON.stringify({rubric_version:audit.rubric_version,complete:audit.complete ?? null,criteria_met:audit.criteria_met ?? null,criteria_applicable:audit.criteria_applicable ?? null,unknowns:audit.unknowns ?? null,observations:audit.observations ?? null,suggestions:audit.suggestions ?? null,input_coverage:audit.input_coverage ?? null,score_meaning:audit.score_meaning ?? null,audit_diagnostic:audit.audit_diagnostic ?? null}) : null;
  const result = await env.DB.prepare(`UPDATE social_posts SET audit_score=?, audit_flags=?, audit_at=?, audit_status=?, audit_scope=?, audit_snapshot=?, audit_detail_json=?, audit_context_snapshot=?
    WHERE id=? AND status IN ('draft','failed') AND COALESCE(caption,'')=?
    AND COALESCE(image_brief,'')=? AND COALESCE(media_key,'')=? AND COALESCE(media_type,'')=?
    AND ${MEDIA}=? AND ${SOCIAL_AUDIT_CONTEXT}=?`).bind(audit.brand_score, JSON.stringify(audit.flags), Date.now(), audit.verdict, scope, row.revision_snapshot, detail, row.context_snapshot,
      postId, row.caption || '', row.image_brief || '', row.media_key || '', row.media_type || '', row.media_snapshot, row.context_snapshot).run();
  if (result.meta?.changes !== 1) return { ok:false, status:409, error:'This draft or its source guidance changed during the audit. Review and audit it again.' };
  return { ok:true, id:postId, audit, scope, visual_review_required:true };
}
