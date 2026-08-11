# Añejo Buyer Prototype Decision Log

## 1. Isolated route instead of production homepage replacement

- Decision: Build `/prototype/anejobuyer/` as a static route under `public/prototype/anejobuyer/`.
- User problem addressed: Allows Dayan to review a visual direction before production behavior changes.
- Business reason: Protects live ordering, payment, kitchen, and hub operations.
- Existing Añejo element preserved: Cloudflare Pages static routing.
- Expected conversion effect: Hypothesis that isolated testing enables faster approval with lower operational risk.
- Risk: Prototype may diverge from production implementation if not translated carefully.
- How to validate: Review visual prototype, then implement approved pieces through the production plan.

## 2. Lead with same-day fresh delivery

- Decision: Hero headline explicitly says fresh bowls cooked today and delivered across Palm Beach County.
- User problem addressed: First-time visitor understands the offer without scrolling.
- Business reason: Same-day cooking and daily delivery distinguish Añejo from frozen weekly meal prep.
- Existing Añejo element preserved: "Clean Fuel. Bold Flavors. Cooked Fresh. Delivered Daily."
- Expected conversion effect: Hypothesis that clearer first-viewport comprehension improves order intent.
- Risk: Operational cutoff details may need more precise production copy.
- How to validate: User tests asking first-time visitors what Añejo sells after five seconds.

## 3. Two-path ordering model

- Decision: Present standard ordering and Macro Portal as parallel paths.
- User problem addressed: Customers can self-select without confusion.
- Business reason: Keeps macro personalization visible without making it a barrier to simple orders.
- Existing Añejo element preserved: `/order`, `/calculator`, `/plan.html`, and `/subscribe` relationship.
- Expected conversion effect: Hypothesis that choice clarity reduces bounce and misclicks.
- Risk: Too much path explanation can slow direct ordering.
- How to validate: Track standard path selected, macro path selected, checkout started, and calculator started.

## 4. Fixture pricing from code fallbacks

- Decision: Use `functions/_lib/menu.js`, `functions/_lib/plans.js`, and checkout defaults as prototype fixture data.
- User problem addressed: Shows real price ranges without querying or mutating production data.
- Business reason: Avoids invented prices and avoids live database risk.
- Existing Añejo element preserved: Server-authoritative pricing model.
- Expected conversion effect: Hypothesis that early transparent pricing reduces checkout anxiety.
- Risk: D1 production prices may differ from fallback values.
- How to validate: Owner or backend confirms current D1 menu/pricing before production copy is published.

## 5. Hero video as storyboard/mock treatment

- Decision: Use existing food stills with motion treatment and a storyboard document.
- User problem addressed: Communicates the desired emotional arc without requiring production video.
- Business reason: Shows the direction before spending time or money on video generation/shooting.
- Existing Añejo element preserved: Real bowl photography.
- Expected conversion effect: Hypothesis that process/delivery proof builds trust faster than brand claims.
- Risk: Still-photo motion is not the same as a real human delivery story.
- How to validate: Produce a real shot list, then compare video completion and hero CTA behavior.

## 6. Warmth through interaction states

- Decision: Use preference controls, delivery updates, skip/pause states, and plain errors instead of sentimental "family" copy.
- User problem addressed: Customers feel looked after through useful service details.
- Business reason: Keeps Añejo warm without becoming overly sentimental or vague.
- Existing Añejo element preserved: SMS updates, delivery notes, account/subscription flexibility.
- Expected conversion effect: Hypothesis that clarity improves trust and reduces support friction.
- Risk: Some warm brand voice may be under-expressed.
- How to validate: Review copy with Dayan and test customer comprehension.
