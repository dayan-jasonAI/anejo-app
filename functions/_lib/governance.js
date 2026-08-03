// Añejo HUB — governance gates: the Brand Auditor + Claims Checker that scores every
// generated draft BEFORE the owner sees it.
//
// Two real incidents are why this file exists: a planner caption invented an ordering
// deadline (a reader would have thought they missed a window that never existed), and Aña
// once let model scaffolding reach a public reply. The prompts got stricter both times — but
// a prompt is a request, and a guarantee lives in code. So no generated asset reaches the
// owner (or, later, any auto-publish path) unscored: one cheap Haiku pass judges the draft
// against the brand's own brief and the LIVE menu, and a handful of DETERMINISTIC checks
// catch the specific lies a model can smuggle past itself — invented prices, hard-coded
// cutoffs, bare links. The model advises; the code decides.
//
// Files under functions/_lib are NOT routed.
import { budgetGate, recordSpend } from './ai_budget.js';
import { loadMenu } from './menu.js';
import { loadOperating } from './operating.js';
import { loadBrand } from './brand_source.js';
import { trainingContext } from './training.js';

// Audits are per-draft and frequent, so they ride Haiku like Aña's DM drafts do. The judge
// does not need frontier reasoning — it needs the brand brief and the live menu in front of
// it, and it needs to be cheap enough that nothing is ever skipped "to save budget".
const AUDIT_MODEL = 'claude-haiku-4-5';

// The only flag types a model answer may carry. Anything else it invents is coerced to
// 'claim' rather than trusted into the owner's UI as a new category nobody designed for.
// 'training' was added alongside the owner-training injection below — a flag naming a
// violated HUB rule is a distinct kind of finding from a brand-voice nit or a photo miss.
const MODEL_FLAG_TYPES = new Set(['claim', 'voice', 'photo', 'training']);

// Char cap on the brand brief the auditor reads — the SAME ceiling the Team Lead and the
// planner carry (brand_source.js). Before brand_source.js existed the auditor had no cap at
// all: it always embedded the FULL compiled snapshot (~15.3k chars), so 20000 is headroom,
// not a squeeze, and preserves this judge's read of the brief exactly as it was.
const BRAND_BUDGET = 20000;

// Owner training (0075/training.js) reaching the judge too. Same budget the Team Lead and the
// planner already use for the same feed — this is the third and last consumer of
// trainingContext(), not a fourth, differently-sized one.
const TRAINING_BUDGET = 4000;

// Every price the live menu actually charges, in integer cents — drawn from the same
// loadMenu rows checkout prices from (fallback maps included, so a D1 blip does not turn
// every real price into a false flag). A caption price is TRUE only if some row charges
// exactly that.
function menuPriceCents(menu) {
  const cents = new Set();
  const add = (v) => {
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n > 0) cents.add(n);
  };
  for (const it of menu.items || []) add(it.price_cents);
  for (const v of Object.values(menu.bowls || {})) add(v);
  for (const v of Object.values(menu.nonBowls || {})) add(v && v.price_cents);
  for (const v of Object.values(menu.modifiers || {})) add(v);
  return cents;
}

// The live menu as prompt lines. When D1 answers, names/prices/descriptions come from the
// rows; degraded, the fallback maps still carry real names and prices, so the audit keeps
// running instead of judging against an empty menu.
function menuLinesOf(menu) {
  if ((menu.items || []).length) {
    return menu.items.map((it) =>
      `${it.name} ($${((it.price_cents || 0) / 100).toFixed(2)})${it.description ? ' — ' + it.description : ''}`);
  }
  const lines = Object.entries(menu.bowls || {}).map(([bid, c]) => `${bid.toUpperCase()} ($${(c / 100).toFixed(2)})`);
  for (const v of Object.values(menu.nonBowls || {})) lines.push(`${v.name} ($${((v.price_cents || 0) / 100).toFixed(2)})`);
  return lines;
}

/**
 * The checks a model cannot be trusted to run on itself. Pure and synchronous on purpose:
 * they cost nothing, so they run on EVERY draft — including the ones the model call refuses
 * (budget, no key, API down). Caption only: the image_brief is internal art direction that
 * never publishes, and the model still reads it for photo-standard judgement.
 */
