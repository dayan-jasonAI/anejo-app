// Telemetry capture for the HUB.
//   capture(env, { event, distinct_id, role, actor_type='human', team, properties })
// Behavior:
//   1) Always writes a row to activity_log (so the owner command center has a live
//      feed even without PostHog). Best-effort: never throws on the caller.
//   2) If POSTHOG_KEY/POSTHOG_HOST are present, also POSTs the event to PostHog
//      ($groups for business/team), snake_case object.action naming convention.
// Files under functions/_lib are not routed.
import { id, now } from './util.js';

const DEFAULT_HOST = 'https://us.i.posthog.com';

// Write the mirror row to activity_log. Swallows errors (logging must not break ops).
async function logActivity(env, { event, distinct_id, role, actor_type, team, properties }) {
  if (!env || !env.DB) return;
  try {
    await env.DB
      .prepare(
        'INSERT INTO activity_log (id, event, actor_id, actor_role, actor_type, team, properties, created_at) VALUES (?,?,?,?,?,?,?,?)'
      )
      .bind(
        id('act'),
        event,
        distinct_id || null,
        role || null,
        actor_type || 'human',
        team || null,
        properties ? JSON.stringify(properties) : null,
        now()
      )
      .run();
  } catch {
    /* best-effort: never throw from telemetry */
  }
}

// Fire the PostHog capture. No-op if env vars absent.
async function postHog(env, { event, distinct_id, role, actor_type, team, properties }) {
  if (!env || !env.POSTHOG_KEY) return;
  const host = (env.POSTHOG_HOST || DEFAULT_HOST).replace(/\/$/, '');
  const groups = {};
  groups.business = 'biz_anejo';
  if (team) groups.team = `team_${team}`;
  const payload = {
    api_key: env.POSTHOG_KEY,
    event,
    distinct_id: distinct_id || 'anonymous',
    timestamp: new Date().toISOString(),
    properties: {
      ...(properties || {}),
      actor_id: distinct_id || null,
      actor_role: role || null,
      actor_type: actor_type || 'human',
      team: team || null,
      platform: (properties && properties.platform) || 'api',
      $groups: groups,
    },
  };
  try {
    await fetch(`${host}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    /* best-effort */
  }
}

// Main entry. Returns nothing useful; safe to fire-and-forget or await.
export async function capture(env, opts = {}) {
  if (!opts || !opts.event) return;
  const norm = {
    event: opts.event,
    distinct_id: opts.distinct_id,
    role: opts.role,
    actor_type: opts.actor_type || 'human',
    team: opts.team,
    properties: opts.properties || {},
  };
  // activity_log first (it's the always-on feed), then PostHog.
  await logActivity(env, norm);
  await postHog(env, norm);
}

// Convenience for system/automation events.
export function captureSystem(env, opts = {}) {
  return capture(env, { ...opts, actor_type: 'system' });
}
