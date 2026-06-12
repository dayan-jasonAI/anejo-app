// POST /api/plans/generate
// Stateless V1 demo endpoint. Takes an intake JSON, calls Claude Sonnet 4.6,
// returns a structured plan. No DB writes — saving + checkout ship in V1.1.
import { limitOr429 } from '../../_lib/ratelimit.js';
import { computeSizing, RECOMMENDED_BOWL_COUNT } from '../../_lib/sizing.js';
import { SITE_BOWLS, SITE_BOWL_NAMES } from '../../_lib/bowlspec.js';

const MODEL = 'claude-sonnet-4-6';

// Conditions excluded from AI plan generation in V1. Any of these → refuse + recommend RD/MD review.
const EXCLUDED_CONDITIONS = new Set([
  't1_diabetes', 'pregnancy', 'postpartum', 'post_surgery',
  'glp1', 'eating_disorder', 'kidney_disease', 'liver_disease',
  'cardiac_disease', 'cancer_treatment'
]);

const ALLOWED_GOALS = new Set([
  'fat_loss', 'muscle_gain', 'recomp', 'performance', 'longevity'
]);
const ALLOWED_ACTIVITY = new Set([
  'sedentary', 'light', 'moderate', 'active', 'very_active'
]);

// The 7-bowl macro template lives in functions/_lib/bowlspec.js (the single source of truth the
// planner, plan page, and kitchen all read). Macros are per STANDARD 16 oz bowl; the kitchen scales
// each by the client's bowl_size_factor.

const SYSTEM_PROMPT = `You are the nutrition planning AI for Añejo Catering Co., a Mediterranean-Cuban longevity bowl service in Palm Beach County, Florida. You generate personalized weekly meal plans for fitness clients of partner gym trainers, clinics, and wellness coaches — and for individuals on the public site.

Your job, given a person's biometrics and goal, is to output:
1. Daily macro targets (calories, protein, carbs, fat, fiber).
2. meals_per_day — how many Añejo bowls/day this plan assumes the person eats (the daily macros get spread evenly across them). This drives how big each bowl is.
3. A weekly Añejo bowl rotation — which of our 7 bowls, and how many of each. ALWAYS use a 12-bowl week (see "Bowl count & sizing").
4. A short rationale (3–5 plain-language sentences explaining the macro choices, the bowl SIZE, and bowl emphasis).
5. Lifestyle notes (5–7 short bullets — training, hydration, sleep, timing).

## Method

Use Mifflin–St Jeor to compute BMR (metric inputs), then apply activity factor:
- sedentary: 1.2
- light: 1.375
- moderate: 1.55
- active: 1.725
- very_active: 1.9

Apply goal adjustment to TDEE:
- fat_loss: −500 kcal/day
- muscle_gain: +300 kcal/day
- recomp: maintenance
- performance: +200 kcal/day
- longevity: maintenance

Macro split:
- Protein: 1.6–2.2 g/kg body weight (lean end for fat-loss / longevity, high end for muscle-gain / performance).
- Fat: 25–35% of total calories.
- Carbs: remainder.
- Fiber target: 14g per 1,000 kcal (round to nearest integer).

## Bowl count & sizing — IMPORTANT, this is how Añejo works now
- We ALWAYS recommend up to 12 bowls per week. ALWAYS output recommended_bowl_count: 12 and a bowl_rotation that sums to 12. (The customer may later choose a 5- or 10-bowl plan instead, but you always recommend 12.)
- We do NOT change the bowl COUNT to fit calories. Instead we change the bowl SIZE. A standard Añejo bowl is 16 oz (~550 kcal). Each person's bowls are portioned to their goal:
  • If their daily target divided across their bowls is LESS than a standard bowl, their bowls are made SMALLER (less food, lower price).
  • If it is MORE than standard, their bowls are made LARGER (more food, higher price — bigger bowls cost more).
- You do NOT compute bowl ounces or prices — the system does that automatically from daily_calories and meals_per_day. Your job is to set accurate daily macros and a sensible meals_per_day.
- meals_per_day: how many Añejo bowls/day the person eats (2–4; default 3). Use 3 for most people. Use 2 for someone who wants Añejo for fewer meals or who has a very high daily target (so each bowl stays a generous single serving). Use 4 only if they prefer smaller, more frequent bowls. Whatever you pick, daily macros are spread evenly across that many bowls.
- In the rationale, describe the bowl size in plain words (e.g. "lighter, smaller bowls," "standard 16 oz bowls," or "larger, higher-calorie bowls") so it matches the goal, and note that bowl price scales with size.

## Bowl emphasis logic
- High blood pressure / cholesterol / metabolic syndrome / prediabetes → favor LIGERO, MAR, COCO, RAIZ, CONGREEN. De-emphasize FUEGO.
- Muscle gain → favor FUEGO, LIGERO, MAR, VIDA (high protein + recovery).
- Fat loss → favor LIGERO, COCO, MAR, VIDA, RAIZ; limit FUEGO.
- Performance → favor FUEGO, LIGERO, MAR, VIDA.
- Longevity → favor VIDA, MAR, RAIZ, CONGREEN (omega-3, fiber, anti-inflammatory).
- Always respect allergens — if "fish", exclude VIDA, MAR, CONGREEN. If "shellfish", exclude COCO. If "dairy", exclude CONGREEN. If "soy", exclude RAIZ and COCO. If "nuts", note FUEGO and LIGERO contain almonds (removable on request). If "pork", note that no current bowls contain pork.

## Output format
Return ONLY a JSON object, no prose before or after, no markdown fences:

{
  "daily_calories": 2100,
  "daily_protein_g": 175,
  "daily_carbs_g": 200,
  "daily_fat_g": 65,
  "daily_fiber_g": 30,
  "meals_per_day": 3,
  "recommended_bowl_count": 12,
  "bowl_rotation": {
    "VIDA": 0, "FUEGO": 0, "LIGERO": 0, "MAR": 0,
    "COCO": 0, "CONGREEN": 0, "RAIZ": 0
  },
  "rationale": "3–5 sentence explanation in plain language, including bowl size.",
  "lifestyle_notes": ["bullet 1", "bullet 2", "..."]
}

## Rails
- The lifestyle_notes array MUST end with this exact bullet: "This plan is for general fitness and wellness. It is not medical advice. Consult your healthcare provider before starting any new nutrition program."
- Never make medical claims. Use "supports," "designed for," "built for." Never use "cures," "prevents," "treats."
- Never recommend going below 1,500 kcal/day for any client, regardless of fat-loss intensity.
- recommended_bowl_count MUST be 12, and the bowl_rotation counts MUST sum to 12.
- Do not invent bowls. Use only: VIDA, FUEGO, LIGERO, MAR, COCO, CONGREEN, RAIZ.
`;

