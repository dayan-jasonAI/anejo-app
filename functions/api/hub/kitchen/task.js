// The batch timer — the PROMPTED half of measured prep time.
//   GET  /api/hub/kitchen/task                → the cook's running batch (if any) + the item picker
//   POST /api/hub/kitchen/task { action:'start', menu_item_id|label, qty }
//   POST /api/hub/kitchen/task { action:'stop' }      → Done: the row is measured
//   POST /api/hub/kitchen/task { action:'cancel' }    → wrong pick: the row is thrown away
//
// Dayan, 2026-09-16: "prompting them or asking them how long does it take you or what process are
// you going to start." An order measures itself for free when it is marked ready (kitchen-ready →
// prep-actuals.js); this is for the work that is not an order — 60 lb of pernil, a tray of rice,
// a hundred bowls of the same thing before service.
//
// NO PIN. A PIN gates a state transition someone is accountable for — prep_start, mark_ready,
// kitchen_clear. Starting a stopwatch changes nothing about an order or about money, and a prompt
// in front of it is exactly the friction that would make cooks stop recording. It is attributed to
// the signed-in cook, like a bowl check-off or a photo.
import { json, bad } from '../../../_lib/util.js';
import { requireRole, currentStaff } from '../../../_lib/roles.js';
import { capture } from '../../../_lib/track.js';
import { id, now } from '../../../_lib/hub.js';
import { openBatch, closeOpenBatch, parseQty } from '../../../_lib/prep-actuals.js';

const MAX_LABEL = 80;

/** The picker's list: every sellable item, small enough to search on the tablet without a fetch. */
async function pickerItems(env) {
  try {
    const res = await env.DB.prepare(
      `SELECT id, name, name_es, prep_minutes FROM menu_items WHERE active = 1
        ORDER BY CASE kind WHEN 'bowl' THEN 0 WHEN 'drink' THEN 1 ELSE 2 END, sort, name`
    ).all();
    return (res && res.results) || [];
  } catch { return []; }
}

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const staff = await currentStaff(env, request);
  const [running, items] = await Promise.all([
    staff ? openBatch(env, staff.id) : Promise.resolve(null),
    pickerItems(env),
  ]);
  return json({ ok: true, running: running || null, items, staff_id: (staff && staff.id) || null });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;

  const staff = await currentStaff(env, request);
  if (!staff) return bad('No staff profile for this session.', 403);

  let b = {};
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const action = String((b && b.action) || '').trim();
  if (!['start', 'stop', 'cancel'].includes(action)) return bad('Unknown action.');
  const ts = now();

  if (action === 'start') {
    const menuItemId = String((b && b.menu_item_id) || '').trim() || null;
    const label = String((b && b.label) || '').trim().slice(0, MAX_LABEL) || null;
    if (!menuItemId && !label) return bad('Say what you are starting. / Di qué vas a empezar.');
    const q = parseQty(b && b.qty);
    if (q.error) return bad(q.error);

    // The item's own estimate is snapshotted as what the system predicted. It is the estimate for
    // ONE — the model has no quantity term (see kitchen-timing.js) — so it is stored beside the qty
    // rather than multiplied by it. Inventing a formula here is what this whole table exists to
    // avoid; the rows will answer the question honestly once there are enough of them.
    let item = null;
    if (menuItemId) {
      item = await env.DB.prepare('SELECT id, name, prep_minutes FROM menu_items WHERE id = ?').bind(menuItemId).first();
      if (!item) return bad('That item is not on the menu. / Ese artículo no está en el menú.', 404);
    }

    // A cook who starts something else has finished (or abandoned) the last thing. Record it for
    // the minutes it really ran rather than dropping it — a silently discarded measurement is the
    // one outcome that would teach the kitchen this feature does not work.
    const closed = await closeOpenBatch(env, staff.id, ts, 'closed by starting another task');

    const rowId = id('pra');
    await env.DB.prepare(
      `INSERT INTO prep_actuals (id, kind, order_id, menu_item_id, label, qty, started_at, ended_at,
         minutes, estimate_minutes, items, staff_id, staff_name, note, created_at)
       VALUES (?, 'batch', NULL, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, ?, NULL, ?)`
    ).bind(
      rowId, item ? item.id : null, item ? null : label, q.qty, ts,
      item && Number.isInteger(item.prep_minutes) ? item.prep_minutes : null,
      staff.id, staff.name || null, ts,
    ).run();

    await capture(env, {
      event: 'kitchen.batch_started',
      distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
      properties: { menu_item_id: item ? item.id : null, qty: q.qty, closed_previous: !!closed },
    });
    const running = await openBatch(env, staff.id);
    return json({ ok: true, running, closed_previous: closed || null });
  }

  const running = await openBatch(env, staff.id);
  if (!running) return bad('Nothing is running. / No hay nada corriendo.', 409);

  if (action === 'cancel') {
    // Cancel is the cook saying "I picked the wrong thing", not "this took no time". The row is
    // deleted rather than measured — a zero-minute pernil would poison the median for months.
    await env.DB.prepare("DELETE FROM prep_actuals WHERE id = ? AND kind = 'batch' AND ended_at IS NULL").bind(running.id).run();
    return json({ ok: true, canceled: true, running: null });
  }

  const done = await closeOpenBatch(env, staff.id, ts, null);
  if (!done) return bad('Could not save the time. Please try again. / No se pudo guardar el tiempo. Inténtalo de nuevo.', 503);
  await capture(env, {
    event: 'kitchen.batch_recorded',
    distinct_id: ctx.distinct_id, role: ctx.role, team: ctx.team,
    properties: { menu_item_id: done.menu_item_id || null, qty: done.qty, minutes: done.minutes },
  });
  return json({ ok: true, recorded: done, running: null });
};
