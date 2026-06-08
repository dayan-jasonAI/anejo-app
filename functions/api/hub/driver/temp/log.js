// POST /api/hub/driver/temp/log — cold-chain temperature log entry.
// Body: {
//   item, temp_f (number), context: 'loadout'|'transit'|'dropoff'|'kitchen',
//   threshold_min?, threshold_max?, in_range? (bool; computed from thresholds if omitted),
//   ref_type?, ref_id?, photo?
// }
// Fires temp_log.recorded.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { raiseAlert } from '../../../../_lib/alerts.js';
import { id, now } from '../../../../_lib/hub.js';

const CONTEXTS = ['loadout', 'transit', 'dropoff', 'kitchen'];
// Default cold-chain safe band (°F) when the caller does not supply thresholds.
const DEFAULT_MIN = 33;
const DEFAULT_MAX = 41;

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const tempF = Number(b && b.temp_f);
  if (!Number.isFinite(tempF)) return bad('temp_f must be a number.');
  const context = CONTEXTS.includes(b && b.context) ? b.context : null;
  if (!context) return bad('context must be one of: ' + CONTEXTS.join(', '));

  const thMin = Number.isFinite(Number(b && b.threshold_min)) ? Number(b.threshold_min) : DEFAULT_MIN;
  const thMax = Number.isFinite(Number(b && b.threshold_max)) ? Number(b.threshold_max) : DEFAULT_MAX;
  const inRange = b && typeof b.in_range === 'boolean' ? b.in_range : tempF >= thMin && tempF <= thMax;

  const ts = now();
  const logId = id('temp');
  const photo = b.photo ? String(b.photo).slice(0, 200000) : null;

  await env.DB
    .prepare(
      'INSERT INTO temp_logs (id, staff_id, ref_type, ref_id, item, temp_f, threshold_min, threshold_max, in_range, context, photo, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
    )
    .bind(logId, staff.id, b.ref_type || null, b.ref_id || null, (b.item || '').toString().slice(0, 200) || null, tempF, thMin, thMax, inRange ? 1 : 0, context, photo, ts)
    .run();

  await capture(env, {
    event: 'temp_log.recorded',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { temp_f: tempF, in_range: !!inRange, context, has_photo: !!photo, platform: 'pwa' },
  });

  // Owner alert on cold-chain excursion (critical — food safety).
  if (!inRange) {
    await raiseAlert(env, {
      alert_type: 'temp_excursion',
      severity: 'critical',
      title: 'Temperature excursion',
      body: `${(b.item || 'Item')} at ${tempF}°F (${context}) — safe band ${thMin}–${thMax}°F`,
      team: ctx.team || 'delivery',
      ref_type: 'temp_log', ref_id: logId,
      source: 'surface',
      dedupe_key: `temp_excursion:${logId}`,
    });
  }

  return json({ ok: true, temp_log: { id: logId, temp_f: tempF, in_range: !!inRange, context } });
};