function buildUserPrompt(intake) {
  const voice = intake.audience === 'trainer'
    ? `This plan is generated by a partner trainer for their client. In "rationale" and "lifestyle_notes", refer to "your client" / "they".`
    : `This plan is generated by the person themselves on the public Añejo site. In "rationale" and "lifestyle_notes", address the reader directly as "you" / "your".`;
  const langDirective = intake.lang === 'es'
    ? `LANGUAGE: Write ALL of "rationale" and EVERY item in "lifestyle_notes" in natural, fluent Latin American Spanish. Keep the JSON keys, bowl names (VIDA, FUEGO, LIGERO, MAR, COCO, CONGREEN, RAIZ), and tier ids unchanged. The final "lifestyle_notes" bullet MUST be exactly: "Este plan es para fitness y bienestar general. No es consejo médico. Consulta a tu proveedor de salud antes de comenzar cualquier programa de nutrición."`
    : ``;
  const lines = [
    voice,
    ...(langDirective ? [``, langDirective] : []),
    ``,
    `Generate a plan for the following person:`,
    ``,
    `Name: ${intake.name || '(not provided)'}`,
    `Age: ${intake.age}`,
    `Sex: ${intake.sex}`,
    `Height: ${intake.height_cm} cm`,
    `Weight: ${intake.weight_kg} kg`,
    `Activity level: ${intake.activity_level}`,
    `Primary goal: ${intake.primary_goal}`,
    `Managed conditions: ${(intake.conditions || []).filter(c => c !== 'none').join(', ') || 'none'}`,
    `Allergens to avoid: ${(intake.allergens || []).join(', ') || 'none'}`,
    `Preferences / notes: ${intake.preferences || '(none provided)'}`,
    ``,
    `Reference — available bowls at STANDARD 16 oz size (each bowl is scaled to this person's portion automatically):`,
    ...SITE_BOWLS.map(b => `- ${b.name} (${b.kcal} kcal, ${b.protein_g}P / ${b.carbs_g}C / ${b.fat_g}F, ${b.fiber_g}g fiber) — ${b.description}`),
    ``,
    `Always recommend a 12-bowl week (recommended_bowl_count: 12, rotation sums to 12). Bowl size and price are computed from daily_calories and meals_per_day — you only set the macros and meals_per_day.`,
    ``,
    `Return JSON only.`
  ];
  return lines.join('\n');
}

