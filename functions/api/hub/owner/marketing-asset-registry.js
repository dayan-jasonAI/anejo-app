// Private opt-in to deterministic DRAFT asset selection. Never publication consent.
import { json, bad, id } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { inspectMarketingAsset, isMarketingAssetKey, validateAssetProducts, normalizeAssetTheme, ASSET_VISUAL_TYPES } from '../../../_lib/marketing_asset_selection.js';
const FIELDS = new Set(['asset_key', 'expected_revision', 'menu_item_ids', 'theme', 'visual_type', 'approved_for_draft_selection']);
async function bodyOf(request) {
  const reader = request.body?.getReader();
  if (!reader) throw Error('body');
  let count = 0; const chunks = [];
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    count += value.byteLength;
    if (count > 8192) { await reader.cancel(); throw Error('size'); }
    chunks.push(value);
  }
  return JSON.parse(await new Blob(chunks).text());
}
// Revocation is a local control, not a claim about the current file/catalog. It must
// remain available after a source vanishes or changes. Reapproval uses normal validation.
async function revoke(env, ctx, body) {
  if (Object.keys(body).some(k => !['op', 'asset_key', 'expected_revision'].includes(k)) ||
      !isMarketingAssetKey(body.asset_key) || !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0) return bad('Use an asset key and expected revision to revoke.');
  const actor = ctx.distinct_id || ctx.email;
  if (!actor) return bad('Reviewer identity unavailable.', 403);
  let row;
  try { row = await env.DB.prepare('SELECT * FROM marketing_asset_registry WHERE asset_key=?').bind(body.asset_key).first(); }
  catch { return bad('Registry unavailable.', 503); }
  if (!row) return bad('Registered asset not found.', 404);
  if (row.revision !== body.expected_revision) return bad('Asset review changed. Reload before saving.', 409);
  const revision = row.revision + 1, now = Date.now();
  const metadata = { op: 'revoke', menu_item_ids: JSON.parse(row.menu_item_ids_json), theme: row.theme, visual_type: row.visual_type,
    approved_for_draft_selection: false, content_sha256: row.content_sha256, scope: 'draft_selection_only', publication_approved: false };
  try {
    const result = await env.DB.batch([
      env.DB.prepare('UPDATE marketing_asset_registry SET approved_for_draft_selection=0,revision=?,reviewed_by=?,reviewed_at=? WHERE id=? AND revision=?')
        .bind(revision, actor, now, row.id, body.expected_revision),
      env.DB.prepare('INSERT INTO marketing_asset_registry_reviews (id,asset_id,revision,reviewed_by,reviewed_at,metadata_json) SELECT ?,?,?,?,?,? WHERE changes()=1')
        .bind(id('mar'), row.id, revision, actor, now, JSON.stringify(metadata)),
    ]);
    if (result[0]?.meta?.changes !== 1 || result[1]?.meta?.changes !== 1) return bad('Asset review changed. Reload before saving.', 409);
  } catch { return bad('Could not save revocation. No change is confirmed.', 503); }
  return json({ ok: true, id: row.id, revision, media_key: row.asset_key, approved_for_draft_selection: false, scope: 'draft_selection_only', publication_approved: false });
}
export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Registry unavailable.', 503);
  try {
    const rows = await env.DB.prepare('SELECT * FROM marketing_asset_registry ORDER BY asset_key LIMIT 101').all();
    if (rows?.success === false || !Array.isArray(rows?.results)) throw Error('read');
    return json({ ok: true, assets: rows.results.slice(0, 100).map(row => ({ ...row, menu_item_ids: JSON.parse(row.menu_item_ids_json), approved_for_draft_selection: row.approved_for_draft_selection === 1 })), truncated: rows.results.length > 100, scope: 'draft_selection_only', publication_approved: false });
  } catch { return bad('Could not read asset registry.', 503); }
};
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Registry unavailable.', 503);
  let body;
  try { body = await bodyOf(request); } catch { return bad('Use a valid registry record under 8KB.'); }
  if (body && typeof body === 'object' && !Array.isArray(body) && body.op === 'revoke') return revoke(env, ctx, body);
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => !FIELDS.has(k)) ||
      !Number.isSafeInteger(body.expected_revision) || body.expected_revision < 0 || typeof body.approved_for_draft_selection !== 'boolean' ||
      !ASSET_VISUAL_TYPES.includes(body.visual_type)) return bad('Use a supported asset review and expected revision.');
  const theme = normalizeAssetTheme(body.theme);
  if (theme === null) return bad('Use a theme under 80 characters.');
  const products = await validateAssetProducts(env, body.menu_item_ids);
  if (!products.ok) return bad(products.reason, products.reason === 'catalog_unavailable' ? 503 : 400);
  const checked = await inspectMarketingAsset(env, body.asset_key);
  if (!checked.ok) return bad(checked.reason, checked.reason === 'asset_missing' ? 404 : ['storage_unavailable', 'asset_read_failed'].includes(checked.reason) ? 503 : 400);
  let existing;
  try { existing = await env.DB.prepare('SELECT * FROM marketing_asset_registry WHERE asset_key=?').bind(body.asset_key).first(); }
  catch { return bad('Registry unavailable.', 503); }
  if ((existing?.revision || 0) !== body.expected_revision) return bad('Asset review changed. Reload before saving.', 409);
  if (existing && existing.content_sha256 !== checked.content_sha256) return bad('Stored bytes changed. Register a new immutable asset key.', 409);
  const actor = ctx.distinct_id || ctx.email;
  if (!actor) return bad('Reviewer identity unavailable.', 403);
  const now = Date.now(), assetId = existing?.id || id('mas'), revision = body.expected_revision + 1;
  const metadata = { menu_item_ids: products.product_ids, theme, visual_type: body.visual_type, approved_for_draft_selection: body.approved_for_draft_selection, content_sha256: checked.content_sha256, scope: 'draft_selection_only', publication_approved: false };
  const mutation = existing
    ? env.DB.prepare(`UPDATE marketing_asset_registry SET menu_item_ids_json=?,theme=?,visual_type=?,approved_for_draft_selection=?,revision=?,reviewed_by=?,reviewed_at=? WHERE id=? AND revision=? AND content_sha256=?`)
      .bind(JSON.stringify(products.product_ids), theme, body.visual_type, body.approved_for_draft_selection ? 1 : 0, revision, actor, now, assetId, body.expected_revision, checked.content_sha256)
    : env.DB.prepare(`INSERT INTO marketing_asset_registry (id,asset_key,content_sha256,byte_size,width,height,format,menu_item_ids_json,theme,visual_type,approved_for_draft_selection,revision,reviewed_by,reviewed_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(asset_key) DO NOTHING`)
      .bind(assetId, body.asset_key, checked.content_sha256, checked.byte_size, checked.width, checked.height, checked.format, JSON.stringify(products.product_ids), theme, body.visual_type, body.approved_for_draft_selection ? 1 : 0, revision, actor, now, now);
  const audit = env.DB.prepare(`INSERT INTO marketing_asset_registry_reviews (id,asset_id,revision,reviewed_by,reviewed_at,metadata_json)
    SELECT ?,?,?,?,?,? WHERE changes()=1`).bind(id('mar'), assetId, revision, actor, now, JSON.stringify(metadata));
  try {
    const results = await env.DB.batch([mutation, audit]);
    if (results[0]?.meta?.changes !== 1 || results[1]?.meta?.changes !== 1) return bad('Asset review changed. Reload before saving.', 409);
  } catch { return bad('Could not save the asset review. No approval is confirmed.', 503); }
  return json({ ok: true, id: assetId, revision, media_key: body.asset_key, content_sha256: checked.content_sha256, format: checked.format,
    approved_for_draft_selection: body.approved_for_draft_selection, scope: 'draft_selection_only', publication_approved: false });
};
