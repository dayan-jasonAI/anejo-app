// POST /api/hub/driver/mileage/submit — driver submits mileage for reimbursement.
// Body: { miles (number), route_id?, log_date? (YYYY-MM-DD), note?, auto_calculated? }
// Fires mileage.submitted.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, today } from '../../../../_lib/hub.js';

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const miles = Number(b && b.miles);
  if (!Number.isFinite(miles) || miles <= 0) return bad('miles must be a positive number.');

  const ts = now();
  const mileId = id('mil');
  const auto = b && b.auto_calculated ? 1 : 0;
  const logDate = (b && b.log_date) || today();

  await env.DB
    .prepare(
      'INSERT INTO mileage (id, staff_id, route_id, miles, auto_calculated, log_date, note, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
    )
    .bind(mileId, staff.id, (b && b.route_id) || null, miles, auto, logDate, (b && b.note) || null, 'pending', ts, ts)
    .run();

  await capture(env, {
    event: 'mileage.submitted',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { miles, auto_calculated: !!auto, platform: 'pwa' },
  });

  return json({ ok: true, mileage: { id: mileId, miles, log_date: logDate, status: 'pending' } });
};