export function deterministicFlags(caption, { priceCents, orderByHour }) {
  const flags = [];
  const text = String(caption || '');

  // Invented prices — the original planner incident class. Any $N or $N.NN in the caption
  // must be a price some live menu row actually charges. "Was $24.99" marketing math counts
  // as invented too: if nothing charges it, the caption should not print it.
  for (const m of text.matchAll(/\$\s?(\d{1,4}(?:\.\d{2})?)/g)) {
    const cents = Math.round(parseFloat(m[1]) * 100);
    if (!priceCents.has(cents)) {
      flags.push({ type: 'claim', detail: `Price $${m[1]} is not on the live menu.` });
    }
  }

  // Hard-coded cutoffs. The cutoff is the OWNER'S DIAL (ops.order_by_hour) and it moves —
  // "6 PM" is only true while the dial actually reads 18, checked here against the same
  // setting the storefront enforces. Any other stated hour is the model's problem to catch;
  // this string is pinned because it is the one that has actually been published.
  if (/\b6\s?p\.?m\.?\b/i.test(text) && orderByHour !== 18) {
    flags.push({ type: 'claim', detail: `Caption says "6 PM" but the live order-by hour is ${orderByHour}:00.` });
  }

  // Bare '/order' — a path with no domain is a link nobody can tap in an Instagram caption.
  // Full-domain occurrences are stripped first so anejocateringco.com/order passes clean.
  const bare = text.replace(/[a-z0-9][a-z0-9.-]*\.[a-z]{2,}\/order/gi, '');
  if (/\/order\b/.test(bare)) {
    flags.push({ type: 'claim', detail: "Bare '/order' link — links must carry the full domain." });
  }

  return flags;
}

// The judge's brief: the brand document verbatim (summarising it is how the brand drifts),
// the live menu, the owner's own training rules, and the claim rules written as rules rather
// than vibes.
//
// `brand` is { text, source } from brand_source.js — 'd1' when the owner has a live brief in the
// HUB, 'repo' for the compiled snapshot floor. `training` is trainingContext()'s output, already
// budget-capped; '' on a fresh install, meaning the training section below is omitted entirely
// rather than rendered as an empty, misleading header.
function auditSystemPrompt(menuLines, brand, training) {
  return (
    'You are the brand auditor for Añejo Catering Co. You review DRAFT Instagram posts before ' +
    'the owner sees them. Below is the brand\'s own standards brief' +
    (brand.source === 'd1' ? ' — live from the HUB, owner-maintained' : ' — verbatim, written by the owner') +
    '. It is the authority on who Añejo is and how it speaks.\n\n' +
    '=== AÑEJO BRAND BRIEF ===\n' + brand.text + '\n=== END BRIEF ===\n\n' +
    '=== THE LIVE MENU (the ONLY items, names, ingredients and prices that exist) ===\n' +
    menuLines.join('\n') + '\n=== END MENU ===\n\n' +
    'HARD CLAIM RULES — every violation is a flag of type "claim":\n' +
    '- No invented prices, deadlines or cutoff hours. The ordering cutoff is an owner setting ' +
    'that moves; it must NEVER be stated as a fixed fact (no "order by 6 PM", no "order by Wednesday").\n' +
    '- No medical or outcome promises: nothing cures, treats, prevents, or guarantees weight ' +
    'loss or transformation.\n' +
    '- No exact grams or calories — nutrition is approximate ranges only.\n' +
    '- No products that do not exist: no gift cards, no shipping, no pickup.\n' +
    '- Ingredients may only be attributed to a bowl if its menu entry above names them.\n' +
    '- Links must carry a full domain (e.g. anejocateringco.com/order), never a bare path.\n\n' +
    'Also judge the caption\'s voice against the brand voice section ("voice" flags) and the ' +
    'image_brief against the Photo standard ("photo" flags).\n\n' +
    (training
      ? '=== OWNER\'S TRAINING FOR THE TEAM (rules and examples he taught from the HUB) ===\n' +
        training + '\n=== END TRAINING ===\n\n' +
        // The scoring rule this exists to state, in words a Haiku judge cannot miss: a training
        // RULE is an instruction from the person who owns the business, not a style preference to
        // weigh against everything else. Treat it exactly like a HARD CLAIM RULE above — a
        // violation is a flag of type "training", and a draft that breaks one can never verdict
        // "pass", even if it is otherwise on-brand, factually clean, and well photographed.
        'Each RULE above is a direct instruction from the owner — not a suggestion, not one voice ' +
        'consideration among several. If the draft violates ANY rule above, that is a flag of type ' +
        '"training": name the rule (or paraphrase it) and quote the part of the draft that breaks it. ' +
        'A draft that violates an owner rule must NEVER verdict "pass".\n\n'
      : '') +
    'Return ONLY JSON, nothing else: {"brand_score": <integer 0-100>, ' +
    '"flags": [{"type": "claim"|"voice"|"photo"|"training", "detail": "<one short sentence>"}], ' +
    '"verdict": "pass"|"flag"}. verdict "pass" only if the draft could reach the owner with no reservations.'
  );
}

