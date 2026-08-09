// Añejo HUB — the AI budget meter. The owner set a HARD $50/week ceiling on model spend,
// and HARD MEANS HARD: every api.anthropic.com caller records what it spent (recordSpend)
// and asks budgetGate() BEFORE spending more. At the ceiling new calls are refused and each
// surface falls back to the same copy it shows when no API key is configured — the budget
// never silently borrows from next week.
//
// All money is INTEGER MICRODOLLARS ($1 = 1,000,000): floating-point money drifts, and a
// drifting sum is a ceiling that moves.
// Files under functions/_lib are NOT routed.
import { id, now, today } from './hub.js';

// The owner's ceiling: $50/week, in microdollars.
export const WEEKLY_LIMIT_MICRO = 50_000_000;

// USD per MTok is EXACTLY microdollars per token, so cost math is whole-integer multiplies.
// Priced from the Anthropic API price list on 2026-07-31. STALE PRICES UNDERCOUNT: a price
// rise we have not copied in lets real spend sail past the $50 ceiling unnoticed — review
// this table quarterly.
const PRICES = {
  'claude-sonnet-4-6': { in: 3, out: 15 },
  'claude-sonnet-4-5': { in: 3, out: 15 },   // retired id — kept so historical spend rows still price
  'claude-haiku-4-5': { in: 1, out: 5 },
  // The Team Lead's frontier tier. Without a row here an opus call priced at the sonnet rate —
  // a 5x UNDERCOUNT against the $50 ceiling, flagged by the lead module's own build report.
  'claude-opus-4-6': { in: 15, out: 75 },
  'claude-opus-4-5': { in: 15, out: 75 },
};

