// Shared plate-image generator for the Creative Studio (chat + Content tab). One place to tune
// the model, the style, and the output handling — so swapping engines later is a single edit.
// Files under _lib are NOT routed.
import { putMedia } from './media.js';

// Leonardo Phoenix 1.0: photographic, strong prompt adherence, supports a negative prompt so we
// can steer AWAY from the glossy "CGI/plastic" look. (Returns raw image bytes, not base64.)
export const IMAGE_MODEL = '@cf/leonardo/phoenix-1.0';

// Natural, appetizing food photography — deliberately NOT editorial/CGI. Reads like a real photo.
const PLATING_STYLE =
  'Natural food photography of a Mediterranean-Cuban meal-prep bowl on a real kitchen counter in ' +
  'soft window daylight, candid slightly-imperfect home plating, real food texture, fresh herbs and ' +
  'vegetables, matte ceramic bowl, warm natural tones, shallow depth of field — looks like a genuine ' +
  'photo a chef snapped on a phone, appetizing and believable.';
const NEGATIVE_PROMPT =
  'CGI, 3D render, digital art, illustration, cartoon, plastic, waxy, artificial, over-glossy, ' +
  'oversaturated, hyperreal, airbrushed, fake, video-game, watermark, text, logo, deformed, blurry.';

// Generate ONE on-brand plate photo → store to R2 → return its short URL (or null on any failure).
// Handles both raw-bytes models (Phoenix/SDXL: ReadableStream/Response) and base64 models (flux).
export async function generatePlateImage(env, prompt) {
  if (!env || !env.AI) return null;
  try {
    const out = await env.AI.run(IMAGE_MODEL, {
      prompt: `${prompt}. ${PLATING_STYLE}`,
      negative_prompt: NEGATIVE_PROMPT,
      width: 1024, height: 1024, num_steps: 30, guidance: 3,
    });
    let stored;
    if (out && typeof out.arrayBuffer === 'function') {
      stored = await putMedia(env, { kind: 'studio', bytes: new Uint8Array(await out.arrayBuffer()), contentType: 'image/jpeg', ext: 'jpg' });
    } else if (out && typeof out.getReader === 'function') {
      stored = await putMedia(env, { kind: 'studio', bytes: new Uint8Array(await new Response(out).arrayBuffer()), contentType: 'image/jpeg', ext: 'jpg' });
    } else {
      const b64 = out && (out.image || (out.images && out.images[0]));
      if (!b64) return null;
      stored = await putMedia(env, { kind: 'studio', dataUrl: `data:image/jpeg;base64,${b64}`, ext: 'jpg' });
    }
    return stored && stored.stored ? stored.url : null;
  } catch { return null; }
}
