// Original marketing photos in existing R2; no publication or generation side effects.
import { json, bad, id } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';

const PREFIX = 'marketing-library/';
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_BODY = Math.ceil(MAX_BYTES / 3) * 4 + 8192;
function photo(obj) {
  const m = obj.customMetadata || {};
  let tags = []; try { tags = JSON.parse(m.tags || '[]'); } catch { /* older metadata */ }
  return { media_key: obj.key, name: m.name || obj.key.split('/').pop(), folder: m.folder || '',
    tags: Array.isArray(tags) ? tags : [], bytes: obj.size,
    uploaded_at: m.uploaded_at || (obj.uploaded ? new Date(obj.uploaded).toISOString() : null),
    enhancement_method: m.enhancement_method || null, source_key: m.source_key || null, ai_enhanced: m.ai_enhanced === 'true', preset: m.preset || null, provider: m.provider || null, model: m.model || null,
    content_type: m.content_type || 'image/jpeg', url: '/api/hub/media/' + obj.key };
}
export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.MEDIA) return bad('Media storage is not configured.', 503);
  const q = new URL(request.url).searchParams;
  const cursor = q.get('cursor') || undefined;
  if (cursor && cursor.length > 2048) return bad('Invalid page cursor.');
  const limit = Math.min(100, Math.max(1, parseInt(q.get('limit'), 10) || 40));
  try {
    const result = await env.MEDIA.list({ prefix: PREFIX, limit, cursor, include: ['customMetadata'] });
    return json({ ok: true, photos: result.objects.filter(o => o.key.startsWith(PREFIX)).map(photo), cursor: result.truncated ? result.cursor : null });
  } catch { return bad('Could not load the photo library. Try again.', 503); }
};
export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.MEDIA) return bad('Media storage is not configured.', 503);
  // Bound the streamed request before materializing base64 or allocating decoded bytes.
  const reader = request.body?.getReader();
  if (!reader) return bad('Pick a JPEG, PNG or WebP photo.');
  let size = 0; const chunks = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY) { await reader.cancel(); return bad('Photo exceeds the 5MB limit.', 413); }
      chunks.push(value);
    }
  } catch { return bad('Could not read the upload.'); }
  let b;
  try { b = JSON.parse(await new Blob(chunks).text()); } catch { return bad('Invalid JSON body.'); }
  if (!b || typeof b !== 'object') return bad('Invalid photo.');
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  const folder = typeof b.folder === 'string' ? b.folder.trim() : '';
  const tags = b.tags === undefined ? [] : b.tags;
  if (!name || name.length > 160 || folder.length > 80 || !Array.isArray(tags) || tags.length > 12 || tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 40)) return bad('Use a name up to 160 characters, folder up to 80, and at most 12 short tags.');
  const match = typeof b.data_url === 'string' && b.data_url.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match) return bad('Upload JPEG, PNG or WebP. Export HEIC from Photos first.');
  let bytes;
  try {
    const binary = atob(match[2]);
    if (binary.length > MAX_BYTES) return bad('Photo exceeds the 5MB limit.', 413);
    if (binary.length < 100) return bad('Photo is empty or incomplete.');
    bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  } catch { return bad('Could not decode the photo.'); }
  const kind = match[1];
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217;
  const png = [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v);
  const webp = String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (!(kind === 'jpeg' ? jpeg : kind === 'png' ? png : webp)) return bad('File bytes do not match the photo format.');
  let polish = null;
  if (b.polish !== undefined) {
    const p = b.polish;
    if (!p || typeof p !== 'object' || Array.isArray(p) ||
        Object.keys(p).some(k => !['source_key', 'preset'].includes(k)) ||
        !['natural', 'bright', 'warm'].includes(p.preset) ||
        typeof p.source_key !== 'string' || p.source_key.length > 300 ||
        !/^marketing-library\/[A-Za-z0-9_/-]+\.(jpg|jpeg|png|webp)$/.test(p.source_key) ||
        p.source_key.includes('//') || kind !== 'jpeg') return bad('Choose an original library photo and a valid JPEG polish preset.');
    let source;
    try { source = await env.MEDIA.get(p.source_key); }
    catch { return bad('Could not verify the original photo.', 503); }
    if (!source) return bad('Original photo not found.', 404);
    const meta = source.customMetadata || {};
    if (meta.ai_enhanced === 'true' || meta.source_key || meta.enhancement_method) return bad('Polish the original photo, not a derivative.', 409);
    polish = { source_key: p.source_key, preset: p.preset, enhancement_method: 'photographic', ai_enhanced: 'false' };
  }
  // These fields are server-owned. A plain upload cannot assert source/AI/provider provenance.
  if (['source_key', 'ai_enhanced', 'enhancement_method', 'preset', 'provider', 'model'].some(k => Object.hasOwn(b, k))) return bad('Use the supported polish workflow for derivative metadata.');
  const ext = kind === 'jpeg' ? 'jpg' : kind;
  const content_type = 'image/' + kind;
  const uploaded_at = new Date().toISOString();
  const key = PREFIX + uploaded_at.slice(0, 7) + '/' + id(polish ? 'polished' : 'original') + '_photo.' + ext;
  const customMetadata = { content_type, name, folder, tags: JSON.stringify([...new Set(tags.map(t => t.trim()))]), uploaded_at, ...(polish || {}) };
  try { await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: content_type }, customMetadata }); }
  catch { return bad('Could not store the photo. Try again.', 503); }
  return json({ ok: true, photo: photo({ key, size: bytes.length, customMetadata }) });
};
