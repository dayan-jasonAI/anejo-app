# Añejo Buyer Prototype Audit

Date: 2026-08-04  
Repository: `/Users/aiagent/Dayan Workspace/Aether/anejo-app`  
Branch: `codex/anejo-buyer-prototype`

## Current technology stack

- Cloudflare Pages static app served from `public/`.
- Cloudflare Pages Functions in `functions/`.
- Vanilla HTML, CSS, and JavaScript for the public customer site.
- Vite/React exists only for `hub-app/` and builds into `public/studio/`.
- D1 is used for owner-managed data including menu rows and pricing overrides.
- KV is used for sessions and some operational settings.
- Square powers checkout and subscriptions.
- Resend, Twilio, PostHog, Anthropic, and other integrations exist in server functions.
- `npm run dev` runs `wrangler pages dev public --compatibility-date=2026-05-01`.
- No general `npm run build` script exists for the static public site. `npm run build:studio` builds the hub studio bundle only.

## Relevant routes

- `/` marketing homepage.
- `/order` customer ordering flow.
- `/order/confirmed.html` confirmation page.
- `/subscribe` weekly subscription checkout.
- `/calculator` public macro calculator.
- `/portal`, `/intake.html`, and `/plan.html` trainer/Macro Portal related flows.
- `/client/dashboard` and `/client/payment` customer account/payment surfaces.
- `/menu/*` individual bowl SEO/menu pages.
- `/meal-prep/*` SEO landing pages.
- `/hub/*` internal Añejo Hub surfaces.
- `/api/menu`, `/api/checkout`, `/api/subscriptions/*`, `/api/plans/generate`, `/api/order-availability`, `/api/hub/track`, and related APIs.

## Existing reusable components

This app does not have a shared component system for public pages. Reuse is mostly by repeated inline patterns:

- Sticky black/gold navigation with emblem and wordmark.
- Hero sections with cream/black/green/gold palette.
- Product rows/cards in `public/order.html`.
- Plan-selection cards in `public/subscribe.html`.
- Form field, focus, error, and button styles repeated in public pages.
- Shared styles for calculator/trainer/plan pages in `public/assets/brand.css`.
- Shared language support in `public/assets/js/i18n.js`.

## Existing visual language

- Colors: near-black `#0D0D0D`, forest green `#1A3D2E`, cream `#F5F2EC`, gold around `#C6A85B`/`#C8BC6E`, muted gray, and white cards.
- Type: Josefin Sans for UI/body and Cormorant Garamond for brand/editorial headings.
- Brand assets: `emblem.png`, `logo_full.png`, favicon and app icons.
- Food assets: seven public bowl photos, one hidden/spec bowl photo, Fit drink photos, sauce photos, and OG images.
- Existing pages use dark premium sections, cream body surfaces, rounded cards, gold CTAs, uppercase navigation labels, and strong food photography.

## Existing product data

Observed in `functions/_lib/menu.js` and `functions/_lib/bowlspec.js`:

- Bowls: VIDA $19.99, FUEGO $22.99, LIGERO $18.99, MAR $22.99, COCO $22.99, CONGREEN $20.99, RAIZ $18.99.
- Drinks/add-ons: Fit drinks $9.99, extra signature sauce $1.50.
- Modifiers: standard extra $1.50, premium extra $3.00, extra sauce $1.50, half avocado $2.00, extra protein $4.50, sweet potato $2.00, sauce cup $1.50.
- Plans in `functions/_lib/plans.js`: 5 bowls/week $99, 10 bowls/week $189, 12 bowls/week $219. D1 may override standard weekly tier prices.
- Checkout defaults in `functions/api/checkout.js`: $25 order minimum, $5 delivery fee, 7% FL/Palm Beach sales tax. Environment variables can override these.
- Macro sizing can override per-bowl pricing for personalized subscriptions.

## Existing customer journey

