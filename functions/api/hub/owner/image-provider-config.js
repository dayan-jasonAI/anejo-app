// /api/hub/owner/image-provider-config — owner-configurable plate-image provider chain
// (stored in KV, see _lib/plate_image.js). Lets the owner reorder OpenAI/Gemini/Workers AI or
// disable one (e.g. if a key gets revoked) without a redeploy.
//   GET  → { ok, config:{order,disabled}, providers }
//   POST { order?, disabled? } → saves, returns config.
// Owner-only. Takes effect on the NEXT image generated (nothing to invalidate — the chain reads
// this config fresh on every call).
import { json, bad } from '../../../_lib/util.js';
import { requireRole, MARKETING_DESK } from '../../../_lib/roles.js';
import { getImageProviderConfig, setImageProviderConfig, IMAGE_PROVIDERS, providerAvailable } from '../../../_lib/plate_image.js';

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  // `available` is the difference between a settings page and a guess. The chain skips an
  // unconfigured provider SILENTLY and falls through to the next one, so an owner who believes
  // OpenAI is first gets Workers AI images and no error anywhere — the exact complaint that
  // started this work. Reporting configured-ness per provider is what makes that visible.
  // Reports only whether a key is BOUND, never the key itself or any part of it.
  const providers = IMAGE_PROVIDERS.map((name) => ({ name, available: providerAvailable(env, name) }));
  return json({ ok: true, config: await getImageProviderConfig(env), providers });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, MARKETING_DESK);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const r = await setImageProviderConfig(env, b || {});
  if (!r.ok) return bad(r.error || 'Could not save.', 400);
  return json({ ok: true, config: r.config });
};
