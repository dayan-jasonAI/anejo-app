// POST /api/chat — Añejo website customer-service assistant (Claude-powered).
// Grounded, bilingual Q&A + guidance for menu, delivery, subscriptions, and complaints.
// Uses ANTHROPIC_API_KEY (already configured). Stateless: the client sends the running
// message history each turn. Rate-limited as a cost-abuse guard.
import { json, bad } from '../_lib/util.js';
import { limitOr429 } from '../_lib/ratelimit.js';
import { loadMenu } from '../_lib/menu.js';
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

const usd = (cents) => '$' + (cents / 100).toFixed(2);
// The subscription anchor isn't a menu_items row — it lives in sizing.js, which the calculator
// and /subscribe quote from. Import it rather than retyping it so the three agree.
const BASE_BOWL_USD = usd(Math.round(BASE_BOWL_PRICE_USD * 100));

/**
 * The menu section of the system prompt, generated from the live catalog so a price the owner
 * changes in the HUB reaches the assistant on the next message — no redeploy, no drift.
 */
function menuSection(menu) {
  const byId = new Map((menu.items || []).map((it) => [it.id, it]));

  const bowls = Object.entries(menu.bowls).map(([id, cents]) => {
    const it = byId.get(id);
    const [fbName, fbDesc] = FALLBACK_BOWL_COPY[id] || [id.toUpperCase(), ''];
    const name = (it && it.name) || fbName;
    const desc = (it && it.description) || fbDesc;
    return desc ? `${name} (${desc}, ${usd(cents)})` : `${name} (${usd(cents)})`;
  });

  const pick = (kind) => Object.entries(menu.nonBowls)
    .filter(([id]) => ((byId.get(id) || {}).kind || FALLBACK_KIND[id]) === kind)
    .map(([, v]) => `${v.name} ${usd(v.price_cents)}`);
  const drinks = pick('drink');
  const addons = pick('addon');

  const lines = [`- ${bowls.length} signature 16 oz bowls (sauce on the side, ~40% protein / 30% carbs / 30% fat, ~3-day fridge life): ${bowls.join(', ')}.`];
  if (drinks.length) lines.push(`- Añejo Fit cold-pressed drinks (12 oz): ${drinks.join(', ')}.`);
  if (addons.length) lines.push(`- Add-ons available at checkout: ${addons.join(', ')}.`);
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
  const reply = (data.content || []).map((c) => c.text || '').join('').trim();
  return json({ reply: reply || "Sorry, I didn't catch that — could you say it another way?" });
};
