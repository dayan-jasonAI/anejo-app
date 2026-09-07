import { json, bad } from '../_lib/util.js';
import { generatePlateImageDetailed } from '../_lib/plate_image.js';
import { getMedia } from '../_lib/media.js';
import { capability, cleanThemePrompt, dataUrlFromBytes, reserveThemeBudget, sameOrigin, strictRateLimit, themeCore } from '../_lib/cajita-theme.js';

export const onRequestGet = async ({ env }) => json({ ok: true, capability: capability(env) });

export const onRequestPost = async ({ request, env }) => {
  if (!env || env.CAJITA_AI_PREVIEW_ENABLED !== 'true') return bad('Theme preview is temporarily unavailable.', 503);
  if (!sameOrigin(request, env)) return bad('Origin not allowed.', 403);
  if (!env.DB || !env.MEDIA || !env.SESSIONS) return bad('Theme preview is temporarily unavailable.', 503);
  const limited = await strictRateLimit(env, request);
  if (limited.unavailable) return bad('Theme preview is temporarily unavailable.', 503);
  if (!limited.ok) return new Response(JSON.stringify({ error: 'Too many requests. Please slow down and try again in a moment.' }), { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(limited.retryAfter) } });
  let body;
  try {
    const reader = request.body && request.body.getReader();
    if (!reader) return bad('Request body required.');
    const chunks = []; let total = 0;
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      total += part.value.byteLength;
      if (total > 4096) { await reader.cancel(); return bad('Request too large.', 413); }
      chunks.push(part.value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return bad('Invalid JSON body.'); }
  const prompt = cleanThemePrompt(body && body.prompt);
  if (!prompt) return bad('Describe the visual theme you want.');
  if (String(body.prompt).length > 500) return bad('Theme description is too long.', 413);
  const reservation = await reserveThemeBudget(env);
  if (!reservation.ok) return bad('Theme preview is temporarily unavailable.', reservation.reason === 'weekly_ai_budget_reached' ? 429 : 503);
  try {
    const generated = await generatePlateImageDetailed(env, prompt, { core: themeCore(prompt), role: 'theme' });
    if (!generated || !generated.key) return bad('Theme preview could not be generated.', 502);
    const object = await getMedia(env, generated.key);
    if (!object) return bad('Theme preview could not be read.', 502);
    const bytes = new Uint8Array(await object.arrayBuffer());
    return json({ ok: true, image: dataUrlFromBytes(bytes, object.httpMetadata && object.httpMetadata.contentType), prompt, provider: generated.provider, model: generated.model });
  } catch {
    return bad('Theme preview could not be generated.', 502);
  }
};
