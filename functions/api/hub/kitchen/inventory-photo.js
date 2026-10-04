import { json, bad, id, now } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { changeInsert, commitChange, notifyInventory } from '../../../_lib/inventory_updates.js';
import { reconcileInventoryProduction } from '../../../_lib/inventory_production.js';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_BODY = Math.ceil(MAX_BYTES / 3) * 4 + 2048;

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.MEDIA) return bad('Photo storage is not configured.', 503);
  const len = Number(request.headers.get('content-length') || 0);
  if (len > MAX_BODY) return bad('Photo exceeds the 5MB limit.', 413);
  let b;
  try { const raw = await request.text(); if (raw.length > MAX_BODY) return bad('Photo exceeds the 5MB limit.', 413); b = JSON.parse(raw); }
  catch { return bad('Invalid JSON body.'); }
  const itemId = String(b?.id || '').trim();
  if (!itemId || !/^[\w-]{1,100}$/.test(itemId)) return bad('Missing or invalid item id.');
  if (typeof b.data_url !== 'string') return bad('Pick a JPEG, PNG or WebP photo.');
  const match = b.data_url.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]*={0,2})$/);
  if (!match) return bad('Upload JPEG, PNG or WebP.');
  let bytes;
  try { const bin = atob(match[2]); if (bin.length > MAX_BYTES) return bad('Photo exceeds the 5MB limit.', 413); bytes = Uint8Array.from(bin, c => c.charCodeAt(0)); }
  catch { return bad('Could not decode the photo.'); }
  const kind = match[1];
  const valid = kind === 'jpeg' ? bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217
    : kind === 'png' ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)
      : String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (bytes.length < 100 || !valid) return bad('Photo bytes are empty, incomplete or do not match the declared format.');
  const item = await env.DB.prepare('SELECT * FROM inventory_items WHERE id=?').bind(itemId).first();
  if (!item) return bad('Item not found.', 404);
  if (b.expected_revision != null && Number(b.expected_revision) !== Number(item.revision || 0)) return bad('Inventory item changed. Refresh before saving.', 409);
  const ext = kind === 'jpeg' ? 'jpg' : kind;
  const key = `kitchen/inventory/${itemId}/${id('photo')}.${ext}`;
  try { await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: `image/${kind}` } }); }
  catch { return bad('Could not store the photo.', 503); }
  const staff = await currentStaff(env, request);
  const actorId = staff?.id || ctx.distinct_id || null;
  const at = now();
  const after = { ...item, photo_key: key, photo_status: 'pending', photo_reviewed_by: null, photo_reviewed_at: null, revision: Number(item.revision || 0) + 1 };
  const change = changeInsert({ itemId, action: 'photo_submitted', actorId, before: item, after, at });
  const saved = await commitChange(env, { sql: "UPDATE inventory_items SET photo_key=?,photo_status='pending',photo_reviewed_by=NULL,photo_reviewed_at=NULL,updated_by=?,updated_at=?,revision=revision+1,last_change_id=? WHERE id=? AND revision=?", args: [key,actorId,at,change.changeId,itemId,Number(item.revision || 0)] }, change);
  if (!saved.ok) return bad('Photo was uploaded, but the item changed before it could be attached. Refresh and submit again.', 409);
  const push_status = await notifyInventory(env, change.changeId);
  let production;
  try { production = await reconcileInventoryProduction(env, { actorId, changeId: change.changeId }); }
  catch (error) { production = { ok: false, error: String(error?.message || 'unavailable') }; }
  return json({ ok: true, id: itemId, photo_key: key, photo_status: 'pending', flagged_pending: true, url: `/api/hub/media/${key}`, change_id: change.changeId, push_status, production_status: production?.ok ? 'reconciled' : 'unavailable', production_error: production?.ok ? null : production?.error || 'unavailable' });
};
