// Caption/brief audit of a saved draft. Never claims to inspect image pixels.
import { auditDraft } from './governance.js';

// Length-safe JSON entries, ordered by editorial sequence. Included in the atomic write
// predicate so an in-flight provider response cannot certify changed media or ordering.
const MEDIA = `(SELECT COALESCE(group_concat(item, ','), '') FROM
  (SELECT json_array(id, seq, media_key) AS item FROM social_post_media
   WHERE post_id=social_posts.id ORDER BY seq, id))`;

export async function auditSavedDraft(env, postId, expectedCaption, judge = auditDraft) {
  if (!postId) return { ok:false, status:400, error:'Missing id.' };
  const row = await env.DB.prepare(`SELECT *, ${MEDIA} AS media_snapshot FROM social_posts WHERE id=?`).bind(postId).first();
  if (!row) return { ok:false, status:404, error:'That post no longer exists.' };
  if (!['draft','failed'].includes(row.status)) return { ok:false, status:409, error:'Return this post to draft before auditing it.' };
  if (expectedCaption !== undefined && expectedCaption !== (row.caption || '')) {
    return { ok:false, status:409, error:'Save your caption changes before auditing.' };
  }
  const audit = await judge(env, { caption:row.caption, image_brief:row.image_brief });
  const result = await env.DB.prepare(`UPDATE social_posts SET audit_score=?, audit_flags=?, audit_at=?, audit_status=?
    WHERE id=? AND status IN ('draft','failed') AND COALESCE(caption,'')=?
    AND COALESCE(image_brief,'')=? AND COALESCE(media_key,'')=? AND COALESCE(media_type,'')=?
    AND ${MEDIA}=?`).bind(audit.brand_score, JSON.stringify(audit.flags), Date.now(), audit.verdict,
      postId, row.caption || '', row.image_brief || '', row.media_key || '', row.media_type || '', row.media_snapshot).run();
  if (result.meta?.changes !== 1) return { ok:false, status:409, error:'This draft changed during the audit. Review and audit it again.' };
  return { ok:true, id:postId, audit, scope:'caption_and_image_brief', visual_review_required:true };
}
