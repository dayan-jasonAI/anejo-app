import { json, bad } from '../_lib/util.js';
import { generatePlateImageDetailed } from '../_lib/plate_image.js';
import { getMedia } from '../_lib/media.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { capability, cleanThemePrompt, dataUrlFromBytes, releaseThemeReservation, reserveThemeBudget, sameOrigin, themeCore } from '../_lib/cajita-theme.js';

export const onRequestGet = async ({ env }) => json({ ok: true, capability: capability(env) });

export const onRequestPost = async ({ request, env }) => {
  if (!sameOrigin(request, env)) return bad('Origin not allowed.', 403);
  const limited = await limitOr429(env, request, { name: 'cajita-theme', limit: 3, windowSec: 3600 });
  if (limited) return limited;
  if (!env || !env.DB || !env.MEDIA) return bad('Theme preview is temporarily unavailable.', 503);
  let body;
  try {
    if (Number(request.headers.get('content-length') || 0) > 4096) return bad('Request too large.', 413);
    body = await request.json();
  } catch { return bad('Invalid JSON body.'); }
  const prompt = cleanThemePrompt(body && body.prompt);
  if (!prompt) return bad('Describe the visual theme you want.');
  const reservation = await reserveThemeBudget(env);
  if (!reservation.ok) return bad('Theme preview is temporarily unavailable.', reservation.reason === 'weekly_ai_budget_reached' ? 429 : 503);
  try {
    const generated = await generatePlateImageDetailed(env, prompt, { core: themeCore(prompt), role: 'theme' });
    if (!generated || !generated.key) return bad('Theme preview could not be generated.', 502);
    const object = await getMedia(env, generated.key);
    if (!object) return bad('Theme preview could not be read.', 502);
    const bytes = new Uint8Array(await object.arrayBuffer());
    await releaseThemeReservation(env, reservation.reservationId);
    return json({ ok: true, image: dataUrlFromBytes(bytes, object.httpMetadata && object.httpMetadata.contentType), prompt, provider: generated.provider, model: generated.model });
  } catch {
    return bad('Theme preview could not be generated.', 502);
  }
};
