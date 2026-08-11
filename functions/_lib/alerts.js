// Añejo HUB — alert raising helper for the Owner Command Center.
// Files under functions/_lib are NOT routed.
//
// Alerts are mostly SYSTEM-generated. Any surface or automation can raise one:
//   import { raiseAlert } from '../../_lib/alerts.js';
//   await raiseAlert(env, { alert_type:'temp_excursion', severity:'critical',
//                           title:'Cooler over temp', ref_type:'temp_log', ref_id, team:'kitchen' });
//
// raiseAlert():
//   1) inserts an `alerts` row (idempotent on dedupe_key while status='open'),
//   2) mirrors an `alert.triggered` event through track.js (activity_log + PostHog).
// Best-effort: it never throws on the caller — telemetry/alerts must not break ops.
import { id, now } from './util.js';
import { captureSystem } from './track.js';
import { sendPushTickle } from './push.js';

export const ALERT_TYPES = [
  'eod_missing', 'temp_excursion', 'delivery_failed', 'late_clock_in',
  'expense_pending', 'low_stock', 'negative_sentiment',
  // Instagram performance detection (instagram_insights.js:alertsForSignals) — one type covers
  // all four signals (soft post / weak run / follower trend / silence); title and body carry
  // which one fired, same pattern 'eod_missing' already uses for both a per-staffer miss and the
  // aggregate low-compliance nudge.
  'social_underperform',
  // A high-confidence commercial DM/comment (catering, bulk/corporate, wholesale/partnership,
  // subscription) captured as a lead by _lib/social_leads.js. See migrations/0078_social_leads.sql.
  'social_commercial_lead',
  // Both of these were RAISED from day one and never reached the table: their call sites passed
  // `type:` while raiseAlert reads `opts.alert_type` and returns {ok:false} on the miss — a silent
  // no-op with no error anywhere. The customer-facing half is what makes it bad: Aña tells a
  // person "we're checking with the kitchen" and nobody was ever told to check. Listing them here
  // alongside the fixed call sites so the next reader sees the full set of real alert types.
  'special_request',
  'partner_application',
  // Raised by api/hub/admin/backup.js when the weekly D1 → R2 backup fails. Unlike the two above
  // it was never broken — it passes `alert_type` correctly and has always reached the table — it
  // was simply missing from this list. Recording it because this list is the reference a reader
  // trusts to be the full set, and an alert type that fires in production but is absent here
  // teaches the next person that the list is unreliable.
  'backup_failed',
  // A catering deposit cleared (api/webhooks/square.js). Info, not action: the point is that the
  // date is now BOOKED and a balance plus a headcount deadline exist from this moment on.
  'catering_deposit_paid',
  // An automatic contract charge or a payout was REFUSED by one of the two money safeties — the
  // owner toggle being off, or the amount never having been approved (_lib/autopay.js). Raised as
  // a warning because the invoice is still unpaid and someone has to decide; the refusal itself is
  // the system working, not failing.
  'autopay_refused',
  // The Marketing Expert's feedback to the owner (api/hub/marketing/run.js). She runs and tests
  // the marketing system daily; what she finds has to reach Dayan somewhere he already looks,
  // which is this feed on /hub/owner/. Severity is hers to choose: 'info' for an observation,
  // 'warning' for something costing us output today. Deliberately NOT deduped — two findings on
  // the same day are two things he needs to know, not a repeat.
  'marketing_feedback',
];
// Alert severity is a THREE-level scale and is deliberately not the same scale as
// `tickets.severity` (low|medium|high|urgent). Callers must map onto these three:
//   critical — the whole day's operation breaks unless someone acts now (route unfilled,
//              temp excursion, urgent safety ticket). Only 'critical' turns the owner
//              dashboard red, so anything less must not use it.
//   warning  — a single order/shift needs a human, but the day still runs.
//   info     — FYI, no action required.
export const ALERT_SEVERITIES = ['info', 'warning', 'critical'];

function normSeverity(s) {
  if (ALERT_SEVERITIES.includes(s)) return s;
  // Falling back is safe, but a caller passing e.g. a ticket severity means the alert is
  // silently mis-ranked — log it so miswiring shows up in `wrangler tail` instead of never.
  if (s != null) console.warn('raiseAlert: unknown severity', s, '— falling back to warning');
  return 'warning';
}

// Raise (or de-dupe) an alert. Returns { ok, id, deduped } or { ok:false } on failure.
export async function raiseAlert(env, opts = {}) {
  if (!env || !env.DB || !opts || !opts.alert_type) return { ok: false };
  const alert_type = String(opts.alert_type);
  const severity = normSeverity(opts.severity);
  const dedupe = opts.dedupe_key || null;

  try {
    // If a dedupe_key is given and an open alert already exists, don't duplicate.
    if (dedupe) {
      const existing = await env.DB
        .prepare("SELECT id FROM alerts WHERE dedupe_key = ? AND status = 'open' LIMIT 1")
        .bind(dedupe)
        .first();
      if (existing && existing.id) return { ok: true, id: existing.id, deduped: true };
    }

    const aid = id('alert');
    const t = now();
    await env.DB
      .prepare(
        'INSERT INTO alerts (id, alert_type, severity, title, body, team, ref_type, ref_id, source, dedupe_key, status, created_at, updated_at) ' +
        "VALUES (?,?,?,?,?,?,?,?,?,?,'open',?,?)"
      )
      .bind(
        aid, alert_type, severity,
        opts.title || null, opts.body || null, opts.team || null,
        opts.ref_type || null, opts.ref_id || null,
        opts.source || 'system', dedupe, t, t
      )
      .run();

    // Mirror the tracking-plan event. actor_type is always 'system' for alerts.
    await captureSystem(env, {
      event: 'alert.triggered',
      role: 'system',
      team: opts.team || null,
      properties: { alert_type, severity, actor_type: 'system', ref_type: opts.ref_type || null, ref_id: opts.ref_id || null },
    });

    // Tickle the owner's devices (payload-less web push; SW peeks for context).
    // sendPushTickle never throws and no-ops without VAPID secrets — but keep it
    // wrapped so it can never affect raiseAlert's return.
    try { await sendPushTickle(env, { roles: ['owner'] }); } catch { /* best-effort */ }

    return { ok: true, id: aid, deduped: false };
  } catch {
    return { ok: false };
  }
}

// Acknowledge an open alert. Returns the updated row count via { ok, changed }.
export async function acknowledgeAlert(env, alertId, staffId) {
  if (!env || !env.DB || !alertId) return { ok: false };
  try {
    const r = await env.DB
      .prepare("UPDATE alerts SET status='acknowledged', acknowledged_by=?, acknowledged_at=?, updated_at=? WHERE id=? AND status='open'")
      .bind(staffId || null, now(), now(), alertId)
      .run();
    const changed = (r && r.meta && r.meta.changes) || 0;
    return { ok: true, changed };
  } catch {
    return { ok: false };
  }
}
