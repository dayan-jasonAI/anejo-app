// POST /api/plans/edit  { plan_id, daily_calories?, daily_protein_g?, daily_carbs_g?, daily_fat_g?, daily_fiber_g?, trainer_notes? }
// Lets a trainer adjust a generated plan's macros / notes before sending. Marks trainer_edited.
import { json, bad, now } from '../../_lib/util.js';
import { trainerSession } from '../../_lib/guard.js';

export const onRequestPost = async ({ request, env }) => {
  const sess = await trainerSession(env, request);
  if (!sess) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }
  const planId = (b.plan_id || '').trim();
  if (!planId) return bad('Missing plan_id.');

  const owns = await env.DB
    .prepare('SELECT p.id FROM plans p JOIN clients c ON c.id = p.client_id WHERE p.id = ? AND c.trainer_id = ?')
    .bind(planId, sess.uid).first();
  if (!owns) return bad('Plan not found.', 404);

  const num = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Math.round(Number(v));
  const fields = [], vals = [];
  for (const k of ['daily_calories', 'daily_protein_g', 'daily_carbs_g', 'daily_fat_g', 'daily_fiber_g']) {
    if (b[k] !== undefined) { fields.push(`${k} = ?`); vals.push(num(b[k])); }
  }
  if (b.trainer_notes !== undefined) { fields.push('trainer_notes = ?'); vals.push((b.trainer_notes || '').trim() || null); }
  if (!fields.length) return bad('Nothing to update.');

  fields.push('trainer_edited = 1', 'updated_at = ?');
  vals.push(now(), planId);
  await env.DB.prepare(`UPDATE plans SET ${fields.join(', ')} WHERE id = ?`).bind(...vals).run();
  return json({ ok: true });
};
