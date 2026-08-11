// POST /api/hub/owner/social-upload — upload a JPEG from a phone or computer. Owner-only.
//   Body: { data_url: "data:image/jpeg;base64,...", role?: "photo" }
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
//
// OPTIONAL `role`: same filename-suffix convention media.js's putMedia uses for server-generated
// images (`..._photo.jpg`), extended to a BROWSER upload for one reason — the branding tool in
// social.html composites the real Añejo logo onto a Studio photo entirely client-side (Canvas API;
// see social.html's compositeBranding), then re-uploads the result through THIS route because it
// is, from the server's point of view, just a JPEG the owner's browser produced. Without a way to
// carry the source photo's role forward, a branded food photo would re-upload with NO role suffix,
// the food-first guard (social_publish.js) would file it as UNKNOWN, and a repair that started
// from a recognised photo would silently stop being recognised as one. Sanitised identically to
// putMedia's `role` (own-only endpoint; still never trust a client string into a path unfiltered).
import { json, bad, id } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';

const MAX_BYTES = 8 * 1024 * 1024;   // page caps files at 5MB; base64 inflates ~33%; headroom, not invitation
const JPEG_MAGIC = [0xff, 0xd8, 0xff];

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
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

  // Checked on the BYTES — a .jpg that is secretly a PNG fails here instead of failing on
  // Instagram twenty seconds after the owner hits publish.
  if (!JPEG_MAGIC.every((v, i) => bytes[i] === v)) {
    // Name the commonest case: an iPhone camera-roll photo is HEIC no matter what it is called,
    // and "not a JPEG" alone sends the owner hunting through settings. HEIC magic: bytes 4-11
    // contain 'ftyphei'/'ftypheic'.
    const asText = String.fromCharCode(...bytes.slice(4, 12));
    const isHeic = /ftyphei/i.test(asText);
    return bad(
      isHeic
        ? 'That is an iPhone HEIC photo. In Photos, tap Share → Copy Photo, or screenshot it — both give you a JPEG — then upload that.'
        : 'That is not a JPEG. Instagram only accepts JPEG — export it as .jpg and try again.'
    );
  }

  // Sanitised to [a-z0-9], same rule as media.js's putMedia — this becomes part of an R2 key, and
  // an unfiltered client string could reshape the path with a slash or a dot in it.
  const role = String((b && b.role) || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  const d = new Date();
  const ym = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  const key = `studio/${ym}/${id('up')}${role ? `_${role}` : ''}.jpg`;

  try {
    const meta = { contentType: 'image/jpeg', ext: 'jpg' };
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: meta.contentType } });
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
