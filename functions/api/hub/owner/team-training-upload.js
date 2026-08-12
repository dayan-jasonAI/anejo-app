// POST /api/hub/owner/team-training-upload — upload a reference image for Team Training.
//   Body: { data_url: "data:image/...;base64,..." }
//   Returns: { ok:true, media_key, bytes, content_type }
//
// Same shape as social-upload.js on purpose: a JSON data-URL (Hub.api is a JSON wrapper, one
// transport for the whole HUB), and validated by MAGIC BYTES rather than the mime string the
// browser attached — a mislabeled file must fail here, not silently corrupt the training library.
//
// Unlike social-upload.js this accepts JPEG, PNG *and* WebP: a reference photo showing the owner
// "the look I want" is just as often a screenshot (PNG) or a saved web image (WebP) as a camera
// JPEG, and this upload never touches Instagram's publish path — the JPEG-only constraint that
// applies there doesn't apply here.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { putMedia, decodeDataUrl } from '../../../_lib/media.js';
import { capture } from '../../../_lib/track.js';

const MAX_BYTES = 8 * 1024 * 1024; // page caps files at 5MB; base64 inflates ~33%; headroom, not invitation

// Sniffed on the bytes, never the label. { contentType, ext, check(bytes) }
const SIGNATURES = [
  { contentType: 'image/jpeg', ext: 'jpg', check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { contentType: 'image/png', ext: 'png', check: (b) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v) },
  { contentType: 'image/webp', ext: 'webp', check: (b) => String.fromCharCode(b[0], b[1], b[2], b[3]) === 'RIFF' && String.fromCharCode(b[8], b[9], b[10], b[11]) === 'WEBP' },
];

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  if (!env.MEDIA) return bad('Media storage is not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const decoded = decodeDataUrl(b && b.data_url);
  if (!decoded) return bad('Pick a file first.');
  if (decoded.bytes.length > MAX_BYTES) return bad(`That file is ${Math.round(decoded.bytes.length / 1048576)}MB — the limit is 5MB. Use a smaller image.`);
  if (decoded.bytes.length < 100) return bad('That file looks empty.');

  const sig = SIGNATURES.find((s) => s.check(decoded.bytes));
  if (!sig) {
    // Name the commonest failure the way social-upload.js does: an iPhone camera-roll photo is
    // HEIC no matter what the filename claims, and "not a supported image" alone sends the owner
    // hunting through Photos settings. HEIC magic: bytes 4-11 contain 'ftyphei'/'ftypheic'.
    const asText = String.fromCharCode(...decoded.bytes.slice(4, 12));
    const isHeic = /ftyphei/i.test(asText);
    return bad(
      isHeic
        ? 'That is an iPhone HEIC photo. In Photos, tap Share → Copy Photo, or screenshot it — both give you a JPEG — then upload that.'
        : 'That is not a JPEG, PNG or WebP image. Export it as one of those and try again.'
    );
  }

  const stored = await putMedia(env, { kind: 'training', bytes: decoded.bytes, contentType: sig.contentType, ext: sig.ext });
  if (!stored.stored) return bad('Could not store the file. ' + (stored.error || ''), 500);

  await capture(env, {
    event: 'training.image_uploaded',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { bytes: decoded.bytes.length, key: stored.key, content_type: sig.contentType },
  });
  return json({ ok: true, media_key: stored.key, bytes: decoded.bytes.length, content_type: sig.contentType });
};
