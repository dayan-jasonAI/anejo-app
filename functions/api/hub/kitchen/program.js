// GET  /api/hub/kitchen/program?date=YYYY-MM-DD&lang=es — today's program meals for every site,
//      with the recipe scaled to the headcount that was actually submitted.
// POST /api/hub/kitchen/program  { op:'log', site_id, meal, ... } — record packing, temperatures
//      and the delivery, which is what the facility's delivery slip is printed from.
//
// Kitchen and owner only. The cook sees the same portions the dietitian signed; nothing here can
// change a portion, because a portion is the approved menu.
import { json, bad } from '../../../_lib/util.js';
import { requireRole } from '../../../_lib/roles.js';
import { etDateOf } from '../../../_lib/hub.js';
import { serviceDay, logService, MEALS } from '../../../_lib/program.js';

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  const url = new URL(request.url);
  const date = isDate(url.searchParams.get('date')) ? url.searchParams.get('date') : etDateOf(Date.now());
  const lang = url.searchParams.get('lang') === 'es' ? 'es' : 'en';
  try {
    const day = await serviceDay(env, date, { lang });
    return json({ ok: true, ...day, lang });
  } catch (e) {
    return bad('Could not load the program for ' + date + ': ' + String((e && e.message) || e).slice(0, 120), 500);
  }
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const ctx = await requireRole(request, env, ['kitchen', 'owner']);
  if (ctx instanceof Response) return ctx;
  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  if (String(b.op || 'log') !== 'log') return bad('Unknown action.');
  if (!isDate(b.service_date)) return bad('A service date is required.');
  if (!MEALS.includes(String(b.meal))) return bad(`Meal must be one of: ${MEALS.join(', ')}.`);
  const r = await logService(env, b, ctx);
  return r.ok ? json(r) : bad(r.error);
};
