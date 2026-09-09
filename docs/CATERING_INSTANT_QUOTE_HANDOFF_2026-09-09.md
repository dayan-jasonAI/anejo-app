# Añejo — instant catering quotes + volume discount — Handoff

Date: 2026-09-09
Branch: `claude/anejo-catering-instant-quote-t1m6f1` · PR #63
Base: `origin/main` at `7f85a46`
Owner: Claude Code
Status: built and tested, NOT deployed — Red (client-facing pricing + the live storefront
checkout). Dayan approves.

## Reported

Dayan submitted a real catering request through `/catering` on 2026-09-09 (Cuban Food, 30 guests,
birthday, 2026-09-15) and got **no price and no checkout**. In the Hub the request arrived with the
products listed and an empty "Agreed total"; he typed `1200.00` by hand.

## What was actually happening

Most of the machinery already existed — Codex shipped the product selector and a live estimate API
earlier the same day. Two things stopped it firing on a real order:

| | |
|---|---|
| Any event-level design input set `needs_review` | and `checkout_eligible` was `!needs_review && items.length`, so **one** design field withheld the price for the **whole** order |
| Yuca has published tray prices (`catering_yuca-10/-25`) | but no selector product, so it had to be filed as "Other custom request", which nothing can price |

His order had both: a theme, colours and an attachment, plus a yuca line and a sausage croqueta
(a real kitchen item with no published tray SKU).

## What changed

**`_lib/catering-pricing.js` (new).** The volume discount, one implementation, shared by the quote
builder, the deposit endpoint, the Hub suggestion and `checkout.js`. Marginal slices — 5% of the
$500–$1,000 portion, 10% of $1,000–$2,000, 20% above $2,000 — chosen by Dayan over the first
sketch, which was **not monotonic**: 5% marginal plus two whole-order tiers made a $1,999 order net
$1,799 and a $2,000 order $1,600.

**`_lib/catering-estimate.js` (modified — Codex's file).** Three cases separated where there was one
blanket refusal. Event-level design no longer withholds the food. A line carrying **notes** is
priced for the quote but never enters the cart — *stronger* than the guard it replaces, which only
refused the order as a whole. An unpriced line is quoted by a person without blocking the rest.
`candidates()` became an exported `PRODUCT_PACKS` table so the picker and the pricer read one map.
**Codex's two unapproved equivalences are intact**: bocadito is still not substituted for a
Hawaiian roll with ham spread, and the 5 oz flavoured tres leches is still not substituted for the
3–4 oz cup. The flavoured cups are offered under their own names instead, which is not a
substitution.

**`api/catering-catalog.js` (new).** Price, photo and real tray sizes per product, off the same
mapping and the same live menu. Menu image paths get the site's `/assets/img/` prefix.

**`src/catering-products.js` (rewritten).** Cards with photo and price, one running order summary,
sauce add-ons, the discount ladder, both payment buttons.

**10 / 25 / 50 on every tray item.** The menu publishes no product with all three — servings come
as 10 and 25, pieces as 25 and 50, dessert cups by the 12 — so a first pass showed only the
published sizes and nothing ever offered the three Dayan asked for. The picker now builds the
missing sizes out of the trays that exist (50 servings of lechón is two 25 trays) and labels each
button with the exact cost, plus any other published size and a custom box. `exactCost()` mirrors
the server's knapsack locally for the LABEL only; every charge is still the server's number. It
also finds combinations cheaper than the obvious one — 25 dessert cups is 12+12+1 at $125.50, not
25 singles at $137.50 — and `test/money/catering-catalog-api.test.js` pins four of these against
the estimator so a button price can never drift from what the card is charged.

**`api/catering-deposit.js` (new).** Public 25% deposit booking, re-priced server-side.

**`api/checkout.js` (modified).** The volume discount applied at the card, scoped to catering SKUs.
It was not applied at all, so the page would have promised $543.70 and charged $546.00.

**`api/hub/owner/catering-deposit.js` + `hub/owner/catering.html`.** A suggested total on the
request card and prefilled into the Agreed total, with the unpriceable lines named.

## Verification

- 47 new tests. Mutation-checked: breaking the discount rate fails 11, `checkout_eligible=false`
  fails 9, discounting non-catering SKUs fails 1.
- Browser-driven at 1200px: 20 product cards with live prices and 17 photos, add-to-cart, the
  discount at two tiers, both pay buttons with correct amounts, no console errors. This is how a
  repaint bug was found — an arriving estimate rebuilt the whole builder and destroyed an open size
  picker mid-tap. Fixed by repainting only the totals block.
- Full suite 1995 pass / 1 fail (`hub-push-vendor.test.js`, identical on clean `main`).
- eslint 0 errors, `git diff --check` clean.
- **Not verified:** live production. No real card charged.

## For Dayan

1. **`checkout.js` is the main storefront money path.** Small, scoped change; still worth your eye.
2. Its wiring is covered by **structural tests over the source**, not an end-to-end endpoint run —
   named in `test/money/checkout-volume-discount.test.js` rather than glossed over.
3. **Bocadito vs the Hawaiian roll** — they look like the same product under two names. If they
   are, ham-spread rolls become instantly priceable. Not my call to make against Codex's note.
4. A $2,000 order saves **$125**, not the $225 I quoted when asking — $225 is the saving at $2,500.

## Note to Codex

`_lib/catering-estimate.js` is yours; I changed its `checkout_eligible` semantics and turned
`candidates()` into an exported table. Your two unapproved equivalences and the "never silently
enter checkout" guarantee are preserved — the noted-line case is now enforced by exclusion from the
cart rather than by refusing the order, which is strictly tighter. Both of your affected tests were
updated in place with the reasoning inline, not deleted.

## Files

- Created: `functions/_lib/catering-pricing.js`, `functions/api/catering-catalog.js`,
  `functions/api/catering-deposit.js`, `test/money/{catering-pricing,catering-catalog-api,
  catering-deposit-public,catering-hub-suggested,checkout-volume-discount}.test.js`, this handoff.
- Modified: `functions/_lib/catering-estimate.js`, `functions/api/checkout.js`,
  `functions/api/hub/owner/catering-deposit.js`, `public/assets/js/catering-products-catalog.js`,
  `public/hub/owner/catering.html`, `src/catering-products.js` (+ its built bundle),
  `test/money/catering-estimate{,-api}.test.js`.
