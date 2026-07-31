// POST /api/chat — Añejo website customer-service assistant (Claude-powered).
// Grounded, bilingual Q&A + guidance for menu, delivery, subscriptions, and complaints.
// Uses ANTHROPIC_API_KEY (already configured). Stateless: the client sends the running
// message history each turn. Rate-limited as a cost-abuse guard.
import { json, bad } from '../_lib/util.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { budgetGate, recordSpend } from '../_lib/ai_budget.js';
import { loadMenu, isOrderable, isAvailable } from '../_lib/menu.js';
import { BASE_BOWL_PRICE_USD } from '../_lib/sizing.js';

const MODEL = 'claude-sonnet-4-6';

// Flavor shorthand for the degraded path only. When D1 answers we use its own names and
// descriptions; these exist so a D1 blip leaves the assistant describing the menu instead of
// reciting bare ids. Deliberately NO prices here — those only ever come from the menu data, so
// the assistant cannot quote a price checkout wouldn't charge.
const FALLBACK_BOWL_COPY = {
  vida: ['VIDA', 'tuna, mango, lime'],
  fuego: ['FUEGO', 'grilled steak + chimichurri'],
  ligero: ['LIGERO', 'grilled chicken'],
  mar: ['MAR', 'omega-rich salmon'],
  coco: ['COCO', 'coconut-lime shrimp'],
  congreen: ['CONGREEN', 'quinoa-blueberry congrí + tuna'],
  raiz: ['RAÍZ', 'crispy tofu, plant-forward'],
};
// The fallback catalog is a flat id→price map with no `kind` column; these are the known ids.
const FALLBACK_KIND = { fit_gold: 'drink', fit_hibiscus: 'drink', fit_emerald: 'drink', sauce_extra: 'addon' };

// Customer-facing wording for each modifier key, in the order Aña should recite them. The keys are
// fixed in code (the HUB sets what they cost, it cannot invent new ones) and loadMenu doesn't read
// the label column, so the copy lives here. A key with no entry is left OUT of the prompt rather
// than shown as a bare slug — Aña must not guess what "extra_std" means to a customer.
const MODIFIER_COPY = {
  extra_std: 'extra of a standard ingredient',
  extra_premium: 'extra of a premium ingredient (proteins, avocado, cheese, nuts)',
  extra_sauce: 'each ADDITIONAL house sauce (the first added sauce is free)',
  avocado_half: '½ avocado',
  extra_protein: 'extra protein (4 oz)',
  sweet_potato: 'sweet potato',
  sauce_cup: 'extra sauce cup (2 oz)',
};

const usd = (cents) => '$' + (cents / 100).toFixed(2);
// The subscription anchor isn't a menu_items row — it lives in sizing.js, which the calculator
// and /subscribe quote from. Import it rather than retyping it so the three agree.
const BASE_BOWL_USD = usd(Math.round(BASE_BOWL_PRICE_USD * 100));

/**
 * The menu section of the system prompt, generated from the live catalog so a price the owner
 * changes in the HUB reaches the assistant on the next message — no redeploy, no drift.
 *
 * WHAT EXISTS comes from menu.items (the catalog rows, already filtered to active = 1). It must NOT
 * come from menu.bowls / menu.nonBowls: those are the price-safety lookups, and on the degraded path
 * they hold the hardcoded fallback list. Iterating them left a bowl the owner had DEACTIVATED in the
 * HUB on Aña's menu — counted in "N signature bowls" and quoted at the stale hardcoded price — after
 * /api/menu and /order had both correctly dropped it, making the assistant the last surface still
 * selling a discontinued item.
 *
 * WHAT IT COSTS still comes from those maps, so every price Aña quotes is the one checkout charges.
 */
