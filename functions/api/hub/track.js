// POST /api/hub/track — accepts client-side track events from the PWA and forwards
// them through _lib/track.js (activity_log mirror + PostHog). The actor identity is
// taken from the authenticated session, NOT trusted from the body, so events can't be
// spoofed. Body: { event, properties }.
//
// ALLOWLISTED since 2026-08-04. This used to accept ANY string as an event name, which made it
// the widest door in the telemetry system: every other event enters through a code-reviewed
// capture() call, but this one takes its name from the browser. That is a large part of how the
// HUB accumulated 57 events nobody had planned.
//
// An unknown name is REFUSED (400) **and recorded** as track.rejected. The recording matters more
// than the refusal: a silent 400 would mean an event someone forgot to allowlist just disappears,
// and nobody finds out for months. Instead the rejection lands in the same activity_log the owner
// already reads, carrying the attempted name — so the fix is "add it to the plan and regenerate",
// and the log says exactly which name to add.
//
// The allowlist is GENERATED from .telemetry/tracking-plan.yaml (scripts/gen-track-allowlist.mjs);
// a stale copy fails the test suite before it can deploy.
import { json, bad } from '../../_lib/util.js';
import { currentRole } from '../../_lib/roles.js';
import { capture, captureSystem } from '../../_lib/track.js';
import { isClientEventAllowed } from '../../_lib/track-allowlist.js';

// The attempted name is attacker-controlled text: length-capped before it is stored or echoed.
const MAX_NAME = 120;

export const onRequestPost = async ({ request, env }) => {
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const event = (b && b.event || '').toString().trim();
  if (!event) return bad('Missing event.');

  const ctx = await currentRole(env, request);
  if (!ctx) return json({ error: 'Not signed in.' }, 401);

  // Unknown name → refuse, but leave a trail. Identity still comes from the session, so the
  // rejection is attributable without trusting anything in the body.
  if (!isClientEventAllowed(event)) {
    await captureSystem(env, {
      event: 'track.rejected',
      distinct_id: ctx.distinct_id,
      role: ctx.role,
      team: ctx.team,
      properties: { attempted: event.slice(0, MAX_NAME), reason: 'not_in_plan' },
    });
    return json({
      error: 'Unknown event name. Add it to .telemetry/tracking-plan.yaml and regenerate the allowlist.',
      event: event.slice(0, MAX_NAME),
    }, 400);
  }

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
