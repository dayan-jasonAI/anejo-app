# Añejo website and order-menu launch — 2026-09-08

Owner: Codex. Authorization: Dayan, direct session, “update the website and the order menu”, followed by “continue”. Scope: customer menu, ordering catalog, photos, portion descriptions, pricing and publication. No payment settings, credentials, customer records or real orders changed.

## Changes
- Added public /menu gallery: Catering, Traditional, Fit; EN/ES controls; live D1 prices.
- Linked homepage and catering page to the new menu.
- Prepared 76 new food/size/package SKUs (catalog.json), with optimized WebP illustrations. Product photos illustrate food rather than measured package contents.
- Confirmed portions: cold salad 6 oz; fried croqueta 1.20 oz; empanada 1.25 oz; lechón 6 oz; tamal 3 slices/approximately 5.5 oz; congrí 8 oz weight (no unverified cup equivalence).
- Preserved live Fit prices and stock settings, which differ from the earlier planning guide. Updated code fallbacks to that live snapshot.
- New Traditional/Catering items require scheduled fulfillment in both the UI and checkout. Existing paid-order kitchen gate unchanged.
- Development recipes, ambiguous Cajita packed configurations and Fit multipacks are not activated. Cajita remains in the existing custom-order flow. Fit packages require bowl-level inventory and kitchen accounting before launch as discounted bundles.

## Evidence and rollout
- menu-before.json: read-only D1 menu snapshot before modification (11 rows).
- catalog.json: exact new public SKU fields and prices, no internal cost data.
- scripts/menu-launch/activate.sql inserts only new IDs and price audit records; no schema change.
- scripts/menu-launch/rollback.sql hides only the new SKUs, preserving historical orders.
- Publish code before executing activation SQL so new SKUs cannot bypass scheduled-only enforcement.
- Browser at 390px: no JS errors; no horizontal overflow after mobile fix; 6 oz salad cart subtotal $5.50; scheduled mode selected from category link. Screenshots included.
- Lint passed. New menu tests passed. Initial full suite had a pre-existing nondeterministic catering-outbox race test failure; isolated recheck passed all 13. Final guarded deployment test results to be recorded below.

## Remaining limits
Production costs remain estimates, not measured profitability. Proposed unconfirmed serving sizes from the pricing guide become menu specifications for the launched products. No real payment/order smoke test is performed. Publishing does not prove kitchen fulfillment or ROI.

## Concurrent release preserved
Merged origin/main 9cce3d7 before deployment. That release confirms 6 oz Cajita salad and ham croqueta, superseding the earlier portion uncertainty above. Added ham croqueta single/25/50 formats at the same $2.50/$40/$75 croqueta price: total 79 new SKUs. Cajita pricing remains quote-based in its existing builder. Both sets of bilingual dictionary entries retained.

## Publication verified
Production deployment 9060afa0-b649-45cb-9f63-b2f20a617d1f from 63cd72e; Wrangler authenticated deployment listing confirms Production/main. Automatic postdeploy verification lacked API-token environment variables, so authenticated Wrangler listing plus live content checks were used instead. Guarded deploy passed all 1,893 tests. Initial upload connection failure was retried successfully.

D1 activation succeeded: 79 new SKUs, 90 total active catalog items, existing Fit prices unchanged. Live gallery shows 54 Catering and 25 Traditional entries. Existing sauce card received a product image without changing its price. Live browser confirmed $8.00 for one 6 oz cold salad and one ham croqueta, scheduled mode, no horizontal overflow and no page errors. No checkout/payment request submitted. See live-checks.json, live-catalog.json and live mobile screenshots.

Live verification script passed its public checks; optional contract database checks were skipped (outside this menu scope). The menu database was independently queried and all 79 prices checked. Main branch and release branch pushed at 63cd72e.

No additional approval needed for this authorized release. Remaining business next step: measure recipe yields/packaging and review margins after initial orders; Cajita/custom services stay quote-based and development items remain unlisted.

## 2026-09-09 — Cajita draft pricing follow-up (not deployed)

Direct-session request: Dayan asked to do automatic Cajita pricing next. Created
an isolated pure pricing prototype, eight tests, reproducible packaging scenario,
and `cajita-price-proposal-2026-09-09.md`. No existing application code changed.
Proposed $17.50 standard / $19.50 preset-printed schedule and removal credits
await Dayan confirmation; no production price or checkout authorization changed.
While waiting, validated mixed versions, duplicates, removals, unknown-price
handling and fulfillment gating. Full suite: 1,935 passed, zero failed. Lint:
zero errors, two existing vendor warnings. `git diff --check` passed; packaging
scenario assertion passed. Main remaining risks: unmeasured full costs, unapproved
component price allocation, box-fit/stock and end-to-end payment/notification proof.
Next: approve or revise the proposal before integrating server-owned checkout.

## 2026-09-09 — Complete-bundle prices approved

Dayan directly approved $18 standard / $20 preset-themed printing. Approval scope
is recorded in `cajita-bundle-approval-2026-09-09.md`. Added an isolated exact-bundle
calculator and three regression tests without promoting the old component-credit
draft. Eleven focused tests passed (zero failed); `git diff --check` passed.
Created two source/test files and an approval record; modified this handoff.
No production changes, database writes, checkout activation or deployment.
Remaining: server/checkout integration, configuration delivery and fulfillment
proof. No additional approval is needed for these two headline prices. While
integration remains open, validated tampered prices, invalid quantities,
duplicates, removals, substitutions and custom packaging rejection.
