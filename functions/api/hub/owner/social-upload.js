// POST /api/hub/owner/social-upload — upload a JPEG from a phone or computer. Owner-only.
//   Body: { data_url: "data:image/jpeg;base64,..." }
//
// Until now the only way to give a post an image was to paste an R2 key — true for Studio output,
// useless for a photo on the owner's phone, which is where real food photography lives.
//
// A JSON data-URL rather than multipart, deliberately: Hub.api is a JSON wrapper and every other
// HUB call goes through it. One transport, one auth path, no second content-type to reason about.
// The ~33% base64 overhead on a ≤5MB photo is a price worth paying for that.
//
// JPEG ONLY, verified by MAGIC BYTES, not the mime string in the data URL. Two reasons:
//   · Instagram rejects everything else, and the publish path refuses non-.jpg keys — accepting a
//     PNG here would create an upload that can never be posted.
//   · Whatever lands in this bucket becomes publicly servable through a social token once staged.
//     Sniff on the way in; never trust a label the browser wrote.
// Video is deliberately not accepted (owner's decision #3 — no video for now).
import { json, bad, id } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';

const MAX_BYTES = 8 * 1024 * 1024;   // page caps files at 5MB; base64 inflates ~33%; headroom, not invitation

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.MEDIA) return bad('Media storage is not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const m = String((b && b.data_url) || '').match(/^data:([a-z/+.-]+);base64,(.+)$/is);
  if (!m) return bad('Pick a file first.');

  let bytes;
  try {
    const bin = atob(m[2]);
    if (bin.length > MAX_BYTES) return bad(`That file is ${Math.round(bin.length / 1048576)}MB — the limit is 5MB. Export a smaller JPEG.`);
    if (bin.length < 100) return bad('That file looks empty.');
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } catch { return bad('Could not decode the file.'); }

  // JPEG magic: FF D8 FF. Checked on the BYTES — a .jpg that is secretly a PNG fails here instead
  // of failing on Instagram twenty seconds after the owner hits publish.
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) {
    return bad('That is not a JPEG. Instagram only accepts JPEG — export it as .jpg and try again.');
  }

  const d = new Date();
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const key = `studio/${ym}/${id('up')}.jpg`;

  try {
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/jpeg' } });
  } catch (e) {
    return bad('Could not store the file. ' + String((e && e.message) || '').slice(0, 120), 500);
  }

  await capture(env, {
    event: 'social.media_uploaded',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { bytes: bytes.length, key },
  });
  return json({ ok: true, media_key: key, bytes: bytes.length });
};
