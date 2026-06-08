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

export const ALERT_TYPES = [
  'eod_missing', 'temp_excursion', 'delivery_failed', 'late_clock_in',
  'expense_pending', 'low_stock', 'negative_sentiment',
];
export const ALERT_SEVERITIES = ['info', 'warning', 'critical'];

function normSeverity(s) {
  return ALERT_SEVERITIES.includes(s) ? s : 'warning';
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
