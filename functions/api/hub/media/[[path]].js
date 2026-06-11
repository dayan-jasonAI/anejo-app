// GET /api/hub/media/<kind>/<yyyy-mm>/<id>.<ext> — serve a stored R2 media object.
// Any authenticated HUB role may fetch (proof photos, studio clips, receipts are
// internal ops media). 404 when the R2 binding is absent or the key is unknown.
import { json } from '../../../_lib/util.js';
import { requireRole, HUB_ROLES } from '../../../_lib/roles.js';
import { getMedia, contentTypeForKey } from '../../../_lib/media.js';

export const onRequestGet = async ({ request, env, params }) => {
  const ctx = await requireRole(request, env, HUB_ROLES);
  if (ctx instanceof Response) return ctx;

  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const key = parts.join('/');
  if (!key || key.includes('..')) return json({ error: 'Not found.' }, 404);

  const obj = await getMedia(env, key);
  if (!obj) return json({ error: 'Not found.' }, 404);

  const contentType =
    (obj.httpMetadata && obj.httpMetadata.contentType) || contentTypeForKey(key);
  const headers = {
    'Content-Type': contentType,
    'Cache-Control': 'private, max-age=3600',
  };
  if (obj.httpEtag) headers.ETag = obj.httpEtag;
  return new Response(obj.body, { status: 200, headers });
};
