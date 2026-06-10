// GET  /api/plan?token=<public_token> — fetch a saved plan for the shareable client link.
// POST /api/plan?token=<public_token> — update that plan's daily macros + recomputed bowl sizing.
//   The public_token is the access secret for this one plan; it lets the client (or trainer) who
//   holds the link adjust their goals and have bowl size + price re-derive. Scoped to macro fields
//   only — no other client data is reachable.
// Public read: the random public_token is the access secret (no session needed).
import { json, bad, now } from '../_lib/util.js';
import { computeSizing } from '../_lib/sizing.js';

export const onRequestGet = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return bad('Missing plan token.');

  const row = await env.DB.prepare(
    `SELECT p.daily_calories, p.daily_protein_g, p.daily_carbs_g, p.daily_fat_g, p.daily_fiber_g,
            p.weekly_bowl_count, p.meal_plan_tier, p.bowl_rotation, p.rationale, p.lifestyle_notes, p.status,
            p.meals_per_day,
            c.name AS client_name, c.primary_goal, c.activity_level, c.lang
       FROM plans p JOIN clients c ON c.id = p.client_id
      WHERE p.public_token = ?`
  ).bind(token).first();
  if (!row) return bad('Plan not found.', 404);

  const parse = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
  // Recompute sizing from the stored daily target so older saved plans also get the new fields.
  const sizing = computeSizing(row.daily_calories, row.meals_per_day);
  return json({
    intake: {
      audience: 'trainer', name: row.client_name,
      primary_goal: row.primary_goal, activity_level: row.activity_level, lang: row.lang || 'en',
    },
    plan: {
      daily_calories: row.daily_calories, daily_protein_g: row.daily_protein_g, daily_carbs_g: row.daily_carbs_g,
      daily_fat_g: row.daily_fat_g, daily_fiber_g: row.daily_fiber_g,
      bowl_rotation: parse(row.bowl_rotation, {}),
      rationale: row.rationale, lifestyle_notes: parse(row.lifestyle_notes, []),
      ...sizing,
    },
    status: row.status,
  });
};

export const onRequestPost = async ({ request, env }) => {
  if (!env.DB) return bad('Database not configured.', 500);
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return bad('Missing plan token.');

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  const row = await env.DB
    .prepare('SELECT id, daily_calories, meals_per_day FROM plans WHERE public_token = ?')
    .bind(token).first();
  if (!row) return bad('Plan not found.', 404);

  const num = (v) => (v === '' || v == null || isNaN(Number(v))) ? null : Math.round(Number(v));
  const cal = b.daily_calories !== undefined ? num(b.daily_calories) : row.daily_calories;
  if (!cal || cal < 800 || cal > 6000) return bad('Daily calories must be between 800 and 6000.');
  const meals = b.meals_per_day !== undefined ? num(b.meals_per_day) : row.meals_per_day;

  // Recompute bowl size + per-bowl price from the edited daily target (server is authoritative).
  const s = computeSizing(cal, meals);

  const fields = [], vals = [];
  for (const k of ['daily_calories', 'daily_protein_g', 'daily_carbs_g', 'daily_fat_g', 'daily_fiber_g']) {
    if (b[k] !== undefined) { fields.push(`${k} = ?`); vals.push(num(b[k])); }
  }
  fields.push('meals_per_day = ?', 'bowl_size_oz = ?', 'bowl_size_factor = ?', 'per_bowl_price_cents = ?', 'updated_at = ?');
  vals.push(s.meals_per_day, s.bowl_size_oz, s.bowl_size_factor, Math.round(s.per_bowl_price_usd * 100), now());
  vals.push(row.id);

  await env.DB.prepare(`UPDATE plans SET ${fields.join(', ')} WHERE public_token IS NOT NULL AND id = ?`).bind(...vals).run();
  return json({ ok: true, ...s });
};
