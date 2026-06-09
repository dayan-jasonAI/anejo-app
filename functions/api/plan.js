// GET /api/plan?token=<public_token> — fetch a saved plan for the shareable client link.
// Public read: the random public_token is the access secret (no session needed).
import { json, bad } from '../_lib/util.js';
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
