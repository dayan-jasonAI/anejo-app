# Añejo Buyer Visual Prototype

## What was created

An isolated, fully navigable visual prototype for the first-time Añejo buyer experience.

## Why it was created

The prototype tests a clearer conversion journey before changing the live homepage, ordering system, Macro Portal, checkout, authentication, database, or Añejo Hub.

## How to run it

From the repository root:

```bash
npm run dev
```

Open:

```text
http://localhost:8788/prototype/anejobuyer/
```

## Exact prototype route

`/prototype/anejobuyer/`

## Files changed

- `public/prototype/anejobuyer/index.html`
- `public/prototype/anejobuyer/styles.css`
- `public/prototype/anejobuyer/app.js`

## Files added

- `docs/prototypes/anejobuyer/audit.md`
- `docs/prototypes/anejobuyer/strategy.md`
- `docs/prototypes/anejobuyer/content-map.md`
- `docs/prototypes/anejobuyer/video-storyboard.md`
- `docs/prototypes/anejobuyer/analytics-plan.md`
- `docs/prototypes/anejobuyer/decision-log.md`
- `docs/prototypes/anejobuyer/production-plan.md`
- `docs/prototypes/anejobuyer/README.md`
- `docs/prototypes/anejobuyer/sora/creative-brief.md`
- `docs/prototypes/anejobuyer/sora/shot-list.md`
- `docs/prototypes/anejobuyer/sora/sora-prompts.md`
- `docs/prototypes/anejobuyer/sora/reference-frame-plan.md`
- `docs/prototypes/anejobuyer/sora/edit-plan.md`
- `docs/prototypes/anejobuyer/sora/generation-log.md`
- `docs/prototypes/anejobuyer/sora/still-placeholders.md`
- `docs/prototypes/anejobuyer/screenshots/desktop-home.png`
- `docs/prototypes/anejobuyer/screenshots/desktop-order-flow.png`
- `docs/prototypes/anejobuyer/screenshots/desktop-system-states.png`
- `docs/prototypes/anejobuyer/screenshots/mobile-home.png`
- `docs/prototypes/anejobuyer/screenshots/mobile-checkout.png`
- `public/prototype/anejobuyer/media/README.md`

## Components reused

- Existing brand colors and typefaces.
- Existing Añejo emblem and food photography.
- Existing product/spec pricing references from server fallback data.
- Existing ordering, subscription, Macro Portal, and checkout concepts.

## Components created

- Prototype hero with still-frame video treatment.
- Standard versus macro path chooser.
- Prototype product card grid.
- Prototype route-state panel covering product, macro, plan, cart, checkout, confirmation, system states, SMS, and email.
- Mobile sticky order bar.
- Prototype plan cards.
- Video-ready hero container with desktop/mobile source paths, poster frame, muted autoplay support, inline playback, reduced-motion fallback, and still-frame animatic fallback.
- Sora-ready production package for the final hero video.

## Known limitations

- Prototype uses local fixture data and does not query D1.
- Prototype does not create checkout links, subscriptions, orders, analytics events, messages, or production writes.
- Still-frame motion treatment is not production video.
- Sora/video generation was not run because no authorized local Sora/video-generation workflow was found.
- Reviews/testimonials were not added because no verifiable customer proof was found during the audit.
- Current D1 menu/pricing and live service-area rules still need owner/backend confirmation before production copy is published.

## Assumptions

- Fallback menu and plan prices are acceptable for prototype display because they are in code and used when D1 is unavailable.
- The homepage should prioritize the immediate consumer offer before broader Añejo ecosystem capabilities.
- `/prototype/anejobuyer/` is safe because the app serves static directories from `public/`.

## Production dependencies

- Current D1 menu/pricing.
- Current Square production plan catalog and price override behavior.
- Current operating settings for delivery windows, service area, order minimum, and fee.
- Owner approval for public-facing copy and any production deployment.

## Accessibility notes

- Prototype includes a skip link, semantic sections, descriptive alt text, visible focus styles, reduced-motion support, responsive layouts, and touch-sized controls.
- Manual screen-reader review remains recommended before production implementation.

## Recommended validation process

1. Run local dev server and review `/prototype/anejobuyer/`.
2. Capture desktop and mobile screenshots.
3. Check browser console for errors.
4. Confirm no calls are made to production write APIs.
5. Confirm product/pricing copy against D1/current owner settings.
6. Owner reviews copy, hierarchy, visual direction, and production plan.
7. Implement approved production slices in small, testable patches.

## Questions requiring owner review

- Should the production homepage use "Order Today" or "See Today's Menu" as the primary CTA?
- What exact same-day cutoff language should be public?
- Which current customer proof, if any, is approved for public trust sections?
- Should Macro Portal be labeled "Macro Portal" publicly or described as "Personalized meals" until the visitor enters that flow?
