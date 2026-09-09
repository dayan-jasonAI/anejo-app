// Reproducible partial packaging scenario, NOT a fully loaded cost or margin.
import assert from 'node:assert/strict';
const assumptions = { linersPerBox: 2, sheetsPerBox: 1, picksPerBox: 1 };
const knownPartialCost = 19.99 / 25 + assumptions.linersPerBox * 8.99 / 150
  + assumptions.sheetsPerBox * 7.99 / 200 + assumptions.picksPerBox * 8.97 / 100;
assert.ok(Math.abs(knownPartialCost - 1.0491166666666667) < 0.0000001);
console.log(JSON.stringify({ assumptions, knownPartialCost,
  excluded: ['dessert container', 'labels/tags', 'food', 'labor', 'waste', 'payment fees'],
  actualMarginVerified: false }, null, 2));
