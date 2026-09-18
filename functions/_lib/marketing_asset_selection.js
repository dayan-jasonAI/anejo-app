// Private, deterministic reuse of reviewed media. Never generates, attaches, publishes or changes R2.
export const ASSET_MAX_BYTES = 5 * 1024 * 1024;
export const ASSET_FORMATS = ['portrait', 'square', 'landscape'];
export const ASSET_VISUAL_TYPES = ['product', 'combo', 'lifestyle', 'editorial'];
export const isMarketingAssetKey = key => typeof key === 'string' && key.length <= 300 && /^marketing-library\/[A-Za-z0-9_/-]+\.jpe?g$/.test(key) && !key.includes('//');
export function normalizeAssetProducts(ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 12 || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(id))) return null;
  return [...new Set(ids)].sort();
}
export function normalizeAssetTheme(theme) {
  return typeof theme === 'string' && theme.length <= 80 && ![...theme].some(char => char.charCodeAt(0) < 32) ? theme.trim().normalize('NFC') : null;
}
function dimensions(bytes) {
  if (bytes.length < 12 || bytes[0] !== 255 || bytes[1] !== 216 || bytes.at(-2) !== 255 || bytes.at(-1) !== 217) return null;
  let i = 2;
  while (i + 3 < bytes.length) {
    if (bytes[i++] !== 255) return null;
    while (bytes[i] === 255) i++;
    const marker = bytes[i++];
    if (marker === 218 || marker === 217) return null;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (i + 1 >= bytes.length) return null;
    const length = bytes[i] * 256 + bytes[i + 1];
    if (length < 2 || i + length > bytes.length) return null;
    if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker)) {
      if (length < 8) return null;
      const height = bytes[i + 3] * 256 + bytes[i + 4], width = bytes[i + 5] * 256 + bytes[i + 6];
      return width && height ? { width, height } : null;
    }
    i += length;
  }
  return null;
}
export async function inspectMarketingAsset(env, assetKey) {
  if (!isMarketingAssetKey(assetKey)) return { ok: false, reason: 'invalid_asset_key' };
  if (!env?.MEDIA) return { ok: false, reason: 'storage_unavailable' };
  try {
    const object = await env.MEDIA.get(assetKey);
    if (!object) return { ok: false, reason: 'asset_missing' };
    if (!Number.isSafeInteger(object.size) || object.size <= 0 || object.size > ASSET_MAX_BYTES) return { ok: false, reason: 'asset_size' };
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== object.size) return { ok: false, reason: 'asset_size_mismatch' };
    const shape = dimensions(bytes);
    if (!shape) return { ok: false, reason: 'invalid_jpeg' };
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return { ok: true, asset_key: assetKey, content_sha256: Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join(''), byte_size: bytes.length, ...shape,
      format: shape.width === shape.height ? 'square' : shape.width > shape.height ? 'landscape' : 'portrait' };
  } catch { return { ok: false, reason: 'asset_read_failed' }; }
}
export async function validateAssetProducts(env, productIds) {
  const ids = normalizeAssetProducts(productIds);
  if (!ids) return { ok: false, reason: 'invalid_product_ids' };
  try {
    for (const id of ids) {
      const row = await env.DB.prepare('SELECT id FROM menu_items WHERE id=? AND active=1').bind(id).first();
      if (!row) return { ok: false, reason: 'product_not_active' };
    }
    return { ok: true, product_ids: ids };
  } catch { return { ok: false, reason: 'catalog_unavailable' }; }
}
export async function selectApprovedMarketingAssets(env, { productIds, format, theme, visualType, limit = 1 } = {}) {
  const ids = normalizeAssetProducts(productIds), normalizedTheme = normalizeAssetTheme(theme);
  if (!ids || !ASSET_FORMATS.includes(format) || normalizedTheme === null || (visualType !== undefined && !ASSET_VISUAL_TYPES.includes(visualType)) || !Number.isInteger(limit) || limit < 1 || limit > 10) return { ok: false, reason: 'invalid_requirements', assets: [] };
  const products = await validateAssetProducts(env, ids);
  if (!products.ok) return { ...products, assets: [] };
  let rows;
  try {
    const result = await env.DB.prepare(`SELECT * FROM marketing_asset_registry WHERE approved_for_draft_selection=1 AND format=? AND theme=?
      AND menu_item_ids_json=? AND (? IS NULL OR visual_type=?) ORDER BY asset_key LIMIT 41`)
      .bind(format, normalizedTheme, JSON.stringify(ids), visualType || null, visualType || null).all();
    if (result?.success === false || !Array.isArray(result?.results)) throw Error('unavailable');
    rows = result.results;
  } catch { return { ok: false, reason: 'registry_unavailable', assets: [] }; }
  const assets = [], rejected = [];
  for (const row of rows.slice(0, 40)) {
    const checked = await inspectMarketingAsset(env, row.asset_key);
    if (!checked.ok || checked.content_sha256 !== row.content_sha256 || checked.format !== row.format) {
      rejected.push({ asset_id: row.id, reason: checked.ok ? 'content_changed' : checked.reason }); continue;
    }
    try {
      const current = await env.DB.prepare('SELECT id FROM marketing_asset_registry WHERE id=? AND revision=? AND approved_for_draft_selection=1 AND content_sha256=?')
        .bind(row.id, row.revision, row.content_sha256).first();
      if (!current) { rejected.push({ asset_id: row.id, reason: 'review_changed' }); continue; }
    } catch { return { ok: false, reason: 'registry_unavailable', assets: [] }; }
    assets.push({ asset_id: row.id, media_key: row.asset_key, content_sha256: row.content_sha256, revision: row.revision,
      product_ids: ids, format, theme: normalizedTheme, visual_type: row.visual_type,
      reasons: ['reviewed_for_draft_selection', 'exact_product_set', 'exact_format_and_theme', 'stored_content_hash_matches'], publication_approved: false });
    if (assets.length >= limit) break;
  }
  return { ok: true, assets, rejected, reason: assets.length ? 'matched' : 'no_approved_match', candidate_scan_limited: rows.length > 40 };
}
