// POST /api/plans/generate
// Stateless V1 demo endpoint. Takes an intake JSON, calls Claude Sonnet 4.6,
// returns a structured plan. No DB writes — saving + checkout ship in V1.1.

const MODEL = 'claude-sonnet-4-6';

// Conditions that are excluded from AI plan generation in V1 (per portal spec).
// If a partner submits a profile with any of these, we refuse the plan and recommend RD/MD review.
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

// Locked menu (per task brief 2026-05-17). PESCA replaced COCO; FUERZA pivoted to chicken Cuban-style.
// Macros per single 16-oz bowl, sauces on the side.
const BOWLS = [
  { name: 'VIDA',     description: 'Sushi-grade tuna, quinoa, refried chickpeas, mango, lime, Añejo Signature Sauce.', kcal: 560, protein_g: 46, carbs_g: 52, fat_g: 18, fiber_g: 12, tags: ['pescatarian','anti-inflammatory','flagship'] },
  { name: 'FUEGO',    description: 'Grass-fed steak, Añejo Chimichurri, quinoa, apple-almond spinach.',                 kcal: 680, protein_g: 48, carbs_g: 48, fat_g: 28, fiber_g:  9, tags: ['high-protein'] },
  { name: 'LIGERO',   description: 'Chicken Chimichurri, quinoa, apple-almond spinach.',                                kcal: 620, protein_g: 50, carbs_g: 50, fat_g: 18, fiber_g:  9, tags: ['high-protein','lean','workhorse'] },
  { name: 'PESCA',    description: 'Seared salmon, mango salsa, asparagus, quinoa-corn.',                               kcal: 640, protein_g: 44, carbs_g: 50, fat_g: 24, fiber_g:  8, tags: ['pescatarian','omega-3','anti-inflammatory'] },
  { name: 'FUERZA',   description: 'Cuban-style chicken, rice, black beans, queso fresco, Poblano Apple dressing.',     kcal: 700, protein_g: 47, carbs_g: 70, fat_g: 18, fiber_g: 11, tags: ['comfort','high-carb','recovery'] },
  { name: 'MANGO',    description: 'Seared tofu, quinoa, mango sautéed vegetables, cucumber-carrot, avocado.',          kcal: 540, protein_g: 28, carbs_g: 58, fat_g: 20, fiber_g: 12, tags: ['vegetarian','plant-forward','dairy-free'] },
  { name: 'CONGREEN', description: 'Quinoa-blueberry congrí, tuna, avocado, queso fresco, Passion Heat sauce.',         kcal: 600, protein_g: 43, carbs_g: 56, fat_g: 20, fiber_g: 11, tags: ['pescatarian','antioxidant'] },
  { name: 'BOOST',    description: '0% Greek yogurt, wild berries, seed blend, honey drizzle.',                          kcal: 320, protein_g: 28, carbs_g: 38, fat_g:  6, fiber_g:  8, tags: ['breakfast','low-fat','high-protein'] }
];

const TIERS = [
  { tier: 'plan_5',  bowls_per_week:  5, weekly_price_usd:  99 },
  { tier: 'plan_10', bowls_per_week: 10, weekly_price_usd: 189 },
  { tier: 'plan_12', bowls_per_week: 12, weekly_price_usd: 219, includes_boost: 2 }
];