function validateIntake(body) {
  const errs = [];
  if (!body || typeof body !== 'object') errs.push('Missing JSON body.');
  if (!body.age || body.age < 18 || body.age > 90) errs.push('Age must be 18–90.');
  if (!['male','female'].includes(body.sex)) errs.push('Sex must be male or female.');
  if (!body.height_cm || body.height_cm < 120 || body.height_cm > 230) errs.push('Height out of range.');
  if (!body.weight_kg || body.weight_kg < 35 || body.weight_kg > 250) errs.push('Weight out of range.');
  if (!ALLOWED_GOALS.has(body.primary_goal)) errs.push('Goal not allowed.');
  if (!ALLOWED_ACTIVITY.has(body.activity_level)) errs.push('Activity level not allowed.');
  const excluded = (body.conditions || []).filter(c => EXCLUDED_CONDITIONS.has(c));
  if (excluded.length) {
    errs.push(
      `This profile's condition${excluded.length > 1 ? 's' : ''} (${excluded.join(', ')}) require Registered Dietitian or MD review. ` +
      `Please consult a healthcare provider. RD review tier ships in V1.2.`
    );
  }
  return errs;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

export const onRequestPost = async ({ request, env }) => {
  // Cost-abuse guard: cap AI generations per IP (Anthropic calls are expensive + unauthenticated).
  const limited = await limitOr429(env, request, { name: 'generate', limit: 8, windowSec: 60 });
  if (limited) return limited;

  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: 'Server is not configured (missing ANTHROPIC_API_KEY).' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body.' }, 400);
  }

  const errs = validateIntake(body);
  if (errs.length) return json({ error: errs.join(' ') }, 400);

  const userPrompt = buildUserPrompt(body);

  let apiResp;
  try {
    apiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }]
      })
    });
  } catch (e) {
    return json({ error: 'Upstream AI call failed: ' + (e.message || 'unknown') }, 502);
  }

  if (!apiResp.ok) {
    const txt = await apiResp.text().catch(() => '');
    return json({ error: `AI returned ${apiResp.status}: ${txt.slice(0, 400)}` }, 502);
  }

  const data = await apiResp.json();
  const text = (data.content || []).map(c => c.text || '').join('');

  let plan;
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('no JSON object found');
    plan = JSON.parse(cleaned.slice(first, last + 1));
  } catch (e) {
    return json({ error: 'AI response could not be parsed.', raw: text.slice(0, 1000) }, 502);
  }

  // Fallback for missing bowl keys so the UI never crashes. Public bowls only (FUERZA is hidden).
  const allBowls = SITE_BOWL_NAMES;
  plan.bowl_rotation = plan.bowl_rotation || {};
  for (const b of allBowls) {
    if (typeof plan.bowl_rotation[b] !== 'number') plan.bowl_rotation[b] = 0;
  }
  plan.lifestyle_notes = Array.isArray(plan.lifestyle_notes) ? plan.lifestyle_notes : [];

  // Deterministic sizing + pricing (the system owns this, not the AI). We always recommend 12;
  // bowl size + per-bowl price scale to the client's daily target. computeSizing also sets
  // weekly_bowl_count, meal_plan_tier ('plan_12'), and the priced plan_options for 5/10/12.
  Object.assign(plan, computeSizing(plan.daily_calories, plan.meals_per_day));

  // Keep the recommended rotation honest: it should sum to the recommended 12-bowl week.
  const rotTotal = allBowls.reduce((s, b) => s + (plan.bowl_rotation[b] || 0), 0);
  if (rotTotal !== RECOMMENDED_BOWL_COUNT && rotTotal > 0) {
    // Proportionally rescale the AI's rotation to 12, then fix rounding drift on the top bowl.
    const scaled = {};
    let running = 0;
    for (const b of allBowls) {
      scaled[b] = Math.round((plan.bowl_rotation[b] || 0) * RECOMMENDED_BOWL_COUNT / rotTotal);
      running += scaled[b];
    }
    let drift = RECOMMENDED_BOWL_COUNT - running;
    const top = allBowls.slice().sort((a, b) => (scaled[b] || 0) - (scaled[a] || 0));
    for (let i = 0; drift !== 0 && i < top.length; i = (i + 1) % top.length) {
      if (drift > 0) { scaled[top[i]]++; drift--; }
      else if (scaled[top[i]] > 0) { scaled[top[i]]--; drift++; }
    }
    plan.bowl_rotation = scaled;
  }

  plan.ai_model = MODEL;
  plan.generated_at = new Date().toISOString();

  return json(plan, 200);
};

// Helpful 405 for the casual GET.
export const onRequest = ({ request }) => {
  if (request.method === 'POST') return;
  return json({ error: 'Method not allowed. Use POST.' }, 405);
};