/**
 * Score one generated draft. ONE Haiku call (budget-gated + metered as 'governance_audit'),
 * plus the deterministic checks above.
 *
 * Returns strict {brand_score: 0-100, flags: [{type, detail}], verdict: 'pass'|'flag'}.
 *
 * The verdict is 'pass' ONLY when the model said pass AND no deterministic check fired.
 * When the model cannot answer (no key, budget ceiling, API failure, unparseable JSON) the
 * verdict FAILS OPEN INTO REVIEW — 'flag' with an 'audit_unavailable' flag — because an
 * unscored draft must never look passed. That is the entire point of the gate.
 */
export async function auditDraft(env, { caption, image_brief } = {}) {
  const menu = await loadMenu(env);

  // Read the cutoff dial the way operating.js does: parseInt with the same default 18, so
  // "unset" here means exactly what "unset" means to the storefront.
  let orderByHour = 18;
  try {
    const ops = await loadOperating(env);
    const n = parseInt(ops.order_by_hour, 10);
    if (Number.isFinite(n)) orderByHour = n;
  } catch { /* the default matches operating.js DEFAULTS */ }

  const hard = deterministicFlags(caption, { priceCents: menuPriceCents(menu), orderByHour });

  // The brand brief (shared with the Team Lead and the planner via brand_source.js — one
  // definition, no drift) and the owner's own training rules (0075/training.js). Both degrade
  // silently: loadBrand always returns at least the compiled snapshot, and trainingContext
  // returns '' on a fresh install or a pre-migration database — neither can ever throw the audit
  // into 'unavailable', because an unscored draft is worse than one judged without training.
  const brand = await loadBrand(env, { maxChars: BRAND_BUDGET });
  let training = '';
  try { training = await trainingContext(env, { maxChars: TRAINING_BUDGET }); } catch { training = ''; }

  let model = null;          // { score, flags, verdict } once the judge has answered
  let unavailable = null;    // why it has not, in a word the owner can read
  if (!env || !env.ANTHROPIC_API_KEY) unavailable = 'no API key';
  else if (!(await budgetGate(env)).ok) unavailable = 'weekly AI budget reached';
  else {
    try {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: AUDIT_MODEL,
          max_tokens: 500,
          system: auditSystemPrompt(menuLinesOf(menu), brand, training),
          messages: [{
            role: 'user',
            content: JSON.stringify({
              caption: String(caption || '').slice(0, 2200),
              image_brief: String(image_brief || '').slice(0, 400),
            }),
          }],
        }),
      });
      if (!r.ok) unavailable = `API error ${r.status}`;
      else {
        const j = await r.json();
        // Metered HERE, not after the parse: an unparseable answer was still a billed answer,
        // and skipping it would undercount the very calls that wasted money.
        await recordSpend(env, { feature: 'governance_audit', model: AUDIT_MODEL, usage: j.usage });
        let text = ((j.content && j.content[0] && j.content[0].text) || '').trim();
        const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fence) text = fence[1].trim();
        const start = text.search(/[{]/);
        if (start > 0) text = text.slice(start);
        const data = JSON.parse(text);
        const score = Math.min(100, Math.max(0, Math.round(Number(data.brand_score)) || 0));
        const flags = (Array.isArray(data.flags) ? data.flags : [])
          .map((f) => ({
            type: MODEL_FLAG_TYPES.has(f && f.type) ? f.type : 'claim',
            detail: String((f && f.detail) || '').slice(0, 240),
          }))
          .filter((f) => f.detail)
          .slice(0, 12);
        model = { score, flags, verdict: data.verdict === 'pass' ? 'pass' : 'flag' };
      }
    } catch { unavailable = 'API unreachable or answer unparseable'; }
  }

  if (!model) {
    return {
      brand_score: 0,
      flags: [...hard, { type: 'audit_unavailable', detail: `The brand audit could not run (${unavailable}). Review this draft by hand.` }],
      verdict: 'flag',
      brand_source: brand.source,
    };
  }

  // A training rule is an instruction, not a vibe — the same "code catches lies, it does not
  // grant absolution" discipline the deterministic price/cutoff/link checks already apply. The
  // prompt already tells the model a training violation can never verdict "pass" (see
  // auditSystemPrompt), but a prompt is a request; this is the guarantee. If the model ever DOES
  // report a "training" flag alongside verdict "pass" — its own instructions ignored — the code
  // overrules it here, exactly like a deterministic claim flag does.
  const trainingViolation = model.flags.some((f) => f.type === 'training');

  return {
    brand_score: model.score,
    flags: [...hard, ...model.flags],
    // The model may say pass; the deterministic checks AND a reported training violation can
    // still overrule it. Never the other way around — code catches lies, it does not grant
    // absolution.
    verdict: model.verdict === 'pass' && !hard.length && !trainingViolation ? 'pass' : 'flag',
    // Which brief this audit actually judged against — 'd1' vs 'repo' — so a thin owner edit is
    // visible on the draft's audit row rather than a mystery.
    brand_source: brand.source,
  };
}
