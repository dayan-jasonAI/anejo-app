# Añejo Buyer Production Implementation Proposal

## Copy-only changes

- Revise homepage hero to lead with fresh food cooked today and delivered today.
- Use "Order Today" and "See Today's Menu" as primary/secondary CTAs if aligned with live operations.
- Add a concise trust strip: fresh today, delivered daily, standard or macro-personalized.
- Reframe Macro Portal as a parallel path, not the default path.
- Add plain pricing/value language before checkout.

## Styling changes

- Preserve current black/green/cream/gold palette and typography.
- Add a first-viewport food/delivery visual treatment.
- Add responsive sticky mobile order CTA.
- Tighten card spacing and button hierarchy on homepage sections.

## Reusable component changes

- Extract shared public-page button, product card, price line, and trust-strip styles if production work expands beyond one page.
- Consider moving repeated public styles into `public/assets/brand.css` or a new public marketing stylesheet.

## New components

- Homepage hero with food/delivery proof.
- Video-ready hero media layer with poster, desktop/mobile source support, reduced-motion fallback, and image fallback.
- Two-path chooser for standard versus personalized meals.
- Pricing/value module.
- Macro Portal explainer module.
- SMS/email preview or delivery-update reassurance module.

## Routing changes

- Low-risk: add prototype route only.
- Production: update `/` sections and link hierarchy after owner review.
- No changes proposed to `/order`, `/subscribe`, `/calculator`, `/portal`, `/intake.html`, `/plan.html`, auth, checkout APIs, hub routes, or database schema in the first production pass.

## Analytics changes

- Add namespaced browser events only after event naming is approved.
- Keep prototype analytics separate from production conversion events.
- If production events are added, follow object.action naming and ensure any browser capture path is allowlisted.

## Backend dependencies

- Confirm current D1 menu item prices and availability.
- Confirm current delivery fee/order minimum/tax env defaults.
- Confirm current service-area copy and zip logic.
- Confirm whether skip/pause/cancel user flows should be linked from marketing copy.

## Data dependencies

- D1 `menu_items` and `menu_modifier_prices` for current menu/pricing.
- `functions/_lib/bowlspec.js` for macro ranges and ingredients.
- `functions/_lib/plans.js` for plan cadence and fallback pricing.
- Existing images in `public/assets/img/`.

## High-risk changes

- Any change to payment logic, Square checkout creation, subscription creation, auth, D1 schema, kitchen ticket visibility, order status handling, delivery automation, production deployments, or live analytics dashboards.
- Any production Sora/video generation, video upload, public publishing, or paid generation spend without owner approval.

## Low-risk immediate changes

- Copy improvements on homepage.
- Additional static explanatory sections.
- Visual hierarchy improvements using existing assets.
- Prototype-only route and documentation.

## Changes that could be deployed today after owner review

- Hero copy and CTA hierarchy.
- Trust strip.
- Two-path standard/macro explainer.
- Pricing/value explanation using confirmed current values.
- Sticky mobile CTA linking to `/order`.

## Changes that require testing first

- Any integration with live `/api/menu`.
- New analytics events.
- Checkout-entry UI changes.
- Subscription copy that references pause/skip/cancel details.
- Any claim about same-day availability tied to real cutoff/stock logic.
- Production video or AI-generated video assets.
- Final video compression, crop behavior, text/logo overlays, reduced-motion behavior, and load performance.
