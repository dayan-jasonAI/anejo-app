// GET /api/hub/owner/catering-attachments/:id — owner-only private design-file preview/download.
import { json } from '../../../../_lib/util.js';
import { requireRole } from '../../../../_lib/roles.js';

function safeDownloadName(value) {
  return String(value || 'catering-design')
    .replace(/[\u0000-\u001f\u007f"\\/]/g, '-')
    .trim()
    .slice(0, 180) || 'catering-design';
}

export const onRequestGet = async ({ request, env, params }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB || !env.MEDIA) return json({ error: 'File storage is unavailable.' }, 503);
  const attachmentId = String((params && params.id) || '').trim();
  if (!/^cat_[0-9a-f]{20}$/.test(attachmentId)) return json({ error: 'Not found.' }, 404);

  let row;
  try {
    row = await env.DB.prepare(
      `SELECT id, lead_id, r2_key, filename, content_type, byte_size
         FROM catering_attachments WHERE id=? AND lead_id IS NOT NULL`
    ).bind(attachmentId).first();
  } catch { return json({ error: 'Could not load the file.' }, 500); }
  if (!row) return json({ error: 'Not found.' }, 404);

  let object;
  try { object = await env.MEDIA.get(row.r2_key); }
  catch { object = null; }
  if (!object) return json({ error: 'File not found in private storage.' }, 404);

  const disposition = new URL(request.url).searchParams.get('download') === '1' ? 'attachment' : 'inline';
  const headers = {
    'Content-Type': row.content_type || 'application/octet-stream',
    'Content-Length': String(row.byte_size || ''),
    'Content-Disposition': `${disposition}; filename="${safeDownloadName(row.filename)}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (object.httpEtag) headers.ETag = object.httpEtag;
  return new Response(object.body, { status: 200, headers });
};
