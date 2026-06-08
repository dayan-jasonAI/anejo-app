// POST /api/hub/track — accepts client-side track events from the PWA and forwards
// them through _lib/track.js (activity_log mirror + PostHog). The actor identity is
// taken from the authenticated session, NOT trusted from the body, so events can't be
// spoofed. Body: { event, properties }.
import { json, bad } from '../../_lib/util.js';
import { currentRole } from '../../_lib/roles.js';
import { capture } from '../../_lib/track.js';

export const onRequestPost = async ({ request, env }) => {
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const event = (b && b.event || '').toString().trim();
  if (!event) return bad('Missing event.');

  const ctx = await currentRole(env, request);
  if (!ctx) return json({ error: 'Not signed in.' }, 401);

  const properties = (b && typeof b.properties === 'object' && b.properties) || {};
  if (!properties.platform) properties.platform = 'pwa';

  await capture(env, {
    event,
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    actor_type: 'human',
    team: ctx.team,
    properties,
  });

  return json({ ok: true });
};
