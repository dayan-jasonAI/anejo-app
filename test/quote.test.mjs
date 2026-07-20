// quote.test.mjs — the Añejo quote engine's contract.
//
// The single most important test in this file is the FIRST one: with inputs missing, the
// engine must REFUSE. A catering quote that looks authoritative but was invented is worse
// than no quote — someone sends it, and now a fabricated number is a commitment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildQuote, validateInputs, depositFor, REQUIRED_INPUTS } from "../functions/_lib/quote.js";

// A complete, INTERNALLY CONSISTENT input set. These are illustrative test fixtures, NOT
// Dayan's real costs — his actual figures are still outstanding.
const INPUTS = {
  foodCostPerHead: 6.20,      // his own worked example
  targetFoodCostPct: 0.30,
  laborRatePerHour: 22,
  hoursPerEvent: 6,
  guestsPerStaff: 25,
  packagingPerHead: 1.10,
  overheadPerEvent: 180,
  targetNetMargin: 0.25,
};

test("REFUSES to quote when any input is missing — never invents a price", () => {
  const q = buildQuote({}, 50);
  assert.equal(q.ok, false);
  assert.equal(q.missing.length, REQUIRED_INPUTS.length, "every missing input must be named");
  assert.match(q.note, /will not invent/i);
});

test("refuses on EACH individual missing input, not just an empty object", () => {
  for (const key of REQUIRED_INPUTS) {
    const partial = { ...INPUTS };
    delete partial[key];
    const q = buildQuote(partial, 50);
    assert.equal(q.ok, false, `missing ${key} must block the quote`);
    assert.ok(q.missing.includes(key), `${key} must be named as missing`);
  }
});

test("rejects a percentage entered as 30 instead of 0.30", () => {
  // The classic input error. 30 would otherwise compute a wildly wrong price.
  const v = validateInputs({ ...INPUTS, targetFoodCostPct: 30 });
  assert.equal(v.ok, false);
  assert.match(v.invalid.join(" "), /fraction between 0 and 1/);
});

test("margin is a MARGIN, not a markup", () => {
  // cost / (1 - 0.25) = cost × 1.333…  A 25% markup would give cost × 1.25 and silently
  // deliver a 20% margin — underpricing every event forever.
  const q = buildQuote(INPUTS, 100);
  assert.equal(q.ok, true);
  const impliedMargin = (q.perHead - q.breakdown.costPerHead) / q.perHead;
  assert.ok(Math.abs(impliedMargin - 0.25) < 0.005, `expected ~25% margin, got ${(impliedMargin * 100).toFixed(1)}%`);
});

test("staff count rounds UP — you cannot send 2.3 people to an event", () => {
  assert.equal(buildQuote(INPUTS, 26).breakdown.staffNeeded, 2, "26 guests at 25/staff needs 2");
  assert.equal(buildQuote(INPUTS, 50).breakdown.staffNeeded, 2);
  assert.equal(buildQuote(INPUTS, 51).breakdown.staffNeeded, 3);
});

test("per-head cost FALLS as headcount rises — fixed costs spread", () => {
  const small = buildQuote(INPUTS, 25);
  const large = buildQuote(INPUTS, 200);
  assert.ok(large.perHead < small.perHead,
    `200 guests (${large.perHead}) should price below 25 (${small.perHead}) — overhead is fixed per event`);
});

test("travel is charged ONLY when both figures are supplied — never guessed", () => {
  const without = buildQuote(INPUTS, 50);
  assert.equal(without.breakdown.travelPerHead, 0, "no mileage inputs = no travel charge");
  const withTravel = buildQuote({ ...INPUTS, mileageRate: 0.67, milesRoundTrip: 40 }, 50);
  assert.ok(withTravel.breakdown.travelPerHead > 0);
  assert.ok(withTravel.perHead > without.perHead, "travel must raise the price");
});

test("every dollar is traceable — the breakdown reconciles to cost", () => {
  const q = buildQuote({ ...INPUTS, mileageRate: 0.67, milesRoundTrip: 40 }, 60);
  const b = q.breakdown;
  const sum = b.foodPerHead + b.laborPerHead + b.packagingPerHead + b.overheadPerHead + b.travelPerHead;
  assert.ok(Math.abs(sum - b.costPerHead) < 0.02, "components must sum to costPerHead");
  assert.ok(q.perHead > b.costPerHead, "price must exceed cost");
});

test("flags when food cost drifts above the target percentage", () => {
  const pricey = buildQuote({ ...INPUTS, foodCostPerHead: 22 }, 50);
  assert.ok(pricey.checks.flag, "expensive food against the same margin should raise a flag");
  assert.match(pricey.checks.flag, /above your 30% target/);
  assert.equal(buildQuote(INPUTS, 50).checks.flag, null, "in-range food cost must not flag");
});

test("deposit refuses without an explicit rate — no assumed 50%", () => {
  const q = buildQuote(INPUTS, 50);
  assert.equal(depositFor(q, null).ok, false);
  const d = depositFor(q, 0.5);
  assert.equal(d.ok, true);
  assert.ok(Math.abs(d.deposit + d.balance - q.total) < 0.02, "deposit + balance must equal total");
});

test("guestCount must be positive", () => {
  assert.equal(buildQuote(INPUTS, 0).ok, false);
  assert.equal(buildQuote(INPUTS, -5).ok, false);
});
