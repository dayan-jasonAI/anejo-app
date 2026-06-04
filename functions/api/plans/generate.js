// POST /api/plans/generate
// Stateless V1 demo endpoint. Takes an intake JSON, calls Claude Sonnet 4.6,
// returns a structured plan. No DB writes — saving + checkout ship in V1.1.

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

// Final 7-bowl menu (2026-06-03). Macros per single 16-oz bowl, sauce on the side (midpoint estimates).
const BOWLS = [
  { name: 'VIDA',     description: 'Tuna sautéed with mango + lime over quinoa, refried chickpeas, greens, pumpkin seeds.', kcal: 560, protein_g: 46, carbs_g: 52, fat_g: 18, fiber_g: 12, tags: ['pescatarian','anti-inflammatory','flagship'] },
  { name: 'FUEGO',    description: 'Grilled steak with Añejo chimichurri, quinoa, grilled veg, spinach-apple-almond salad.',  kcal: 680, protein_g: 48, carbs_g: 48, fat_g: 28, fiber_g:  9, tags: ['high-protein','mediterranean'] },
  { name: 'LIGERO',   description: 'Grilled chicken with chimichurri, quinoa, grilled veg, spinach-apple-almond salad.',      kcal: 620, protein_g: 50, carbs_g: 50, fat_g: 18, fiber_g:  9, tags: ['high-protein','lean','workhorse'] },
  { name: 'MAR',      description: 'Omega-rich salmon over quinoa, greens, roasted vegetables, pickled onions, sesame, Añejo sauce.', kcal: 700, protein_g: 42, carbs_g: 45, fat_g: 32, fiber_g: 8, tags: ['pescatarian','omega-3','anti-inflammatory','high-protein'] },
  { name: 'COCO',     description: 'Coconut-lime shrimp over quinoa-corn-edamame, spinach, tomato, cucumber, avocado, Ajo Cítrico.', kcal: 620, protein_g: 39, carbs_g: 52, fat_g: 25, fiber_g: 9, tags: ['pescatarian','lean','tropical'] },
  { name: 'CONGREEN', description: 'Quinoa-blueberry congrí with tuna sauté, spinach-tomato, avocado, queso fresco, pumpkin seeds.', kcal: 600, protein_g: 43, carbs_g: 56, fat_g: 20, fiber_g: 11, tags: ['pescatarian','cuban','antioxidant'] },
  { name: 'RAIZ',     description: 'Crispy tofu, quinoa, slaw, roasted vegetables, sweet potato, avocado, Aguacate Cilantro + Mango Omega.', kcal: 625, protein_g: 28, carbs_g: 57, fat_g: 30, fiber_g: 11, tags: ['vegetarian','plant-forward','dairy-free','high-fiber','anti-inflammatory'] }
];

const TIERS = [
  { tier: 'plan_5',  bowls_per_week:  5, weekly_price_usd:  99 },
  { tier: 'plan_10', bowls_per_week: 10, weekly_price_usd: 189 },
  { tier: 'plan_12', bowls_per_week: 12, weekly_price_usd: 219 }
];

const SYSTEM_PROMPT = `You are the nutrition planning AI for Añejo Catering Co., a Mediterranean-Cuban longevity bowl service in Palm Beach County, Florida. You generate personalized weekly meal plans for fitness clients of partner gym trainers, clinics, and wellness coaches — and for individuals on the public site.

Your job, given a person's biometrics and goal, is to output:
1. Daily macro targets (calories, protein, carbs, fat, fiber).
2. A weekly Añejo bowl rotation — which of our 7 bowls, and how many of each per week.
3. A short rationale (3–5 plain-language sentences explaining the macro choices and bowl emphasis).
4. Lifestyle notes (5–7 short bullets — training, hydration, sleep, timing).

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

## Bowl emphasis logic
- High blood pressure / cholesterol / metabolic syndrome / prediabetes → favor LIGERO, MAR, COCO, RAIZ, CONGREEN. De-emphasize FUEGO.
- Muscle gain → favor FUEGO, LIGERO, MAR, VIDA (high protein + recovery).
- Fat loss → favor LIGERO, COCO, MAR, VIDA, RAIZ; limit FUEGO.
- Performance → favor FUEGO, LIGERO, MAR, VIDA.
- Longevity → favor VIDA, MAR, RAIZ, CONGREEN (omega-3, fiber, anti-inflammatory).
- Always respect allergens — if "fish", exclude VIDA, MAR, CONGREEN. If "shellfish", exclude COCO. If "dairy", exclude CONGREEN. If "soy", exclude RAIZ and COCO. If "nuts", note FUEGO and LIGERO contain almonds (removable on request). If "pork", note that no current bowls contain pork.

## Tier selection
Choose plan_5, plan_10, or plan_12 based on what the bowl rotation actually needs. If the macro target requires 2 bowls/day, choose plan_10 or plan_12 (especially for muscle_gain or very_active). For sedentary / fat_loss / longevity, plan_5 is often correct.

## Output format
Return ONLY a JSON object, no prose before or after, no markdown fences:

{
  "daily_calories": 2100,
  "daily_protein_g": 175,
  "daily_carbs_g": 200,
  "daily_fat_g": 65,
  "daily_fiber_g": 30,
  "weekly_bowl_count": 10,
  "meal_plan_tier": "plan_10",
  "bowl_rotation": {
    "VIDA": 0, "FUEGO": 0, "LIGERO": 0, "MAR": 0,
    "COCO": 0, "CONGREEN": 0, "RAIZ": 0
  },
  "rationale": "3–5 sentence explanation in plain language.",
  "lifestyle_notes": ["bullet 1", "bullet 2", "..."]
}

## Rails
- The lifestyle_notes array MUST end with this exact bullet: "This plan is for general fitness and wellness. It is not medical advice. Consult your healthcare provider before starting any new nutrition program."
- Never make medical claims. Use "supports," "designed for," "built for." Never use "cures," "prevents," "treats."
- Never recommend going below 1,500 kcal/day for any client, regardless of fat-loss intensity.
- The bowl_rotation counts MUST sum to the weekly_bowl_count.
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
    `Reference — available bowls with per-bowl macros:`,
    ...BOWLS.map(b => `- ${b.name} (${b.kcal} kcal, ${b.protein_g}P / ${b.carbs_g}C / ${b.fat_g}F, ${b.fiber_g}g fiber) — ${b.description}`),
    ``,
    `Tier prices: plan_5 $99/wk · plan_10 $189/wk · plan_12 $219/wk.`,
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

  // Fallback for missing bowl keys so the UI never crashes.
  const allBowls = ['VIDA','FUEGO','LIGERO','MAR','COCO','CONGREEN','RAIZ'];
  plan.bowl_rotation = plan.bowl_rotation || {};
  for (const b of allBowls) {
    if (typeof plan.bowl_rotation[b] !== 'number') plan.bowl_rotation[b] = 0;
  }
  plan.lifestyle_notes = Array.isArray(plan.lifestyle_notes) ? plan.lifestyle_notes : [];
  plan.ai_model = MODEL;
  plan.generated_at = new Date().toISOString();

  return json(plan, 200);
};

// Helpful 405 for the casual GET.
export const onRequest = ({ request }) => {
  if (request.method === 'POST') return;
  return json({ error: 'Method not allowed. Use POST.' }, 405);
};
