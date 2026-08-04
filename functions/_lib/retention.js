// activity_log retention — tiered, opt-in, dry-run by default.
//
// Dayan's ruling 2026-08-04. The shape matters more than the numbers:
//
//   NEVER_PRUNE  money / food-safety / contractual events. activity_log is the durable,
//                append-only trail behind refunds, cancellations and cold-chain temperature
//                logs. Square owns the money; this owns the "who did what, when". These rows
//                outlive any storage concern and are listed explicitly so a future edit has to
//                make a deliberate decision to remove one.
//   PRUNE_ONLY   high-volume navigation noise with no evidentiary value, deleted after
//                RETENTION_DAYS. This is an ALLOWLIST, not a denylist: an event added next year
//                is retained by default. Getting this backwards is how audit trails disappear.
//   everything else — KEPT.
//
// Size was never the driver: production holds ~78 events/day in a 6.3 MB database against a
// 10 GB limit. This is hygiene, plus keeping the adoption queries fast.
//
// Mirrors .telemetry/tracking-plan.yaml → retention:. Change them together.
// Files under functions/_lib are not routed.

export const RETENTION_DAYS = 180;

// Kept forever. Listed for the reader's benefit as much as the code's — this is the set someone
// must consciously edit to start deleting financial history.
export const NEVER_PRUNE = [
  'order.refunded', 'order.canceled',
  'expense.submitted', 'expense.reviewed',
  'temp_log.recorded',
  'delivery.completed', 'delivery.failed',
  'qbo.invoice_pushed',
  'contract.account_created', 'contract.site_added', 'contract.billing_contact_set',
  'ticket.created', 'ticket.resolved',
];

// The ONLY names this job will ever delete.
export const PRUNE_ONLY = [
  'dashboard.viewed',
  'doc.viewed',
  'order_summary.viewed',
  'customer.viewed',
  'track.rejected',
];

// Guard against the two lists drifting into contradiction. Cheap, and it turns a silent policy
// bug into a loud one.
export function policyConflicts() {
  return PRUNE_ONLY.filter((e) => NEVER_PRUNE.includes(e));
}

/**
 * Sweep old navigation noise.
 * @param {*} env                      Worker env (needs env.DB)
 * @param {object}  [opts]
 * @param {boolean} [opts.dryRun=true] Report only. DEFAULT IS TRUE — every destructive script in
 *                                     this estate defaults to reporting (standing rule).
 * @param {number}  [opts.days]        Override the retention window.
 * @param {number}  [opts.nowMs]       Injectable clock for tests.
 * @returns {Promise<{ok, dry_run, cutoff, days, scanned, deleted, per_event, conflicts, error?}>}
 */
export async function pruneActivityLog(env, opts = {}) {
  const dryRun = opts.dryRun !== false;
  const days = Number.isFinite(opts.days) && opts.days > 0 ? opts.days : RETENTION_DAYS;
  const nowMs = Number.isFinite(opts.nowMs) ? opts.nowMs : Date.now();
  const cutoff = nowMs - days * 86400000;

  const conflicts = policyConflicts();
  const out = { ok: false, dry_run: dryRun, cutoff, days, scanned: 0, deleted: 0, per_event: {}, conflicts };

  if (!env || !env.DB) { out.error = 'no_db'; return out; }
  // A name in both lists means the policy contradicts itself. Refuse rather than guess.
  if (conflicts.length) { out.error = 'policy_conflict'; return out; }

  for (const event of PRUNE_ONLY) {
    let n = 0;
    try {
      const row = await env.DB
        .prepare('SELECT COUNT(*) AS n FROM activity_log WHERE event = ? AND created_at < ?')
        .bind(event, cutoff)
        .first();
      n = (row && row.n) || 0;
    } catch {
      continue; // a counting failure must not abort the sweep
    }
    out.scanned += n;
    out.per_event[event] = n;
    if (!n || dryRun) continue;
    try {
      await env.DB
        .prepare('DELETE FROM activity_log WHERE event = ? AND created_at < ?')
        .bind(event, cutoff)
        .run();
      out.deleted += n;
    } catch {
      /* best-effort: a failed delete is retried next week */
    }
  }
  out.ok = true;
  return out;
}
