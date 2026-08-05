// Per-person telemetry purge — the user's half of "read and purge".
//
// WHY THIS EXISTS, AND WHY IT IS NOT RETENTION.
// _lib/retention.js sweeps old NOISE on a schedule: time-triggered, system-owned, five event names.
// This is the other thing entirely — request-triggered, person-scoped, and it erases the record of
// ONE named individual because they asked. The estate rule (TELEMETRY_ESTATE.md §4.1) is explicit
// that a tiered-retention policy, however good, does not satisfy it: *"Purge is not retention …
// Both must exist."* Añejo shipped excellent retention two days before this and it read as
// "handled". It wasn't.
//
// WHO THE SUBJECT IS HERE — this is the unusual part of Añejo and the reason the authority sits
// with the owner. Every human in activity_log is STAFF (owner, kitchen, driver); no client, vendor
// or trainer has ever appeared. So the log being purged is simultaneously a person's behavioural
// record AND the business's accountability evidence — EOD compliance, shift history, the adoption
// screen. Dayan's ruling 2026-08-05: **staff may READ their own log and REQUEST erasure; the owner
// executes it.** A driver cannot unilaterally delete the evidence of whether they filed EOD
// reports. That is a deliberate limit on the rule as literally written, taken with the reason
// stated rather than by quietly narrowing the scope.
//
// WHY ERASING shift.* AND eod_report.* IS SAFE — verify this before ever widening the exclusions.
// The obvious objection to purging a staff member's log is that it would destroy the EOD/shift
// evidence the owner relies on, and payroll with it. It does not: `shifts` and `eod_reports` are
// REAL TABLES (migrations/0003_hub.sql). Clock-in does `INSERT INTO shifts`, EOD submit does
// `INSERT INTO eod_reports`, and every consumer that matters — payroll prep, the compliance
// automations — reads THOSE, never activity_log. The activity_log rows are a telemetry MIRROR of
// events whose system of record lives elsewhere. Purging them removes the behavioural copy and
// leaves the employment record untouched, which is exactly the split §4.1 clause 3 asks for.
// One honest consequence: /hub/owner/adoption reads activity_log, so a purged person's past
// activity stops counting there. That is erasure working, not a bug — and because adoption
// computes live rather than from a rollup, no stale derived copy survives (clause 2).
//
// WHAT SURVIVES A PURGE, AND WHY.
// §4.1 clause 3: telemetry records *how the product was used*; a compliance trail records *what was
// done*. The former is purgeable, the latter is not — "an owner who can erase their own admin trail
// has an audit log in name only". Añejo keeps both in one table, so the split is by event name:
//   · KEEP the NEVER_PRUNE set — money, food safety, contracts. Reused verbatim from retention.js
//     rather than re-listed, so the two policies cannot drift apart. Same list, same reason.
//   · KEEP privacy.* — the purge record must outlive the purge, or the erasure itself is
//     unauditable. This is clause 3's "record the purge itself *in* the latter".
//   · PURGE everything else belonging to that actor.
//
// Files under functions/_lib are not routed.
import { NEVER_PRUNE } from './retention.js';

// The purge record must survive the purge that created it.
export const PRIVACY_EVENTS = ['privacy.purge_requested', 'privacy.purge_executed'];

/** Event names a purge will never remove: the compliance trail plus the purge record itself. */
export const PURGE_EXCLUDED = Object.freeze([...NEVER_PRUNE, ...PRIVACY_EVENTS]);

/**
 * Preview or execute the erasure of one person's telemetry.
 *
 * @param {*} env                        Worker env (needs env.DB)
 * @param {object}  opts
 * @param {string}  opts.actorId         The staff id whose rows are in scope. REQUIRED — there is
 *                                       deliberately no "purge everyone" mode.
 * @param {boolean} [opts.dryRun=true]   Report only. DEFAULT TRUE, per the estate's standing rule
 *                                       that every destructive script defaults to reporting.
 * @returns {Promise<{ok, dry_run, actor_id, purgeable, kept, per_event, deleted, error?}>}
 */
export async function purgeActorTelemetry(env, opts = {}) {
  const actorId = opts.actorId;
  const dryRun = opts.dryRun !== false;
  const out = {
    ok: false, dry_run: dryRun, actor_id: actorId || null,
    purgeable: 0, kept: 0, deleted: 0, per_event: {}, kept_per_event: {},
  };

  if (!env || !env.DB) { out.error = 'no_db'; return out; }
  // No actor means no scope. Refusing beats interpreting a missing id as "all rows".
  if (!actorId || typeof actorId !== 'string') { out.error = 'no_actor'; return out; }

  const holes = PURGE_EXCLUDED.map(() => '?').join(',');

  // What WOULD go, and what stays — both reported, because a purge that silently keeps things is
  // as misleading as one that silently removes them.
  try {
    const rows = (await env.DB
      .prepare(`SELECT event, COUNT(*) AS n FROM activity_log
                 WHERE actor_id = ? AND event NOT IN (${holes})
                 GROUP BY event ORDER BY n DESC`)
      .bind(actorId, ...PURGE_EXCLUDED)
      .all()).results || [];
    for (const r of rows) { out.per_event[r.event] = r.n; out.purgeable += r.n; }

    const keptRows = (await env.DB
      .prepare(`SELECT event, COUNT(*) AS n FROM activity_log
                 WHERE actor_id = ? AND event IN (${holes})
                 GROUP BY event ORDER BY n DESC`)
      .bind(actorId, ...PURGE_EXCLUDED)
      .all()).results || [];
    for (const r of keptRows) { out.kept_per_event[r.event] = r.n; out.kept += r.n; }
  } catch {
    out.error = 'read_failed';
    return out;
  }

  if (dryRun) { out.ok = true; return out; }

  // One scoped DELETE. The exclusion list is in the SQL, not applied afterwards, so there is no
  // window in which a compliance row is selected for removal.
  try {
    await env.DB
      .prepare(`DELETE FROM activity_log WHERE actor_id = ? AND event NOT IN (${holes})`)
      .bind(actorId, ...PURGE_EXCLUDED)
      .run();
    out.deleted = out.purgeable;
    out.ok = true;
  } catch {
    out.error = 'delete_failed';
  }
  return out;
}
