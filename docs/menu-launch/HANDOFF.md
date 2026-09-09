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