- Visitor lands on `/`, sees a premium Añejo brand story, menu sections, and links to order, subscribe, and calculator.
- Standard ordering starts at `/order`, where customers select items, customize bowls, enter delivery details, and proceed to Square checkout.
- Subscription flow starts at `/subscribe`, where customers choose 5/10/12 bowl tiers and pay through Square.
- Macro flow starts at `/calculator` or trainer flow and can carry plan parameters into `/subscribe`.
- Confirmation and account flows exist, but order/payment state is guarded by Square webhook confirmation.

## Strong elements to preserve

- Real food photography.
- Existing brand palette, type system, emblem, and premium restraint.
- Clear server-side pricing authority and checkout validation.
- Payment gate that prevents unpaid orders from reaching kitchen operations.
- Macro Portal architecture and portion-sizing logic.
- Delivery windows and Palm Beach County service-area language.
- Existing allergy and nutrition caution: estimates only, not medical claims.
- Warm operational features: SMS opt-in, delivery notes, account/subscription controls, customer preferences.

## Conversion problems observed

- Homepage language currently splits attention across bowls, longevity, macro calculator, catering/wholesale/business lines, trainer portal, and brand ecosystem.
- The first viewport can read as premium brand positioning before it clearly answers "what can I buy today?"
- Ordering, subscription, and Macro Portal are present but not framed as two simple customer paths.
- Same-day freshness and daily delivery are present in several places but not always dominant above the fold.
- Pricing exists but is spread across order, subscription, and server files rather than presented as a coherent value story.

## Areas of unclear hierarchy

- Standard consumer ordering versus Macro Portal/trainer flow.
- Bowls as immediate offer versus broader Añejo ecosystem.
- Weekly subscription versus same-day order.
- Catering/wholesale/business capabilities versus first-time consumer purchase.

## Areas where too many offers compete

- Homepage can imply Añejo is simultaneously a bowl brand, catering company, macro calculator, trainer portal, partnership platform, and future tech company.
- The prototype should lead with fresh food cooked today and delivered today, then introduce personalization and macro support as secondary differentiation.

## Missing trust or ordering information

- A concise first-viewport trust strip should summarize same-day cooking, daily delivery, never frozen, Palm Beach County delivery, personalization, and clear next step.
- Customers should see individual meal prices, weekly plan prices, delivery fee, order minimum, and tax estimate before checkout.
- If testimonials/reviews are not present in repo assets, the prototype must not fabricate them.

## Mobile-specific concerns

- Existing `order.html` has responsive layout and touch-sized controls.
- Homepage first viewport should avoid requiring scrolling to identify the product.
- Sticky mobile order CTA is useful for the prototype.
- Horizontal overflow must be checked because product cards, state tabs, and checkout forms can crowd narrow screens.

## Accessibility concerns

- Existing public pages include skip links and focus styles in several places.
- Prototype should preserve semantic headings, visible focus, descriptive image alt text, sufficient contrast, reduced-motion support, and mobile touch targets.
- Real accessibility testing still requires browser checks. Automated checks are not a substitute for manual screen-reader QA.

## Technical constraints

- Production checkout is live and charges real cards. Prototype must not call `/api/checkout`, `/api/subscriptions/create`, or any production write path.
- D1 menu/pricing is authoritative but should not be mutated for the prototype.
- The public app is static; route `/prototype/anejobuyer/` can be served as `public/prototype/anejobuyer/index.html`.
- No framework migration is appropriate.
- No `.openai/hosting.json` was found in this repository.
- `ANEJO_CONVERSION_IMPLEMENTATION_BRIEF.md` was requested by the prompt but was not found in the repository scan.

## Assumptions that could not be verified

- Exact current D1 menu values could not be verified without querying production data; fallback values in code were used as fixture data.
- Current live service-area ZIP list was not exhaustively audited.
- Current customer review/testimonial assets were not found in the inspected paths.
- Whether Google Drive/Obsidian Sync is actively configured remains `Needs Dayan confirmation`.
