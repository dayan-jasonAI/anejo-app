// /api/hub/owner/purge — execute a staff member's erasure request.
//   GET  ?staff_id=usr_… → PREVIEW: what would go, what would stay, and why. Never deletes.
//   GET  (no staff_id)   → the list of open requests.
//   POST { staff_id, confirm } → executes. `confirm` MUST equal the staff_id exactly.
//
// Owner-only, because the subject is an employee and the log is also the accountability evidence
// (Dayan's ruling 2026-08-05 — see _lib/purge.js for the full reasoning).
//
// FOUR THINGS MAKE THIS DESTRUCTIVE ENDPOINT SAFE, and they are the estate's standing conventions
// for destructive work (§4.1 clause 4):
//   1. Dry run by default — a GET can never delete, and a POST without a matching `confirm` is
//      rejected rather than quietly previewed.
//   2. Owner role only.
//   3. Step-up verification — the owner must retype the exact staff id. This is deliberately not a
//      boolean: `{confirm:true}` is one careless click, retyping `usr_7f3a…` is not, and it also
//      makes it impossible to purge person B while looking at person A's screen.
//   4. Scoped — one actor_id per call. _lib/purge.js refuses a missing id rather than treating it
//      as "everyone".
// And the compliance trail survives: money, food-safety and contract events are excluded in the
// SQL itself, as is `privacy.*`, so the record of the erasure outlives it.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { purgeActorTelemetry, PURGE_EXCLUDED } from '../../../_lib/purge.js';

// Open requests = a privacy.purge_requested with no later privacy.purge_executed for that actor.
async function openRequests(env) {
  try {
    const rows = (await env.DB
      .prepare(`SELECT r.actor_id, MAX(r.created_at) AS requested_at, r.actor_role,
                       COALESCE(st.name,'—') AS name
                  FROM activity_log r LEFT JOIN staff st ON st.id = r.actor_id
                 WHERE r.event='privacy.purge_requested'
                 GROUP BY r.actor_id`)
      .all()).results || [];
    const out = [];
    for (const r of rows) {
      const done = await env.DB
        .prepare("SELECT 1 AS x FROM activity_log WHERE actor_id=? AND event='privacy.purge_executed' AND created_at > ? LIMIT 1")
        .bind(r.actor_id, r.requested_at).first();
      if (!done) out.push(r);
    }
    return out;
  } catch {
    return [];
  }
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  const staffId = new URL(request.url).searchParams.get('staff_id');
  if (!staffId) return json({ ok: true, open_requests: await openRequests(env) });

  // Preview only — purgeActorTelemetry defaults to dryRun.
  const preview = await purgeActorTelemetry(env, { actorId: staffId });
  return json({ ...preview, excluded_events: PURGE_EXCLUDED, confirm_hint: staffId });
};

export const onRequestPost = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const staffId = b && b.staff_id ? String(b.staff_id) : '';
  const confirm = b && b.confirm ? String(b.confirm) : '';
  if (!staffId) return bad('Missing staff_id.');

  // Step-up. Refuse rather than fall back to a preview: a caller who meant to delete and got a
  // 200-with-a-report would reasonably believe it had happened.
  if (confirm !== staffId) {
    return json({
      error: 'Confirmation does not match. Send { confirm: "<the exact staff_id>" } to execute.',
      expected: staffId,
    }, 400);
  }

  const res = await purgeActorTelemetry(env, { actorId: staffId, dryRun: false });
  if (!res.ok) return json(res, res.error === 'no_actor' ? 400 : 500);

  // Record the erasure in the trail that survives it. Attributed to the OWNER who executed it,
  // carrying the subject — so the audit answers "who erased whose data, and when".
  await capture(env, {
    event: 'privacy.purge_executed',
    distinct_id: staffId,           // the subject, so the request/execute pair matches on actor_id
    role: 'system',
    properties: {
      subject_staff_id: staffId,
      executed_by: ctx.distinct_id,
      deleted: res.deleted,
      kept: res.kept,
    },
  });

  return json(res);
};