const SYSTEM_PROMPT = `You are the nutrition planning AI for Añejo Catering Co., a Mediterranean-Cuban longevity bowl service in Palm Beach County, Florida. You generate personalized weekly meal plans for fitness clients of partner gym trainers, clinics, and wellness coaches.

Your job, given a client's biometrics and goal, is to output:
1. Daily macro targets (calories, protein, carbs, fat, fiber).
2. A weekly Añejo bowl rotation — which of our 8 SKUs, and how many of each per week.
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
- High blood pressure / cholesterol / metabolic syndrome → favor LIGERO, PESCA, MANGO, CONGREEN. De-emphasize FUEGO, FUERZA.
- Muscle gain → favor LIGERO, FUEGO, FUERZA (high protein + carbs for recovery).
- Fat loss → favor LIGERO, MANGO, PESCA; BOOST as breakfasts; limit FUERZA.
- Performance → favor FUEGO, FUERZA, LIGERO. BOOST as pre-training fuel.
- Longevity → favor VIDA, CONGREEN, PESCA, MANGO (omega-3 + anti-inflammatory).
- Always respect allergens — if "fish" or "shellfish", exclude VIDA, COCO (legacy), PESCA, CONGREEN. If "dairy", exclude FUERZA and CONGREEN and BOOST. If "soy", exclude MANGO. If "pork", note that no current bowls contain pork.

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
    "VIDA": 0, "FUEGO": 0, "LIGERO": 0, "PESCA": 0,
    "FUERZA": 0, "MANGO": 0, "CONGREEN": 0, "BOOST": 0
  },
  "rationale": "3–5 sentence explanation in plain language.",
  "lifestyle_notes": ["bullet 1", "bullet 2", "..."]
}

## Rails
- The lifestyle_notes array MUST end with this exact bullet: "This plan is for general fitness and wellness. It is not medical advice. Consult your healthcare provider before starting any new nutrition program."
- Never make medical claims. Use "supports," "designed for," "built for." Never use "cures," "prevents," "treats."
- Never recommend going below 1,500 kcal/day for any client, regardless of fat-loss intensity.
- The bowl_rotation counts MUST sum to the weekly_bowl_count (plus, for plan_12, 2 BOOST bowls included as part of the 12).
- Do not invent bowls. Use only: VIDA, FUEGO, LIGERO, PESCA, FUERZA, MANGO, CONGREEN, BOOST.
`;

function buildUserPrompt(intake) {
  const voice = intake.audience === 'trainer'
    ? `This plan is generated by a partner trainer for their client. In "rationale" and "lifestyle_notes", refer to "your client" / "they".`
    : `This plan is generated by the person themselves on the public Añejo site. In "rationale" and "lifestyle_notes", address the reader directly as "you" / "your".`;
  const lines = [
    voice,
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
    `Tier prices: plan_5 $99/wk · plan_10 $189/wk · plan_12 $219/wk (includes 2 BOOST).`,
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
      `This member's condition${excluded.length > 1 ? 's' : ''} (${excluded.join(', ')}) require Registered Dietitian or MD review. ` +
      `Refer to a healthcare provider. RD review tier ships in V1.2.`
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

  // Call Anthropic Messages API.
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

  // Extract the JSON object. Tolerant parser — strips code fences if present.
  let plan;
  try {
    const cleaned = text
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/i, '')
      .trim();
    // Find first { and last } to be safe against stray prose.
    const first = cleaned.indexOf('{');
    const last = cleaned.lastIndexOf('}');
    if (first === -1 || last === -1) throw new Error('no JSON object found');
    plan = JSON.parse(cleaned.slice(first, last + 1));
  } catch (e) {
    return json({
      error: 'AI response could not be parsed.',
      raw: text.slice(0, 1000)
    }, 502);
  }

  // Light shape check + fallback for missing bowl keys (so the UI doesn't crash).
  const allBowls = ['VIDA','FUEGO','LIGERO','PESCA','FUERZA','MANGO','CONGREEN','BOOST'];
  plan.bowl_rotation = plan.bowl_rotation || {};
  for (const b of allBowls) {
    if (typeof plan.bowl_rotation[b] !== 'number') plan.bowl_rotation[b] = 0;
  }
  plan.lifestyle_notes = Array.isArray(plan.lifestyle_notes) ? plan.lifestyle_notes : [];
  plan.ai_model = MODEL;
  plan.generated_at = new Date().toISOString();

  return json(plan, 200);
};

// Helpful 405 for the casual GET (so debugging is easier).
export const onRequest = ({ request }) => {
  if (request.method === 'POST') return; // handled above
  return json({ error: 'Method not allowed. Use POST.' }, 405);
};
