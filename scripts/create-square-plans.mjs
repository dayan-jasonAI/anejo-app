// One-time: create Añejo's 3 weekly subscription plans in the PRODUCTION Square catalog
// and print the variation IDs to paste into Cloudflare Pages.
//
// Run it like this (your token stays on your machine — never paste it into chat):
//   SQUARE_ACCESS_TOKEN="EAAA...your PRODUCTION access token..." node scripts/create-square-plans.mjs
//
// Prices below are the standard weekly fallbacks ($99 / $189 / $219). Bowls are still
// portion-priced per member at checkout; these are just the plan anchors. Edit if your prices differ.

const token = process.env.SQUARE_ACCESS_TOKEN;
if (!token) {
  console.error('Set SQUARE_ACCESS_TOKEN to your PRODUCTION Square access token, then re-run.');
  process.exit(1);
}
const BASE = 'https://connect.squareup.com'; // PRODUCTION (sandbox would be connect.squareupsandbox.com)
const H = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
const rnd = () => 'anejo-' + Math.random().toString(36).slice(2) + '-' + Date.now();

const TIERS = [
  { env: 'SQUARE_PLAN_5_VAR',  name: 'Añejo Weekly — 5 bowls',  cents: 9900 },
  { env: 'SQUARE_PLAN_10_VAR', name: 'Añejo Weekly — 10 bowls', cents: 18900 },
  { env: 'SQUARE_PLAN_12_VAR', name: 'Añejo Weekly — 12 bowls', cents: 21900 },
];

console.log('\nCreating 3 weekly subscription plans in PRODUCTION Square…\n');
const results = [];
for (const t of TIERS) {
  const body = {
    idempotency_key: rnd(),
    object: {
      type: 'SUBSCRIPTION_PLAN', id: '#plan',
      subscription_plan_data: {
        name: t.name,
        subscription_plan_variations: [{
          type: 'SUBSCRIPTION_PLAN_VARIATION', id: '#var',
          subscription_plan_variation_data: {
            name: 'Weekly',
            phases: [{ cadence: 'WEEKLY', ordinal: 0, pricing: { type: 'STATIC', price_money: { amount: t.cents, currency: 'USD' } } }],
          },
        }],
      },
    },
  };
  const r = await fetch(BASE + '/v2/catalog/object', { method: 'POST', headers: H, body: JSON.stringify(body) });
  const d = await r.json();
  if (!r.ok) { console.error(`✗ ${t.name} FAILED:`, JSON.stringify(d.errors || d)); continue; }
  const map = (d.id_mappings || []).find((m) => m.client_object_id === '#var');
  const id = map ? map.object_id : '(NOT FOUND)';
  results.push(`${t.env} = ${id}`);
  console.log(`✓ ${t.name}  →  ${id}`);
}

console.log('\n──────────────────────────────────────────────');
console.log('Paste these into Cloudflare Pages → anejo-app → Settings → Variables & Secrets (Production):\n');
results.forEach((line) => console.log('  ' + line));
console.log('\nDone.\n');
