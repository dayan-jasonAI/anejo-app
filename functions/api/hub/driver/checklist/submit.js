// POST /api/hub/driver/checklist/submit — record a vehicle/loadout/dropoff checklist run.
// Body: {
//   checklist_type: 'vehicle'|'loadout'|'dropoff',
//   checklist_id?: string,            // template id, optional
//   ref_type?: 'delivery'|'shift'|'order', ref_id?: string,
//   items: [ { key, label, checked, passed?, note?, photo? } ]
// }
// Creates a checklist_runs row + checklist_items rows.
// Fires delivery.checklist_completed.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now } from '../../../../_lib/hub.js';

const TYPES = ['vehicle', 'loadout', 'dropoff'];

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['driver', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this account.', 403);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const checklistType = TYPES.includes(b && b.checklist_type) ? b.checklist_type : null;
  if (!checklistType) return bad('checklist_type must be one of: ' + TYPES.join(', '));
  const items = Array.isArray(b && b.items) ? b.items : [];
  if (!items.length) return bad('items must be a non-empty array.');

  const ts = now();
  const itemsTotal = items.length;
  const itemsFailed = items.filter((it) => it && it.passed === false).length;

  // checklist_id may reference a template; null is allowed (ad-hoc run). The column
  // is NOT NULL in schema, so fall back to a synthetic per-type id.
  const checklistId = (b && b.checklist_id) || `chk_${checklistType}`;
  const runId = id('run');

  await env.DB
    .prepare(
      'INSERT INTO checklist_runs (id, checklist_id, staff_id, checklist_type, team, ref_type, ref_id, items_total, items_failed, status, completed_at, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
    )
    .bind(runId, checklistId, staff.id, checklistType, staff.team || 'delivery', b.ref_type || null, b.ref_id || null, itemsTotal, itemsFailed, 'completed', ts, ts, ts)
    .run();

  for (const it of items) {
    await env.DB
      .prepare('INSERT INTO checklist_items (id, run_id, item_key, label, checked, passed, note, photo, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .bind(
        id('cki'),
        runId,
        (it && it.key) || null,
        (it && it.label) || null,
        it && it.checked ? 1 : 0,
        it && it.passed === false ? 0 : 1,
        (it && it.note) || null,
        it && it.photo ? String(it.photo).slice(0, 200000) : null,
        ts
      )
      .run();
  }

  await capture(env, {
    event: 'delivery.checklist_completed',
    distinct_id: ctx.distinct_id,
    role: ctx.role,
    team: ctx.team,
    properties: { checklist_type: checklistType, items_total: itemsTotal, items_failed: itemsFailed, platform: 'pwa' },
  });

  return json({ ok: true, run: { id: runId, checklist_type: checklistType, items_total: itemsTotal, items_failed: itemsFailed } });
};