// Cost of a call in microdollars. Dated ids ('claude-haiku-4-5-20251001') resolve by longest
// matching prefix. An UNKNOWN model is priced as the most expensive row on purpose:
// overcounting throttles early and visibly, undercounting quietly breaks the ceiling.
export function priceFor(model, usage = {}) {
  const inTok = Math.max(0, Math.floor(Number(usage.in) || 0));
  const outTok = Math.max(0, Math.floor(Number(usage.out) || 0));
  const key = Object.keys(PRICES)
    .filter((k) => String(model || '').startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  const p = key
    ? PRICES[key]
    : Object.values(PRICES).reduce((a, b) => ((b.in + b.out) > (a.in + a.out) ? b : a));
  return inTok * p.in + outTok * p.out;
}

// ISO week 'YYYY-WW' of an ET calendar date. ISO because the year boundary must not split a
// week into two budgets (Jan 1 can belong to week 52/53 of the prior ISO year). Noon UTC
// anchors the parse clear of DST edges; the week's Thursday decides which ISO year owns it.
export function isoWeekOf(dateStr) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - jan4) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, '0')}`;
}

export const currentWeek = () => isoWeekOf(today());

// Record one call's spend. Best-effort by design: metering must never break the feature
// that spent — but a failed insert means an UNDERCOUNTED week, so the gate should always
// run before the call, not instead of this.
export async function recordSpend(env, { feature, model, usage } = {}) {
  if (!env || !env.DB || !usage) return;
  const inTok = Math.max(0, Math.floor(Number(usage.input_tokens) || 0));
  const outTok = Math.max(0, Math.floor(Number(usage.output_tokens) || 0));
  if (!inTok && !outTok) return;
  const day = today();
  try {
    await env.DB.prepare(
      'INSERT INTO ai_spend (id, week, day, feature, model, input_tokens, output_tokens, cost_microdollars, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(
      id('ais'), isoWeekOf(day), day,
      String(feature || 'unknown').slice(0, 60), String(model || 'unknown').slice(0, 80),
      inTok, outTok, priceFor(model, { in: inTok, out: outTok }), now()
    ).run();
  } catch { /* best-effort — see note above */ }
}

// Total microdollars spent so far this ISO week. Returns 0 when the table is missing or the
// query fails: a broken meter has also recorded nothing, so blocking every AI surface on it
// would punish the customer for our own migration gap.
export async function weekSpend(env) {
  if (!env || !env.DB) return 0;
  try {
    const r = await env.DB.prepare('SELECT COALESCE(SUM(cost_microdollars),0) AS c FROM ai_spend WHERE week=?')
      .bind(currentWeek()).first();
    return Math.max(0, Number(r && r.c) || 0);
  } catch { return 0; }
}

export async function underBudget(env, limitMicro = WEEKLY_LIMIT_MICRO) {
  const spent = await weekSpend(env);
  return { ok: spent < limitMicro, spent, remaining: Math.max(0, limitMicro - spent) };
}

// The refusal every caller checks BEFORE a new model call. spent >= limit is a hard NO —
// there is no soft overage, no "one more small call": the last call before the ceiling may
// overshoot slightly (its cost lands after it runs), and that overshoot is the only slack
// the owner accepted.
export async function budgetGate(env, limitMicro = WEEKLY_LIMIT_MICRO) {
  const b = await underBudget(env, limitMicro);
  if (b.ok) return { ok: true, spent: b.spent, remaining: b.remaining };
  return { ok: false, reason: 'weekly AI budget reached', spent: b.spent, remaining: 0 };
}

// Flat USD-per-image prices, in microdollars, for providers billed per-image rather than
// per-token (image generation isn't metered in input/output tokens the way Claude calls are).
// Looked up from each provider's own pricing docs/community writeups on 2026-08-02 — see
// _lib/plate_image.js for the provider chain these price. Same STALE-PRICES-UNDERCOUNT warning
// as PRICES above (review quarterly), and rounded UP toward the documented high end of each
// provider's range for the same reason unknown models price HIGH there: overcounting throttles
// early and visibly, undercounting quietly sails past the $50 ceiling.
const IMAGE_PRICES_MICRO = {
  // OpenAI gpt-image-1, 1024x1024 'medium' quality (the tier plate_image.js requests): OpenAI's
  // own published range runs roughly $0.04-$0.19/image depending on quality/size; priced near
  // the top of that range rather than the bottom.
  'gpt-image-1': 80_000,
  // OpenAI gpt-image-2 — the current flagship and what plate_image.js now asks for by default.
  // Published range runs about $0.005-$0.211/image across quality tiers and sizes; we request
  // 1024x1024 'medium', but this is priced near the TOP of the range on purpose, for the same
  // reason every other row is: an undercount sails past the $50 ceiling silently, an overcount
  // just throttles early and visibly. Revisit with a real invoice once live traffic has run.
  'gpt-image-2': 90_000,
  // gpt-image-1.5 — priced only so a deliberate rollback to it is still metered rather than
  // falling through to the unknown-model default. Not the default anywhere.
  'gpt-image-1.5': 85_000,
  // Google gemini-2.5-flash-image ("nano banana"): billed as output tokens, 1290 tokens/image
  // at $30/MTok = ~$0.0387/image. Rounded up for headroom.
  'gemini-2.5-flash-image': 45_000,
  // Workers AI Leonardo Phoenix: 1024x1024 = four 512x512 tiles (530 neurons each) + 30 steps
  // (10 neurons each) = 2420 neurons, at $0.011/1,000 neurons = ~$0.0266/image.
  '@cf/leonardo/phoenix-1.0': 30_000,
};
// An unpriced/unknown model bills at the most expensive KNOWN row — same "undercounting breaks
// the ceiling, overcounting just throttles early" rule priceFor() uses for text models.
const DEFAULT_IMAGE_PRICE_MICRO = Math.max(...Object.values(IMAGE_PRICES_MICRO));

export function priceForImage(model) {
  return IMAGE_PRICES_MICRO[model] ?? DEFAULT_IMAGE_PRICE_MICRO;
}

// Record one image call's spend into the SAME ai_spend ledger the $50/week ceiling is computed
// over — image generation is not a separate budget, it draws from the identical pool the
// chat/social/eod-draft features already share. Best-effort by design, same as recordSpend: a
// failed insert must never break the feature that just successfully made an image.
export async function recordImageSpend(env, { feature, provider, model } = {}) {
  if (!env || !env.DB) return;
  const day = today();
  try {
    await env.DB.prepare(
      'INSERT INTO ai_spend (id, week, day, feature, model, input_tokens, output_tokens, cost_microdollars, created_at) VALUES (?,?,?,?,?,?,?,?,?)'
    ).bind(
      id('ais'), isoWeekOf(day), day,
      String(feature || 'unknown').slice(0, 60), String(model || provider || 'unknown').slice(0, 80),
      0, 0, priceForImage(model), now()
    ).run();
  } catch { /* best-effort — see recordSpend note above */ }
}
