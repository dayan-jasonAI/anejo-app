// Aña's voice, shared — and her Instagram DRAFTS. Files under _lib are NOT routed.
//
// The system prompt here is THE Aña. It moved out of chat.js so the website chat and the
// social-inbox drafter read from one brain: a price the owner changes in the HUB reaches both on
// the next message, and there is no second, slightly-different Aña to drift out of date. Forking
// the prompt is how one surface ends up quoting a bowl the other stopped selling.
//
// draftReply() DRAFTS. It never sends. The Instagram send functions are deliberately not
// imported here (a source-pinned test enforces it) — a draft that can reach Instagram from this
// file would be one refactor away from auto-replying to a customer, which is the one thing the
// owner said may never happen.
import { budgetGate, recordSpend } from './ai_budget.js';
import { loadMenu, isOrderable, isAvailable } from './menu.js';
import { BASE_BOWL_PRICE_USD } from './sizing.js';

// Drafts are cheap and frequent (every unanswered DM and comment), so they ride Haiku; the
// website chat keeps Sonnet in chat.js. Same knowledge, different cost profile.
const DRAFT_MODEL = 'claude-haiku-4-5';

// Instagram truncates long replies and a wall of text reads as a bot anyway. The prompt asks for
// under 400 characters; the slice below is the hard guard for when the model doesn't listen.
const MAX_DRAFT_CHARS = 500;

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

export const anaSystemPrompt = (menu) => `You are "Aña", the warm, concise customer-service assistant for Añejo Catering Co. — a premium Cuban-American longevity food brand in Palm Beach County, Florida. Tagline: "Clean Fuel. Bold Flavor. Built for Life." Voice: friendly, polished, hospitable, never pushy. Keep replies short (2–5 sentences). Mirror the customer's language — reply in Spanish if they write in Spanish, English if English.

WHAT AÑEJO OFFERS (these are the current prices — quote them exactly, never a range)
${menuSection(menu)}
- Añejo Bites (Cuban-Latin finger food: croquetas, empanadas, etc.) — wholesale for venues.
- Weekly meal-plan subscriptions in 5, 10, or 12-bowl plans (we recommend 12). Members manage everything themselves: pause, skip a week, or cancel anytime. Their TRAINER can be part of the plan, and accountability check-ins help members follow through on their goals and eating habits. Each bowl is portion-sized to the member's goal from our macro calculator: a standard bowl is 16 oz (~${BASE_BOWL_USD}); lighter goals get smaller bowls that cost less, higher-calorie goals get larger bowls that cost more. Weekly price = the member's per-bowl price × bowls per week. To get an exact quote, point people to the free calculator at /calculator, then /subscribe. (The à-la-carte bowl prices above are for single retail bowls.)
- A free AI macro calculator at /calculator (informational only, NOT medical or dietary advice) — it sets daily macros and sizes each Añejo bowl (and its price) to the person's goal.
- Trainer/gym partner program: trainers create client plans for members who subscribe to Añejo directly. For partnership details, point them to dayan@anejocateringco.com — do NOT quote specific commission or revenue-share rates.

DELIVERY (this is important — get it right)
- DELIVERY ONLY (no pickup), within Palm Beach County, Florida.
- Monday–Saturday (no Sunday). Two windows: Lunch 11:00 AM–1:00 PM, Dinner 5:00 PM–7:00 PM.
- Flat $5 delivery fee, $25 order minimum. Florida/PBC sales tax (~7%) added at checkout.
- ORDERING CUTOFFS CHANGE — the owner adjusts them. NEVER state a cutoff time from memory; say that anejocateringco.com/order always shows exactly what is open right now.

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

// What changes when Aña drafts for Instagram instead of chatting on the website. The escalation
// sentinel is a plain-text prefix rather than JSON because a refusal must be unmistakable — a
// malformed JSON "escalation" that gets treated as copy and sent to an angry customer is the
// exact failure this exists to prevent.
const ESCALATE_PREFIX = 'ESCALATE:';
const socialAddendum = (kind, username) => `
CONTEXT CHANGE — you are DRAFTING, not chatting.
This is an Instagram ${kind === 'comment' ? 'public comment on one of Añejo\'s posts' : 'direct message'} from ${username ? '@' + username : 'a customer'}. Write a DRAFT reply for the owner to review, edit, and send — nothing you write is sent automatically. Still write it exactly as it should read when sent: Aña's warm voice, ready to go, no placeholders and no notes to the owner.

