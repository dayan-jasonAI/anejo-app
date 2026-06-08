// Kitchen checklists.
//   GET  /api/hub/kitchen/checklist/submit?type=opening → active templates for the kitchen
//   POST /api/hub/kitchen/checklist/submit
//        body: { checklist_id?, checklist_type, items:[{item_key,label,checked,passed,note,photo}] }
//   Creates a checklist_run + checklist_items rows, then fires checklist.completed.
import { json, bad } from '../../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../../_lib/roles.js';
import { capture } from '../../../../_lib/track.js';
import { id, now, bit } from '../../../../_lib/hub.js';

const KITCHEN_TYPES = ['opening', 'closing', 'prep', 'sanitation', 'procedure'];

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const url = new URL(request.url);
  const type = url.searchParams.get('type');
  const stmt = type
    ? env.DB.prepare(
        "SELECT * FROM checklists WHERE active = 1 AND checklist_type = ? AND (team = 'kitchen' OR team IS NULL) ORDER BY name"
      ).bind(type)
    : env.DB.prepare(
        "SELECT * FROM checklists WHERE active = 1 AND (team = 'kitchen' OR team IS NULL) ORDER BY checklist_type, name"
      );
  const { results } = await stmt.all();
  return json({ checklists: results || [] });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const staff = await currentStaff(env, request);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const checklistType = (b && b.checklist_type || '').toString();
  if (!KITCHEN_TYPES.includes(checklistType)) {
    return bad(`checklist_type must be one of ${KITCHEN_TYPES.join(', ')}.`);
  }
  const items = Array.isArray(b && b.items) ? b.items : [];
  if (!items.length) return bad('At least one item result is required.');

  // Resolve a template if provided/known; otherwise allow an ad-hoc run.
  let checklistId = (b && b.checklist_id) || null;
  if (checklistId) {
    const tpl = await env.DB.prepare('SELECT id FROM checklists WHERE id = ?').bind(checklistId).first();
    if (!tpl) checklistId = null;
  }

  const itemsTotal = items.length;
  const itemsFailed = items.filter((it) => it && it.passed === false).length;

  const runId = id('crun');
  const ts = now();

  // checklist_runs.checklist_id is NOT NULL with an FK; if no template, create a
  // lightweight ad-hoc template row so the run is well-formed.
  if (!checklistId) {
    checklistId = id('chk');
    await env.DB.prepare(
      `INSERT INTO checklists (id, name, checklist_type, team, items, active, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(
      checklistId,
      `${checklistType} (ad-hoc)`,
      checklistType,
      'kitchen',
      JSON.stringify(items.map((it) => ({ key: it.item_key, label: it.label }))),
      1, ts, ts
    ).run();
  }

  await env.DB.prepare(
    `INSERT INTO checklist_runs (id, checklist_id, staff_id, checklist_type, team, items_total, items_failed, status, completed_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    runId, checklistId, staff ? staff.id : null, checklistType, 'kitchen',
    itemsTotal, itemsFailed, 'completed', ts, ts, ts
  ).run();

  for (const it of items) {
    await env.DB.prepare(
      `INSERT INTO checklist_items (id, run_id, item_key, label, checked, passed, note, photo, created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`
    ).bind(
      id('citem'), runId, (it && it.item_key) || null, (it && it.label) || null,
      bit(it && it.checked), it && it.passed === false ? 0 : 1,
      (it && it.note) || null, (it && it.photo) || null, ts
    ).run();
  }

  await capture(env, {
    event: 'checklist.completed',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { checklist_type: checklistType, items_total: itemsTotal, items_failed: itemsFailed },
  });

  return json({ ok: true, run_id: runId, items_total: itemsTotal, items_failed: itemsFailed });
};
