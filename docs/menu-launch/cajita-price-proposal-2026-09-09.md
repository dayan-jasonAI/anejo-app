# Cajita automatic-pricing proposal — NOT LIVE

Status: Draft; Needs Dayan confirmation for selling prices and component credits.
Owner: Codex. Scope: internal pricing prototype; no production changes or payments.

## Proposed schedule

The full standard box is **$17.50**; preset-themed printed packaging is **$19.50**.
These are proposed selling prices, not measured costs or verified margins.

| Component | Proposed charge / removal credit |
| --- | ---: |
| Packaging and assembly, retained per box | $3.00 |
| Hawaiian roll with ham spread | $2.25 |
| Guava-and-cheese empanada, 1.25 oz | $2.50 |
| Ham croqueta, 1.20 oz fried | $1.75 |
| Cold salad, 6 oz | $3.50 |
| One grape/ham/guava/cheese/pineapple skewer | $2.50 |
| Tres leches, 3–4 oz | $2.00 |
| Preset-themed printing, per box | +$2.00 |

Each additional component uses the same proposed charge. Removing dessert gives a
$15.50 standard box. Twenty complete boxes plus ten without dessert total $505.00
before delivery and tax. No volume discount or minimum order has been assumed.
All individual charges/credits need approval along with the headline prices.

Unpriced fillings, grazing bites, bespoke artwork, special pick shapes and larger
packaging remain review-only. They must never silently become free or be omitted.
Color choice alone should not alter price within an approved printing template;
physical printing/pick production specifications still need definition.

## Evidence and limitations

Confirmed replacement box cost: $19.99 / 25 = $0.7996. Liner $8.99 / 150 =
$0.05993 each; deli sheet $7.99 / 200 = $0.03995; themed pick $8.97 / 100 =
$0.0897. Assuming two liners and one sheet/pick, those materials total $1.04912
per box, EXCLUDING dessert container, labels, tags, food, labor, waste and fees.
The $15 labels/tags purchase covered both boxes and trays, so $0.60 per box is
not a measured allocation. Dessert-container pack quantity is unknown.

Earlier local production-data.json under the ChatGPT project's
`output/anejo-production-guide 2` proposed $16 and modeled $9.57 total cost.
It explicitly used estimates and only 3 oz salad, a chicken croqueta and a
generic bocadito. It is not an accurate cost sheet for today's standard box.

Market positioning references inspected during this task:
- [Cortadito West Palm Beach party platters](https://www.cortaditocubancafe.com/menu-categories/party-platters):
  ham croquetas 25/$43.75; product weights are not specified.
- [Bulla catering boxed lunches](https://bullagastrobar.com/wp-content/pdf/BULALL_CateringMenu_LunchBoxes.pdf):
  $19.95 chicken sandwich lunch box with chips and dessert; different product,
  not a like-for-like Cajita comparison. PDF marked 03.26.

These support a premium-positioning comparison only, not a claim that $17.50 is
the best market price. Actual ingredient yields, labor and packing consumption
are still needed to validate profitability.

## Activation gates

1. Dayan approves the entire selling-price/credit schedule above.
2. Define which printed templates/picks and food configurations fit stocked boxes.
3. Add server-owned versioned prices and immutable order configuration snapshots;
   ignore browser-supplied prices. A displayed estimate is not payment authority.
4. Revalidate 48-hour standard / 72-hour printed notice, stock, packaging fit,
   delivery and tax before starting payment. No speculative rush fees.
5. Test payment completion, replay-safe order creation, full per-variant kitchen
   details, Hub notification and email delivery using the existing provider.

## Implementation and validation

Created `src/cajita/pricing.js` and `test/cajita-draft-pricing.test.mjs`.
The pure prototype handles removals, duplicates, quantities and separate box
versions. Unknown choices produce a null total with review reasons.
It is intentionally not imported into the builder or checkout. Its eligibility
flag always remains false, even with an approved price policy, because a price
calculation does not establish fulfillment availability.

Validation: `node --test test/cajita-draft-pricing.test.mjs` — 8 passed, 0 failed.
Full `npm test --silent`: 1,935 passed, 0 failed. Lint: 0 errors, 2 existing
vendor warnings. `git diff --check` and packaging scenario assertion passed.
No website, production database, payment settings or deployed bundle modified.
Rollback: remove the two isolated draft files and this proposal; no live rollback needed.

Notebook analysis runtime was unavailable (nbformat missing in both Python
environments). Cost arithmetic is reproduced by the accompanying Node script,
without installing services or packages.
