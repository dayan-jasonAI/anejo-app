// quote.js — Añejo catering quote engine (F3).
//
// Implements the cost-up model Dayan specified: per-head price is BUILT from real costs,
// never picked. Food + labor + packaging + overhead + travel, then margin on top.
//
// THE CORE RULE: this engine REFUSES to quote when an input is missing. It does not fall back
// to an "industry average", because a plausible-looking invented price is worse than no price —
// it reads authoritative while being fiction, and someone would send it to a customer. Every
// number out of here traces to a number Dayan put in.
//
// Pure functions, no I/O, no network — so the arithmetic is unit-testable without a kitchen.

/** Inputs Dayan must supply before ANY quote is possible. Names match his 4-input framework. */
export const REQUIRED_INPUTS = [
  "foodCostPerHead",      // 1. FOOD  — supplier cost of the food one guest eats
  "targetFoodCostPct",    // 1. FOOD  — 0.30 = 30% (his note: premium brand aims 30–32%)
  "laborRatePerHour",     // 2. LABOR — actual pay rate per staff member
  "hoursPerEvent",        // 2. LABOR — prep + travel + service + breakdown
  "guestsPerStaff",       // 2. LABOR — his note: 1 staff per 25–30 guests is a common start
  "packagingPerHead",     // 4. OVERHEAD — container + lid + sauce cup + label
  "overheadPerEvent",     // 4. OVERHEAD — equipment depreciation + kitchen share + admin time
  "targetNetMargin",      // his note: target 20–30% net for catering
];

/** Optional — omitted means "not charged", never a guessed default. */
export const OPTIONAL_INPUTS = ["mileageRate", "milesRoundTrip", "staffingSurchargePct"];

const money = (n) => Math.round(n * 100) / 100;

/**
 * Validate inputs. Returns { ok } or { ok:false, missing, invalid } — never a partial quote.
 * A missing input is a REFUSAL, not a default.
 */
export function validateInputs(input = {}) {
  const missing = REQUIRED_INPUTS.filter((k) => {
    const v = input[k];
    return v === undefined || v === null || v === "" || Number.isNaN(Number(v));
  });
  const invalid = [];
  if (input.targetFoodCostPct != null && (Number(input.targetFoodCostPct) <= 0 || Number(input.targetFoodCostPct) >= 1))
    invalid.push("targetFoodCostPct must be a fraction between 0 and 1 (0.30 = 30%)");
  if (input.targetNetMargin != null && (Number(input.targetNetMargin) < 0 || Number(input.targetNetMargin) >= 1))
    invalid.push("targetNetMargin must be a fraction between 0 and 1 (0.25 = 25%)");
  if (input.guestsPerStaff != null && Number(input.guestsPerStaff) <= 0)
    invalid.push("guestsPerStaff must be greater than 0");
  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

/**
 * Build a quote for a specific headcount.
 * Returns a full breakdown so every dollar is traceable — a quote you cannot explain to a
 * customer is a quote you should not send.
 */
export function buildQuote(input, guestCount) {
  const v = validateInputs(input);
  if (!v.ok) {
    return {
      ok: false,
      error: "cannot quote — missing real cost inputs",
      missing: v.missing,
      invalid: v.invalid,
      note: "This engine will not invent prices. Supply the missing figures and the quote computes exactly.",
    };
  }
  const guests = Number(guestCount);
  if (!Number.isFinite(guests) || guests <= 0) return { ok: false, error: "guestCount must be greater than 0" };

  const foodPerHead = Number(input.foodCostPerHead);
  const packagingPerHead = Number(input.packagingPerHead);

  // LABOR: staff count rounds UP — you cannot send 2.3 people to an event.
  const staffNeeded = Math.ceil(guests / Number(input.guestsPerStaff));
  const laborTotal = staffNeeded * Number(input.hoursPerEvent) * Number(input.laborRatePerHour);
  const laborPerHead = laborTotal / guests;

  // TRAVEL: only charged if both figures were supplied. Omitted = not charged, never guessed.
  const travelTotal = (input.mileageRate != null && input.milesRoundTrip != null)
    ? Number(input.mileageRate) * Number(input.milesRoundTrip) : 0;
  const travelPerHead = travelTotal / guests;

  const overheadPerHead = Number(input.overheadPerEvent) / guests;

  const costPerHead = foodPerHead + laborPerHead + packagingPerHead + overheadPerHead + travelPerHead;

  // MARGIN is a margin, not a markup: price = cost / (1 - margin). Marking cost UP by 25%
  // yields a 20% margin, not 25% — a mistake that quietly underprices every single event.
  const margin = Number(input.targetNetMargin);
  const pricePerHead = costPerHead / (1 - margin);

  // Cross-check against his food-cost rule: food ÷ price should land near the target.
  const impliedFoodCostPct = foodPerHead / pricePerHead;
  const target = Number(input.targetFoodCostPct);
  const foodCostFlag = impliedFoodCostPct > target * 1.15
    ? `food cost is ${(impliedFoodCostPct * 100).toFixed(1)}% of price — above your ${(target * 100).toFixed(0)}% target; the menu or the price needs a look`
    : null;

  const staffingSurcharge = input.staffingSurchargePct != null
    ? money(pricePerHead * guests * Number(input.staffingSurchargePct)) : 0;

  return {
    ok: true,
    guests,
    perHead: money(pricePerHead),
    total: money(pricePerHead * guests + staffingSurcharge),
    breakdown: {
      foodPerHead: money(foodPerHead),
      laborPerHead: money(laborPerHead),
      packagingPerHead: money(packagingPerHead),
      overheadPerHead: money(overheadPerHead),
      travelPerHead: money(travelPerHead),
      costPerHead: money(costPerHead),
      marginPct: margin,
      staffNeeded,
      staffingSurcharge,
    },
    checks: {
      impliedFoodCostPct: Math.round(impliedFoodCostPct * 1000) / 10,
      targetFoodCostPct: Math.round(target * 1000) / 10,
      flag: foodCostFlag,
    },
  };
}

/** Deposit due at booking. Percentage is Dayan's to set; there is no industry default here. */
export function depositFor(quote, depositPct) {
  if (!quote || !quote.ok) return { ok: false, error: "no valid quote" };
  if (depositPct == null || Number.isNaN(Number(depositPct)))
    return { ok: false, error: "depositPct required — this engine does not assume a deposit rate" };
  return { ok: true, deposit: money(quote.total * Number(depositPct)), balance: money(quote.total * (1 - Number(depositPct))) };
}
