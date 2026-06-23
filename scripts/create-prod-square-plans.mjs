#!/usr/bin/env node
// Create the 3 Añejo subscription plans in your PRODUCTION Square catalog and print the
// variation IDs to paste into Cloudflare (SQUARE_PLAN_5_VAR / _10_VAR / _12_VAR).
//
// Your PRODUCTION access token never leaves your machine — it is read from the environment,
// never written anywhere. Run it like this (do NOT paste the token into chat):
//
//   SQUARE_ACCESS_TOKEN='YOUR_PRODUCTION_TOKEN' node scripts/create-prod-square-plans.mjs
//
// Safe to re-run: each run creates fresh plans (Square allows duplicates); just use the IDs
// from your most recent run. Mirrors the sandbox tiers in functions/_lib/plans.js.

const TOKEN = process.env.SQUARE_ACCESS_TOKEN;
if (!TOKEN) {
  console.error('✗ Set SQUARE_ACCESS_TOKEN to your PRODUCTION token, e.g.\n' +
    "  SQUARE_ACCESS_TOKEN='EAAA…' node scripts/create-prod-square-plans.mjs");
  process.exit(1);
}
if (/^EAAAl?[A-Za-z0-9_-]*sandbox/i.test(TOKEN) || TOKEN.includes('sandbox')) {
  console.error('✗ That looks like a SANDBOX token. Use your PRODUCTION access token from the Square Developer dashboard.');
  process.exit(1);
}

const BASE = 'https://connect.squareup.com';            // PRODUCTION
const H = { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' };
const rnd = () => 'anejo_' + Math.random().toString(36).slice(2) + Date.now().toString(36);

// Tier prices = the standard-bowl weekly fallback (cents). Dynamic per-member pricing still
// overrides these at checkout; these variations are the weekly cadence anchor + parent plan.
const TIERS = [
  { key: 'plan_5',  name: 'Añejo Weekly · 5 bowls',  cents: 9900 },
  { key: 'plan_10', name: 'Añejo Weekly · 10 bowls', cents: 18900 },
  { key: 'plan_12', name: 'Añejo Weekly · 12 bowls', cents: 21900 },
];

async function api(path, body) {
  const r = await fetch(BASE + path, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) throw new Error((d.errors && d.errors[0] && d.errors[0].detail) || ('HTTP ' + r.status));
  return d;
}

const out = {};
for (const t of TIERS) {
  // 1) parent subscription plan
  const plan = await api('/v2/catalog/object', {
    idempotency_key: rnd(),
    object: { type: 'SUBSCRIPTION_PLAN', id: '#plan', subscription_plan_data: { name: t.name } },
  });
  const planId = plan.catalog_object.id;
  // 2) weekly variation at the tier price (STATIC)
  const variation = await api('/v2/catalog/object', {
    idempotency_key: rnd(),
    object: {
      type: 'SUBSCRIPTION_PLAN_VARIATION', id: '#var',
      subscription_plan_variation_data: {
        name: t.name + ' · Weekly',
        subscription_plan_id: planId,
        phases: [{ cadence: 'WEEKLY', ordinal: 0, pricing: { type: 'STATIC', price_money: { amount: t.cents, currency: 'USD' } } }],
      },
    },
  });
  out[t.key] = variation.catalog_object.id;
  console.error(`  ✓ ${t.name} → variation ${out[t.key]}`);
}

console.log('\n=== Paste these into Cloudflare → Pages → anejo-app → Settings → Variables & Secrets (Production) ===\n');
console.log('SQUARE_PLAN_5_VAR  = ' + out.plan_5);
console.log('SQUARE_PLAN_10_VAR = ' + out.plan_10);
console.log('SQUARE_PLAN_12_VAR = ' + out.plan_12);
console.log('\nKeep these with the rest of your go-live packet (see docs/SQUARE_GOLIVE.md).');