SPECIAL REQUESTS — never refuse, never promise
If someone missed an ordering window, wants a date we may not serve, or asks for something custom
(a late order, an exception, an off-menu request): do NOT turn them away and do NOT commit. Reply
warmly that you're checking with the kitchen right now and we'll do our best for them — then start
your ENTIRE output with [SPECIAL] so the kitchen and owner are alerted. The tag is stripped before
sending; everything after it must read as the finished reply.

RULES FOR THIS DRAFT (on top of the guardrails above)
- PLAIN TEXT ONLY: no markdown, no **bold**, no headings, and never a label like "Draft reply:" — your entire output is the message body itself and nothing else.
- Instagram cannot open a bare path like /order. Any link must be the full domain: anejocateringco.com/order (never a leading slash on its own).
- Keep it under 400 characters — one to three short sentences. ${kind === 'comment' ? 'This reply is PUBLIC, under the post, so keep it upbeat and never discuss a specific order in public — invite them to DM or email instead.' : ''}
- Quote ONLY prices, hours, and delivery rules stated above. Never invent a price, a deadline, or a delivery promise. If the answer is not above, say you will check and point them to anejocateringco.com/order or dayan@anejocateringco.com.
- Never promise refunds, discounts, credits, or exceptions of any kind.
- If the message is angry or heated, threatens a bad review, asks about a refund, a chargeback, or a billing problem, or describes anything medical (an allergic reaction, feeling sick, an injury) — do NOT draft a reply. Instead respond with exactly one line:
${ESCALATE_PREFIX} <a few words saying why this needs the owner>`;

/**
 * Draft one Instagram reply in Aña's voice. DRAFT ONLY — the caller stores it for the owner.
 *
 * Returns:
 *   { ok:true, draft }                    — copy ready for the owner's review
 *   { ok:true, escalate:true, reason }    — Aña refused to draft; NO copy is returned, so there
 *                                           is nothing downstream to accidentally send
 *   { ok:false }                          — no key / empty text / API failure; caller retries later
 */
export async function draftReply(env, { kind = 'dm', text, username } = {}) {
  if (!env || !env.ANTHROPIC_API_KEY) return { ok: false, reason: 'not_configured' };
  // The $50/week ceiling covers EVERY model call, and a DM backlog at 4 drafts/minute is exactly
  // the kind of quiet spender the ceiling exists for. Gated before any work, like every caller.
  if (!(await budgetGate(env)).ok) return { ok: false, reason: 'budget' };
  const msg = String(text || '').trim();
  if (!msg) return { ok: false, reason: 'empty' };

  // Prices and rules are read per draft, same as chat.js — loadMenu never throws, it degrades to
  // last-known-good, so the draft always quotes what checkout charges.
  const menu = await loadMenu(env);
  const system = anaSystemPrompt(menu) + '\n' + socialAddendum(kind, username);

  let r;
  try {
    r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: DRAFT_MODEL,
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: msg.slice(0, 1500) }],
      }),
    });
  } catch { return { ok: false }; }
  if (!r.ok) return { ok: false };

  let data;
  try { data = await r.json(); } catch { return { ok: false }; }
  await recordSpend(env, { feature: 'ana_social_draft', model: DRAFT_MODEL, usage: data && data.usage });
  const out = ((data && data.content) || []).map((c) => c.text || '').join('').trim();
  if (!out) return { ok: false };

  // A special request SENDS a holding reply AND alerts the kitchen+owner — unlike an escalation,
  // which sends nothing. Parsed before the scrub so the tag cannot survive into the message.
  const specialMatch = out.match(/^\s*\[SPECIAL\]\s*/i);
  if (specialMatch) {
    const body = out.slice(specialMatch[0].length).trim();
    if (body) return { ok: true, draft: body.slice(0, MAX_DRAFT_CHARS), special: true };
  }

  if (out.toUpperCase().startsWith(ESCALATE_PREFIX)) {
    const reason = out.slice(ESCALATE_PREFIX.length).trim().slice(0, 200) || 'needs the owner';
    return { ok: true, escalate: true, reason };
  }
  // The first live draft opened with a literal "**DRAFT REPLY:**" — model scaffolding that would
  // have been sent to a customer verbatim. The prompt now forbids it, but a guarantee lives in
  // code, not in a request: strip leading labels and markdown emphasis. After the escalation
  // check on purpose, so the ESCALATE prefix is never touched.
  const scrubbed = out
    .replace(/^\s*(\*\*)?\s*(draft(\s+reply)?|reply)\s*:?\s*(\*\*)?\s*/i, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .trim();
  return { ok: true, draft: (scrubbed || out).slice(0, MAX_DRAFT_CHARS) };
}
