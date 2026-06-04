// /api/clients
//   GET  -> list the signed-in trainer's clients (with latest plan summary)
//   POST -> create a client, generate + save an AI plan, return both
import { json, bad, id, now } from '../_lib/util.js';
import { trainerSession } from '../_lib/guard.js';

export const onRequestGet = async ({ request, env }) => {
  const sess = await trainerSession(env, request);
  if (!sess) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);

  const { results } = await env.DB
    .prepare(
      `SELECT c.id, c.name, c.email, c.primary_goal, c.status, c.created_at,
              p.id AS plan_id, p.daily_calories, p.meal_plan_tier, p.public_token, p.status AS plan_status
         FROM clients c
         LEFT JOIN plans p ON p.id = (SELECT id FROM plans WHERE client_id=c.id ORDER BY created_at DESC LIMIT 1)
        WHERE c.trainer_id=?
        ORDER BY c.created_at DESC`
    )
    .bind(sess.uid)
    .all();

  return json({ clients: results || [] });
};

export const onRequestPost = async ({ request, env }) => {
  const sess = await trainerSession(env, request);
  if (!sess) return json({ error: 'Not signed in.' }, 401);
  if (!env.DB) return bad('Database not configured.', 500);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const name = (b.name || '').trim();
  if (!name) return bad('Client name is required.');

  // Accept metric directly, or convert from imperial if provided.
  const height_cm = b.height_cm != null ? Number(b.height_cm)
    : b.height_in != null ? +(Number(b.height_in) * 2.54).toFixed(1) : null;
  const weight_kg = b.weight_kg != null ? Number(b.weight_kg)
    : b.weight_lb != null ? +(Number(b.weight_lb) * 0.4535924).toFixed(1) : null;

  const conditions = Array.isArray(b.conditions) ? b.conditions : [];
  const allergens = Array.isArray(b.allergens) ? b.allergens : [];
  const lang = b.lang === 'es' ? 'es' : 'en';

  const cid = id('cl');
  const ts = now();
  try {
    await env.DB
      .prepare(
        `INSERT INTO clients (id, trainer_id, email, name, age, sex, height_cm, weight_kg,
            activity_level, primary_goal, conditions, allergens, preferences, lang, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .bind(cid, sess.uid, (b.email || '').trim() || null, name,
            b.age != null ? Number(b.age) : null, b.sex || null, height_cm, weight_kg,
            b.activity_level || null, b.primary_goal || null,
            JSON.stringify(conditions), JSON.stringify(allergens), (b.preferences || '').trim() || null,
            lang, 'pending', ts, ts)
      .run();
  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) return bad('A client with that email already exists.', 409);
    throw e;
  }

  // Generate the plan via the existing engine (internal subrequest, same project).
  const origin = new URL(request.url).origin;
  const genResp = await fetch(`${origin}/api/plans/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audience: 'trainer', name, age: b.age, sex: b.sex,
      height_cm, weight_kg, activity_level: b.activity_level, primary_goal: b.primary_goal,
      conditions, allergens, preferences: b.preferences || '', lang,
    }),
  });
  const gen = await genResp.json().catch(() => ({}));
  if (!genResp.ok) {
    // Client is saved; surface the generator error (e.g., excluded condition) for the UI.
    return json({ client_id: cid, error: gen.error || 'Plan generation failed.' }, genResp.status);
  }

  const pid = id('pl');
  const publicToken = id('pt');
  await env.DB
    .prepare(
      `INSERT INTO plans (id, client_id, version, daily_calories, daily_protein_g, daily_carbs_g,
          daily_fat_g, daily_fiber_g, weekly_bowl_count, meal_plan_tier, bowl_rotation,
          rationale, lifestyle_notes, ai_model, status, public_token, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .bind(pid, cid, 1, gen.daily_calories, gen.daily_protein_g, gen.daily_carbs_g,
          gen.daily_fat_g, gen.daily_fiber_g || null, gen.weekly_bowl_count || null, gen.meal_plan_tier || null,
          JSON.stringify(gen.bowl_rotation || {}), gen.rationale || null,
          JSON.stringify(gen.lifestyle_notes || []), gen.ai_model || null, 'draft', publicToken, ts, now())
    .run();

  await env.DB.prepare('UPDATE clients SET status=?, updated_at=? WHERE id=?').bind('plan_ready', now(), cid).run();

  return json({ client_id: cid, plan_id: pid, public_token: publicToken, plan: gen });
};
