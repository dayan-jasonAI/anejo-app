// POST /api/hub/me/purge-request — ask the owner to erase your telemetry.
//   Body: { note?: string }
//   GET  → whether you already have an open request.
//
// Dayan's ruling 2026-08-05: staff READ their own log and REQUEST erasure; the owner executes it.
// The reason is specific to Añejo — every subject in activity_log is an employee, and that log is
// also the EOD/shift accountability evidence, so unilateral self-erasure would let someone delete
// the record of whether they did their job. Requesting is unrestricted; executing is not.
//
// NO MIGRATION. The request IS an activity_log row (`privacy.purge_requested`), and a request
// counts as open until a `privacy.purge_executed` for the same actor appears after it. Both names
// are in PURGE_EXCLUDED, so a purge can never erase the record of having been asked for — which is
// §4.1 clause 3: record the purge in the trail that is kept.
import { json } from '../../../_lib/util.js';
import { currentRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';

async function openRequest(env, actorId) {
  try {
    const req = await env.DB
      .prepare("SELECT created_at FROM activity_log WHERE actor_id=? AND event='privacy.purge_requested' ORDER BY created_at DESC LIMIT 1")
      .bind(actorId).first();
    if (!req) return null;
    const done = await env.DB
      .prepare("SELECT created_at FROM activity_log WHERE actor_id=? AND event='privacy.purge_executed' AND created_at > ? LIMIT 1")
      .bind(actorId, req.created_at).first();
    return done ? null : { requested_at: req.created_at };
  } catch {
    return null;
  }
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await currentRole(env, request);
  if (!ctx) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB || !ctx.distinct_id) return json({ ok: true, open: null });
  return json({ ok: true, open: await openRequest(env, ctx.distinct_id) });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await currentRole(env, request);
  if (!ctx) return json({ error: 'Not signed in.' }, 401);
  if (!ctx.distinct_id) return json({ error: 'This session has no identity to erase.' }, 400);

  let b = {};
  try { b = await request.json(); } catch { /* a note is optional */ }

  // Idempotent: asking twice does not queue two erasures or spam the owner's feed.
  const already = await openRequest(env, ctx.distinct_id);
  if (already) return json({ ok: true, already_open: true, ...already });

  await capture(env, {
    event: 'privacy.purge_requested',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    // The note is free text from a signed-in staff member. Length-capped, and never echoed into
    // any query — it exists so the owner has context, not to be parsed.
    properties: { note_len: b && b.note ? String(b.note).length : 0, note: b && b.note ? String(b.note).slice(0, 300) : null },
  });

  return json({ ok: true, requested: true });
};