function menuSection(menu) {
  // loadMenu's degraded path returns the price maps with NO rows, so synthesize a catalog from them
  // — that is what FALLBACK_BOWL_COPY / FALLBACK_KIND exist for. Not a per-item backfill: it is all
  // rows or none, exactly like loadMenu itself.
  const rows = (menu.items || []).length ? menu.items : [
    ...Object.keys(menu.bowls).map((id) => ({ id, kind: 'bowl' })),
    ...Object.keys(menu.nonBowls).map((id) => ({ id, kind: FALLBACK_KIND[id] || 'addon' })),
  ];

  const centsOf = (it) => (it.kind === 'bowl' ? menu.bowls[it.id] : (menu.nonBowls[it.id] || {}).price_cents);
  // Two exclusions, both "don't sell what we can't deliver":
  //  - no price → left unmentioned rather than named without one; a bowl Aña describes but cannot
  //    quote is an invitation to invent a number.
  //  - not orderable → a bowl row with no bowlspec recipe is rejected by checkout as "Unknown bowl"
  //    AFTER the customer has built a cart and pressed pay. The owner's menu desk flags it in red
  //    and /order flags it too; Aña must not be the one surface that talks it up.
  //  - marked sold out / coming soon by the owner → she would be recommending something the
  //    customer then cannot add. Aña talking up a bowl the order page shows greyed out is worse
  //    than her not mentioning it, because it reads as the site being broken.
  const listed = (kind) => rows.filter((it) => it.kind === kind && Number.isFinite(centsOf(it)) && isOrderable(it) && isAvailable(it));
  const nameOf = (it) => it.name || (menu.nonBowls[it.id] || {}).name || (FALLBACK_BOWL_COPY[it.id] || [])[0] || String(it.id).toUpperCase();

  const bowls = listed('bowl').map((it) => {
    const desc = it.description || (FALLBACK_BOWL_COPY[it.id] || [])[1] || '';
    const price = usd(centsOf(it));
    return desc ? `${nameOf(it)} (${desc}, ${price})` : `${nameOf(it)} (${price})`;
  });
  const priced = (kind) => listed(kind).map((it) => `${nameOf(it)} ${usd(centsOf(it))}`);
  const drinks = priced('drink');
  const addons = priced('addon');

  // Modifier prices are loaded on every request and were never put in front of the model, so Aña
  // couldn't answer "how much is extra steak?" — the one menu question she gets constantly.
  const extras = Object.keys(MODIFIER_COPY)
    .filter((k) => Number.isFinite(menu.modifiers[k]))
    .map((k) => `${MODIFIER_COPY[k]} +${usd(menu.modifiers[k])}`);

  const lines = [];
  if (bowls.length) {
    lines.push(`- ${bowls.length} signature 16 oz bowl${bowls.length === 1 ? '' : 's'} (sauce on the side, ~40% protein / 30% carbs / 30% fat, ~3-day fridge life): ${bowls.join(', ')}.`);
  }
  if (drinks.length) lines.push(`- Añejo Fit cold-pressed drinks (12 oz): ${drinks.join(', ')}.`);
  if (addons.length) lines.push(`- Add-ons available at checkout: ${addons.join(', ')}.`);
  if (extras.length) {
    lines.push(`- Bowls can be customized at /order. Per-bowl extras: ${extras.join(', ')}. Swapping the base to brown rice is free, and removing an ingredient does NOT reduce the price. The protein cannot be removed.`);
  }
  return lines.join('\n');
}

