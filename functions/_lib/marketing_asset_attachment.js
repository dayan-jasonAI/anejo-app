// Reviewed library reuse is draft-only. Product requirements describe the requested
// composition; they are not an owner's approval of a model's interpretation of a photo.
import { selectApprovedMarketingAssets, normalizeAssetProducts, ASSET_FORMATS, ASSET_VISUAL_TYPES } from './marketing_asset_selection.js';
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
      env.DB.prepare(`UPDATE social_posts SET scheduled_at=NULL,auto_audit_required=NULL,original_caption_hash=NULL,original_design_snapshot=NULL,
        audit_score=NULL,audit_flags=NULL,audit_at=NULL,audit_status=NULL,audit_scope=NULL,audit_snapshot=NULL,audit_detail_json=NULL,audit_context_snapshot=NULL,updated_at=?
        WHERE id=? AND status='draft' AND EXISTS(SELECT 1 FROM marketing_asset_uses WHERE id=? AND post_id=social_posts.id)`)
        .bind(at, postId, useId),
    ]);
    if (result.some(r => r?.meta?.changes !== 1)) return { ok: false, reason: 'draft_or_review_changed' };
    return { ok: true, provider: 'reviewed_library', media_key: asset.media_key, slides: 1, asset_use_id: useId, asset_id: asset.asset_id, asset_revision: asset.revision, content_sha256: asset.content_sha256, publication_approved: false, human_review_required: true };
  } catch { return { ok: false, reason: 'attachment_storage_failed' }; }
}

// Metadata is a candidate, not proof the object is still present or unchanged.
export async function marketingAssetCandidateContext(env, suppliedProductIds = []) {
  let rows = [], readStatus = 'unavailable', truncated = false;
  try {
    const result = await env.DB.prepare(`SELECT id,revision,content_sha256,menu_item_ids_json,format,theme,visual_type FROM marketing_asset_registry
      WHERE approved_for_draft_selection=1 ORDER BY asset_key LIMIT 21`).all();
    if (result?.success === false || !Array.isArray(result?.results)) throw Error('read');
    rows = result.results.slice(0,20); truncated = result.results.length > 20; readStatus = rows.length ? 'ok' : 'empty';
  } catch { /* unavailable is not an empty registry */ }
  const supplied = new Set(suppliedProductIds), candidates = [];
  for (const row of rows) {
    try {
      const products = normalizeAssetProducts(JSON.parse(row.menu_item_ids_json));
      if (!products || !products.every(id => supplied.has(id)) || !ASSET_FORMATS.includes(row.format) || !ASSET_VISUAL_TYPES.includes(row.visual_type)) continue;
      candidates.push({asset_id:row.id,asset_revision:row.revision,content_sha256:row.content_sha256,
        requirements:{productIds:products,format:row.format,theme:row.theme,visualType:row.visual_type}});
    } catch { /* malformed row is never supplied as usable */ }
  }
  const text = JSON.stringify({read_status:readStatus,truncated,candidates,meaning:'Reviewed metadata only; current bytes and permission are rechecked on attachment. These labels do not certify the requested composition or approve publication.'});
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
  return {text,candidates,receipt:{source:'marketing_asset_registry',read_status:readStatus,truncated,selection_limit:20,rendered_sha256:hash,source_ids:candidates.map(c=>c.asset_id),documents:candidates.map(c=>({id:c.asset_id,asset_revision:c.asset_revision,content_sha256:c.content_sha256}))}};
}
export function suppliedAssetRequirements(requirements, context) {
  const ids = normalizeAssetProducts(requirements?.productIds);
  if (!ids) return false;
  return context.candidates.some(({requirements:r})=>JSON.stringify(ids)===JSON.stringify(r.productIds) && requirements.format===r.format && requirements.theme===r.theme && requirements.visualType===r.visualType);
}
