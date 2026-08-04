// /api/hub/admin/retention-tick
//   POST → sweep expired navigation noise out of activity_log (tiered policy, see _lib/retention.js).
//          Auth: owner session OR a matching X-Cron-Key header, same shape as backup.js.
//          Runs weekly from cron/worker.js.
//   GET  → owner only: what WOULD be deleted, without deleting it.
//
// DRY RUN IS THE DEFAULT. A POST reports unless it carries { "apply": true } — the standing
// estate rule is that every destructive script defaults to reporting, and this one deletes rows
// from the table that carries the business's audit trail. The cron sends apply:true deliberately.
//
// This endpoint can only ever delete the five names in PRUNE_ONLY. It cannot be talked into
// deleting a money event by any request body — the allowlist is in code, not in the payload.
import { json } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { captureSystem } from '../../../_lib/track.js';
import { pruneActivityLog, RETENTION_DAYS, PRUNE_ONLY, NEVER_PRUNE } from '../../../_lib/retention.js';

function ctEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function cronAuthed(request, env) {
  const k = request.headers.get('x-cron-key');
  return !!(env.CRON_KEY && k && ctEq(k, env.CRON_KEY));
}

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;
  const res = await pruneActivityLog(env, { dryRun: true });
  return json({ ...res, policy: { retention_days: RETENTION_DAYS, prune_only: PRUNE_ONLY, never_prune: NEVER_PRUNE } });
};

export const onRequestPost = async ({ request, env }) => {
  let triggeredBy = 'cron';
  if (!cronAuthed(request, env)) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
    triggeredBy = 'owner';
  }

  // apply=true from EITHER ?apply=1 or { "apply": true }. The query form exists because the cron
  // worker's postPath() always sends a literal '{}' body — without it every scheduled run would
  // silently dry-run forever and the sweep would never actually happen.
  let body = {};
  try { body = await request.json(); } catch { /* no body = dry run */ }
  const q = new URL(request.url).searchParams.get('apply');
  const apply = (body && body.apply === true) || q === '1' || q === 'true';

  const res = await pruneActivityLog(env, { dryRun: !apply });

  // A self-contradicting policy is a bug worth surfacing loudly, not a quiet no-op.
  if (res.error === 'policy_conflict') {
    return json({ ...res, message: 'PRUNE_ONLY and NEVER_PRUNE overlap; refusing to delete.' }, 500);
  }

  // Only record a real sweep. A dry run that logged an event every week would itself become the
  // noise this job exists to remove.
  if (apply && res.ok) {
    await captureSystem(env, {
      event: 'automation.run',
      role: 'system',
      properties: {
        automation_type: 'activity_retention',
        outcome: 'success',
        deleted: res.deleted,
        days: res.days,
        triggered_by: triggeredBy,
      },
    });
  }

  return json(res);
};
