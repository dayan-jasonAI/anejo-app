// Reviewed library reuse is draft-only. Product requirements describe the requested
// composition; they are not an owner's approval of a model's interpretation of a photo.
import { selectApprovedMarketingAssets } from './marketing_asset_selection.js';
import { id, randToken } from './util.js';
export async function attachApprovedMarketingAsset(env, { postId, expectedCaption, expectedImageBrief = '', requirements } = {}) {
  if (!postId || typeof expectedCaption !== 'string' || typeof expectedImageBrief !== 'string' || !requirements || typeof requirements !== 'object') return { ok: false, reason: 'missing_explicit_requirements' };
  const selection = await selectApprovedMarketingAssets(env, { ...requirements, limit: 1 });
  if (!selection.ok || !selection.assets.length) return { ok: false, reason: selection.reason, selection };
  const asset = selection.assets[0], mediaId = id('spm'), useId = id('mau'), at = Date.now();
  const criteria = JSON.stringify({ productIds: asset.product_ids, format: asset.format, theme: asset.theme, visualType: requirements.visualType ?? null });
  try {
    // Registry revision, active products and empty, unchanged private draft are checked
    // in the INSERT itself. A revoke between selection and this transaction wins.
    const result = await env.DB.batch([
      env.DB.prepare(`INSERT INTO social_post_media (id,post_id,seq,media_key,public_token,created_at,origin)
        SELECT ?,p.id,0,r.asset_key,?,?,'reviewed_library' FROM social_posts p JOIN marketing_asset_registry r ON r.id=?
        WHERE p.id=? AND p.status='draft' AND p.caption=? AND COALESCE(p.image_brief,'')=?
        AND COALESCE(p.media_key,'')='' AND COALESCE(p.media_type,'IMAGE')='IMAGE'
        AND NOT EXISTS(SELECT 1 FROM social_post_media WHERE post_id=p.id)
        AND r.revision=? AND r.content_sha256=? AND r.approved_for_draft_selection=1
        AND r.menu_item_ids_json=? AND r.format=? AND r.theme=?
        AND NOT EXISTS(SELECT 1 FROM json_each(r.menu_item_ids_json) j WHERE NOT EXISTS(SELECT 1 FROM menu_items m WHERE m.id=j.value AND m.active=1))`)
        .bind(mediaId, randToken(24), at, asset.asset_id, postId, expectedCaption, expectedImageBrief, asset.revision, asset.content_sha256, JSON.stringify(asset.product_ids), asset.format, asset.theme),
      env.DB.prepare(`INSERT INTO marketing_asset_uses (id,post_id,media_id,asset_id,asset_revision,content_sha256,requirements_json,created_at)
        SELECT ?,post_id,id,?,?,?,?,? FROM social_post_media WHERE id=?`)
        .bind(useId, asset.asset_id, asset.revision, asset.content_sha256, criteria, at, mediaId),
      env.DB.prepare(`UPDATE social_posts SET scheduled_at=NULL,original_caption_hash=NULL,original_design_snapshot=NULL,
        audit_score=NULL,audit_flags=NULL,audit_at=NULL,audit_status=NULL,audit_scope=NULL,audit_snapshot=NULL,audit_detail_json=NULL,audit_context_snapshot=NULL,updated_at=?
        WHERE id=? AND status='draft' AND EXISTS(SELECT 1 FROM marketing_asset_uses WHERE id=? AND post_id=social_posts.id)`)
        .bind(at, postId, useId),
    ]);
    if (result.some(r => r?.meta?.changes !== 1)) return { ok: false, reason: 'draft_or_review_changed' };
    return { ok: true, provider: 'reviewed_library', media_key: asset.media_key, slides: 1, asset_use_id: useId, asset_id: asset.asset_id, asset_revision: asset.revision, content_sha256: asset.content_sha256, publication_approved: false, human_review_required: true };
  } catch { return { ok: false, reason: 'attachment_storage_failed' }; }
}
