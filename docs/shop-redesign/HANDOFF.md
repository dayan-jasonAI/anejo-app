# Ordering experience redesign — 2026-09-09 UTC

Owner Codex. Dayan's direct request authorizes public ordering redesign, product families/customization, optional cross-sells, food images and new meals. Existing main through d040d8c preserved. No payment settings, customer records or real test orders changed.

## What changed
- One product card per family; live D1 SKU variants remain authoritative for price and kitchen identity.
- Seven sections: Lunch & dinner, Appetizers, Sides, Desserts, Catering, Fit, Sauces; menu search.
- Native accessible dialog with sizes, per-flavor quantities, prices and cart editing. Catering packs remain exact 25/50-piece or guest-count products rather than ambiguous bulk quantities.
- Existing bowl customization preserved. Optional cross-sell suggestions react to the cart and omit already-added families. No automatic paid add-ons.
- Delivery/contact form collapsed until review, mobile order bar and clearer cart navigation.
- Public /menu uses the same grouping and deep-links to the chosen product customization.
- Three original generated plate photos: lechon with congri/salad; ropa vieja with congri/maduros; four ropa-vieja stuffed tostones. Copied and optimized to project WebP files; originals retained.
- Existing lechon meal remains $16.95; correct meal photo replaces its former pork-only tray image. Catering pork tray image stays appropriate to its own tray product.
- 38 new SKU rows: two dishes and 36 variants using owner-confirmed flavors in cajita-food-options.js. Croquetas $2.50 / $40 for 25 / $75 for 50. Standard empanadas $3.50 / $75 / $145. Ropa vieja empanadas $4 / $85 / $165. Other existing prices untouched.

## New dish assumptions and evidence
- Ropa vieja meal $19.95: proposed serving 6 oz beef, confirmed-standard 8 oz congri, proposed 4 oz maduros. Illustrative cost allowance: 9 oz raw beef at $6/lb with 67% cooked yield = $3.38; sauce/vegetables $0.70; congri $1.80; maduros $0.70; packaging $1; allocated labor/energy $2; processing $0.88 => $10.46 variable cost, approximately 48% contribution. These are unmeasured planning assumptions, not invoices or guaranteed ROI.
- Tostones rellenos $12.95: four plantain cups, approximately 4 oz beef filling total. Planning cost $2.25 beef + $0.50 sauce + $1 plantain/oil + $0.65 packaging + $1.30 labor/energy + $0.68 processing = $6.38, approximately 51% contribution. Default ropa vieja used while optional filling preference question remains unanswered.
- Current direct local comparator: Don Ramon WPB lists ropa vieja with rice/plantains $17.95 at https://donramonwpb.com/meat-nostalgia/ and stuffed tostones with ropa vieja $10.95 at https://donramonwpb.com/apps/. Retrieved this turn; portions are not matched, so these are market anchors rather than proof of equal value/cost.
- Alternate flavor launch prices are recommendations within the existing product price ladder; no claim of measured per-flavor margin. New meal/variant authorization comes from this request plus the owner-confirmed flavor source, not a generated photo.

## Validation
- 1,902 tests pass; lint zero errors, two existing vendor warnings.
- Grouping tests: every SKU reachable once; one retail and one catering family for croquetas/empanadas; sauces and desserts categorized separately.
- Browser: mixed flavors, editing, 50-piece catering price, bowl cross-sell suggestions, checkout review expansion, public menu grouping, mobile overflow and JS errors checked. No payment/checkout request submitted. browser-checks.json and screenshots hold evidence.
- Scheduled-only server enforcement unchanged. Choosing scheduled food explicitly explains the delivery change in its dialog.
- Rollback SQL hides only new SKUs and restores previous lechon card fields, preserving orders. Before snapshot retained.

Publication evidence to be appended after rollout.
