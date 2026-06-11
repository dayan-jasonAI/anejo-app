// /api/hub/admin/backup
//   POST → run a full D1 → R2 backup now, then rotate old backups (30-day retention).
//          Auth: owner session OR a matching X-Cron-Key header (env.CRON_KEY) so a
//          tiny Workers cron can POST this weekly. Constant-time key compare.
//   GET  → owner only: list the most recent backups in R2 + r2_enabled flag.
//
// This is the keystone of Phase 5 — production has no D1 backup until this runs.
// Everything below is defensive: a missing R2 binding returns HTTP 200 with
// { ok:false, reason:'R2 not enabled' } rather than a 5xx, and the backup library
// never throws.
import { json, bad, id, now } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { toJson } from '../../../_lib/hub.js';
import { captureSystem } from '../../../_lib/track.js';
import { runBackup, pruneBackups } from '../../../_lib/backup.js';

const RETENTION_DAYS = 30;

// Constant-time string compare so the cron-key check can't be timing-probed.
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

export const onRequestPost = async ({ request, env }) => {
  // Auth: cron key OR owner session.
  let triggeredBy = 'cron';
  if (!cronAuthed(request, env)) {
    const ctx = await requireRole(request, env, ['owner']);
    if (ctx instanceof Response) return ctx;
    triggeredBy = 'owner';
  }

  // R2 absent → degrade gracefully (HTTP 200, not an error code).
  if (!env.MEDIA) {
    return json({ ok: false, stored: false, reason: 'R2 not enabled' }, 200);
  }

  const started = now();
  let backup;
  try {
    backup = await runBackup(env, { triggeredBy, nowMs: started });
  } catch (e) {
    // runBackup is best-effort and shouldn't throw, but never let it bubble.
    backup = { ok: false, stored: false, reason: 'exception', error: (e && e.message) || 'error' };
  }

  // Rotate old backups (best-effort; failure here doesn't fail the backup).
  let prune = { ok: false, deleted: 0 };
  try {
    prune = await pruneBackups(env, { keepDays: RETENTION_DAYS, nowMs: started });
  } catch (e) {
    prune = { ok: false, deleted: 0, reason: 'exception', error: (e && e.message) || 'error' };
  }

  const finished = now();
  const ok = !!(backup && backup.ok);
  const outcome = ok ? 'success' : 'failed';

  // Tracking-plan event.
  await captureSystem(env, {
    event: 'automation.run',
    role: 'system',
    properties: { automation_type: 'd1_backup', outcome },
  });

  // agent_runs row (best-effort).
  if (env.DB) {
    try {
      await env.DB
        .prepare(
          'INSERT INTO agent_runs (id, automation_type, task_type, outcome, actor_type, input, output, duration_ms, tokens, error, started_at, finished_at, created_at) ' +
            "VALUES (?,?,?,?,'system',?,?,?,?,?,?,?,?)"
        )
        .bind(
          id('run'),
          'd1_backup',
          'd1_backup',
          outcome,
          toJson({ triggered_by: triggeredBy }),
          toJson({ backup, prune }),
          finished - started,
          null,
          ok ? null : (backup && (backup.reason || backup.error)) || 'failed',
          started,
          finished
        )
        .run();
    } catch {
      /* best-effort */
    }
  }

  return json({
    ok,
    stored: !!(backup && backup.stored),
    triggered_by: triggeredBy,
    key: backup && backup.key,
    tables: backup && backup.tables,
    rows: backup && backup.rows,
    bytes: backup && backup.bytes,
    reason: backup && backup.reason,
    backup_errors: backup && backup.errors,
    pruned: prune && prune.deleted,
    retention_days: RETENTION_DAYS,
    duration_ms: finished - started,
  });
};

export const onRequestGet = async ({ request, env }) => {
  const ctx = await requireRole(request, env, ['owner']);
  if (ctx instanceof Response) return ctx;

  if (!env.MEDIA) {
    return json({ ok: true, r2_enabled: false, backups: [] });
  }

  let backups = [];
  try {
    const listing = await env.MEDIA.list({ prefix: 'backups/', limit: 1000 });
    const objects = (listing && listing.objects) || [];
    backups = objects
      .map((o) => ({
        key: o.key,
        size: o.size,
        uploaded: o.uploaded ? new Date(o.uploaded).getTime() : null,
        rows: o.customMetadata && o.customMetadata.rows ? Number(o.customMetadata.rows) : undefined,
      }))
      // newest first by key (keys are date+time sortable), then cap at 20.
      .sort((a, b) => String(b.key).localeCompare(String(a.key)))
      .slice(0, 20);
  } catch {
    backups = [];
  }

  return json({ ok: true, r2_enabled: true, backups });
};
