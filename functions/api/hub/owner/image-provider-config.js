// /api/hub/owner/image-provider-config — owner-configurable plate-image provider chain
// (stored in KV, see _lib/plate_image.js). Lets the owner reorder OpenAI/Gemini/Workers AI or
// disable one (e.g. if a key gets revoked) without a redeploy.
//   GET  → { ok, config:{order,disabled}, providers }
//   POST { order?, disabled? } → saves, returns config.
// Owner-only. Takes effect on the NEXT image generated (nothing to invalidate — the chain reads
// this config fresh on every call).
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { getImageProviderConfig, setImageProviderConfig, IMAGE_PROVIDERS } from '../../../_lib/plate_image.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  return json({ ok: true, config: await getImageProviderConfig(env), providers: IMAGE_PROVIDERS });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const r = await setImageProviderConfig(env, b || {});
  if (!r.ok) return bad(r.error || 'Could not save.', 400);
  return json({ ok: true, config: r.config });
};