const system = (menu) => `You are "Aña", the warm, concise customer-service assistant for Añejo Catering Co. — a premium Cuban-American longevity food brand in Palm Beach County, Florida. Tagline: "Clean Fuel. Bold Flavor. Built for Life." Voice: friendly, polished, hospitable, never pushy. Keep replies short (2–5 sentences). Mirror the customer's language — reply in Spanish if they write in Spanish, English if English.

WHAT AÑEJO OFFERS (these are the current prices — quote them exactly, never a range)
${menuSection(menu)}
- Añejo Bites (Cuban-Latin finger food: croquetas, empanadas, etc.) — wholesale for venues.
- Weekly meal-plan subscriptions: we ALWAYS recommend up to 12 bowls/week, but 5- and 10-bowl plans are also available — recurring, cancel anytime. Each bowl is portion-sized to the member's goal from our macro calculator: a standard bowl is 16 oz (~${BASE_BOWL_USD}); lighter goals get smaller bowls that cost less, higher-calorie goals get larger bowls that cost more. Weekly price = the member's per-bowl price × bowls per week. To get an exact quote, point people to the free calculator at /calculator, then /subscribe. (The à-la-carte bowl prices above are for single retail bowls.)
- A free AI macro calculator at /calculator (informational only, NOT medical or dietary advice) — it sets daily macros and sizes each Añejo bowl (and its price) to the person's goal.
- Trainer/gym partner program: trainers create client plans for members who subscribe to Añejo directly. For partnership details, point them to dayan@anejocateringco.com — do NOT quote specific commission or revenue-share rates.

DELIVERY (this is important — get it right)
- DELIVERY ONLY (no pickup), within Palm Beach County, Florida.
- Monday–Saturday (no Sunday). Two windows: Lunch 11:00 AM–1:00 PM, Dinner 5:00 PM–7:00 PM.
- Flat $5 delivery fee, $25 order minimum. Order by 6:00 PM the day before. Florida/PBC sales tax (~7%) added at checkout.

FOOD SAFETY / ALLERGENS
- Made fresh, never frozen. Prepared in a shared kitchen; bowls MAY contain wheat, egg, milk, fish, shellfish, tree nuts, soy, or seeds. Nuts removable on request; dairy-free swaps often available. Tell customers with severe allergies to note it when ordering.

HOW TO HELP
- Answer questions about the menu, nutrition, delivery, subscriptions, and the brand.
- To order à-la-carte, point them to /order. To subscribe, /subscribe. To reserve a tasting or ask about catering/wholesale/partnerships, the form on the home page (#tasting) or /#wholesale.
- For COMPLAINTS or order problems: apologize sincerely, keep it brief, and direct them to dayan@anejocateringco.com or 561-567-1047, and let them know the team responds within 1 business day. Ask for their name, email, and order details so the team can follow up.

CURRENT STATUS (be honest, do not over-promise)
- Añejo is live for online ordering and weekly subscriptions in Palm Beach County. If someone asks whether they can order right now, send them to /order for à-la-carte bowls or /subscribe for weekly plans. Same-day availability can sell out, and future delivery dates follow the 6:00 PM day-before cutoff.

GUARDRAILS
- Only discuss Añejo and closely related topics (food, nutrition basics, ordering, your service area). Politely decline unrelated requests.
- Never invent menu items, prices, or policies beyond what's above; if unsure, say you're not certain and point them to dayan@anejocateringco.com or 561-567-1047.
- Never give medical, dietary, or health advice — recommend a doctor or registered dietitian, and note the calculator is informational only.
- Never promise refunds, discounts, delivery outside PBC, or anything not stated here. Don't take payment details in chat — direct them to the secure checkout.
- Contact: dayan@anejocateringco.com · 561-567-1047 · Instagram @anejo.catering.co.`;

export const onRequestPost = async ({ request, env }) => {
  const limited = await limitOr429(env, request, { name: 'chat', limit: 20, windowSec: 60 });
  if (limited) return limited;
  if (!env.ANTHROPIC_API_KEY) return json({ error: 'Chat is not available right now.' }, 503);
  // The $50/week model-spend ceiling is HARD. Over it, Aña answers with the same graceful
  // copy as the no-key path — a customer must never see a budget error, just "not right now".
  if (!(await budgetGate(env)).ok) return json({ error: 'Chat is not available right now.' }, 503);

  let b;
  try { b = await request.json(); } catch { return bad('Invalid JSON body.'); }

  let msgs = Array.isArray(b.messages) ? b.messages : [];
  msgs = msgs
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 1500) }));
  if (!msgs.length || msgs[msgs.length - 1].role !== 'user') return bad('No message to respond to.');

  // Prices are read per request. loadMenu never throws — it degrades to last-known-good — so the
  // assistant always has a menu to quote from, just possibly a slightly stale one.
  const menu = await loadMenu(env);

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, system: system(menu), messages: msgs }),
    });
  } catch {
    return json({ error: 'Could not reach the assistant. Please email dayan@anejocateringco.com.' }, 502);
  }
  if (!r.ok) return json({ error: 'The assistant is briefly unavailable. Please try again.' }, 502);

  const data = await r.json();
  await recordSpend(env, { feature: 'chat', model: MODEL, usage: data.usage });
  const reply = (data.content || []).map((c) => c.text || '').join('').trim();
  return json({ reply: reply || "Sorry, I didn't catch that — could you say it another way?" });
};
