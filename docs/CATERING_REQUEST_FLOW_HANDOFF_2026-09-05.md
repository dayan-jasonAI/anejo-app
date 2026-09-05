# Añejo Catering Request Flow — Handoff

Date: 2026-09-05
Branch: `codex/anejo-catering-request`
Base: `origin/main` at `b5c952a891cd9efe3472e8443877690c942fb3bc`
Status: Production deployment and synthetic end-to-end proof completed

## Direct-session authorization record

- Approver: Dayan
- Timestamp: 2026-09-05T15:40:14Z
- Source: direct instruction in the active Codex session
- Approved scope: build a public Catering navigation option and quote-request flow for Añejo Fit,
  Cuban food, and Cajitas; route the request to Dayan's notification inbox and Añejo Hub
- Exclusions preserved: no public deployment, production data write, Square action, secret change,
  or customer communication before rendered preview review

Deployment authorization was expanded by Dayan at `2026-09-05T16:00:10Z` in the same active
session: validate the UI/actions, D1 recording, Hub and email notifications, then deploy and make
the two public routes live if the evidence is clean. The rendered `/catering` and `/cajita`
previews were open in the active Codex browser before this instruction.

## Output

- `public/catering.html` — customer-facing catering page and complete request form
- `public/cajita.html` — dedicated La Cajita page at `/cajita`, linked into the catering form with
  Individual Cajitas preselected
- `public/index.html` — Catering header/footer links, hero CTA, FAQ, and responsive nav adjustment
- `functions/api/leads.js` — validated `catering` intake, D1 persistence, and owner email alert
- `functions/_lib/alerts.js`, `functions/api/hub/push/peek.js`, `public/hub/owner/index.html` —
  durable owner alert, subscribed-device push tickle, and Catering-desk deep link for each request;
  a separate Hub warning records an owner-email failure without losing the saved request
- `functions/api/hub/owner/catering-deposit.js` — owner-only read of website catering requests
- `public/hub/owner/catering.html` — website request cards and quote-form prefill action
- `public/sitemap.xml`, `README.md`, `DEPLOY_CHECKLIST.md` — `/catering` and `/cajita`
  route/discovery/operations updates
- `test/money/catering-request.test.js`, `test/money/catering-desk.test.js` — route, inbox, Hub alert,
  no-invented-price, access, and UI wiring coverage
- `test/predeploy-guard.test.mjs`, `test/deploy-command-docs.test.mjs`,
  `test/ui/marketing-role.test.js` — decode spaces in filesystem URLs so the full suite and guarded
  deployment checks run correctly from `Dayan Workspace`

No database migration is required. Website requests use the existing `leads` table with
`kind='catering'`; the existing `catering_quotes` table remains reserved for owner-reviewed prices
and deposit links.

## Validation evidence

- `node --no-warnings --test test/money/catering-request.test.js test/money/catering-desk.test.js test/money/catering-deposit.test.js test/ui/indexability.test.js`
  - Result: 59 passed, 0 failed
- `npx eslint functions/api/leads.js functions/api/hub/owner/catering-deposit.js test/money/catering-request.test.js test/money/catering-desk.test.js`
  - Result: exit 0
- `node --check functions/api/leads.js && node --check functions/api/hub/owner/catering-deposit.js`
  - Result: exit 0
- Inline-script syntax compilation for `public/catering.html`, `public/cajita.html`,
  `public/hub/owner/catering.html`, and `public/index.html`
  - Result: all non-JSON script blocks compiled successfully
- Local routes: `http://localhost:8788/catering` and `http://localhost:8788/cajita`
  - Result: `/catering`, `/cajita`, and `/catering?menu=cajita` returned HTTP 200; the catering
    and Cajita pages use distinct canonical URLs, and the Cajita CTA enters the shared quote form
    with Individual Cajitas preselected
- `git diff --check`
  - Result: exit 0
- `npm test --silent`
  - Result: 1,763 passed, 0 failed
- `npm run lint`
  - Result: exit 0
- `npx wrangler pages functions build --outfile=/tmp/anejo-catering-functions-build.js`
  - Result: Cloudflare Pages Worker compiled successfully
- UI/browser validation in the live local preview
  - Result: La Cajita CTA navigated to `/catering?menu=cajita#quote`; Individual Cajitas was
    preselected; missing-menu validation focused the first choice; required inputs were operable;
    the homepage mobile menu exposed correct expanded state; FAQ, chat, cookie, and EN/ES controls
    responded; no browser console warnings or errors were observed
- Internal-link route crawl across `/`, `/catering`, and `/cajita`
  - Result: all 23 distinct local targets returned HTTP 200
- Production readiness reads (no customer data changed)
  - Result: the live D1 `leads` schema contains every column used by `insertLead`; `DB`, `SESSIONS`,
    Resend/email, and VAPID bindings are configured; two owner push subscriptions exist

## Production evidence

- Production source: `origin/main` at `dd3a9c109fc0f86537863a7094185851909a4365`
- Cloudflare Pages deployment: `6914706f.anejo-app.pages.dev`, status `Active`
- Public routes:
  - `https://anejocateringco.com/catering` — HTTP 200 and canonical URL matches
  - `https://anejocateringco.com/cajita` — HTTP 200 and canonical URL matches
  - `https://anejocateringco.com/catering?menu=cajita` — HTTP 200
- Synthetic live request:
  - Lead ID: `ld_e90a508f39922d6eb400`
  - D1 result: one `kind='catering'` row with the submitted name, email, menu, guest count, event
    details, and `channel='web'`
  - Hub result: open `catering_request` alert `alert_5987b92d61339d48bf7a`, linked to the lead
  - API result: `notifications.hub=true` and `notifications.email=true`
  - Inbox result: message received from Añejo Catering Co. at 12:02 PM with subject
    `New catering quote request — Anejo QA Live Test 2026-09-05 · 24 guests`
- Live browser QA: the deployed Catering and La Cajita pages rendered with the expected controls,
  links, form fields, and dedicated URLs.

## Remaining risks and approval state

- The synthetic QA request remains in the production Catering desk and inbox, clearly labeled to be
  ignored for sales follow-up. It was retained as the audit record rather than deleted.
- Future requests are committed to D1 before notification delivery. If the owner email provider does
  not accept a send, the saved request remains available and a separate `catering_email_failed` Hub
  alert is created.
- The durable Hub alert is proven in D1. A device-level push display still depends on each subscribed
  device's browser/OS notification permissions and cannot be proven from the server alone.
- Exact Cuban/Cajita menus and catering prices remain intentionally unspecified. The flow gathers
  the event facts and requires Dayan to review pricing before creating a deposit link.

Rollback: revert production commit `dd3a9c1`; no production migration exists to reverse. Preserve or
explicitly archive the synthetic evidence row rather than deleting it silently.

## Customer-facing naming correction

- Approver: Dayan, by direct instruction in the active Codex session on 2026-09-05
- Scope: remove personal-name references from the public Catering and La Cajita customer journey
- Result: follow-up copy now names the Añejo team, and the event-details prompt reads
  `anything else Añejo should know.`
- Preserved: the operational `dayan@anejocateringco.com` inbox address and founder attribution on
  the homepage remain unchanged.
- Validation: catering request suite 10 passed, repository suite 1,764 passed, lint passed, and
  `git diff --check` passed.

## Real-event gallery and themed catering expansion

- Approver: Dayan, by direct instruction with seven supplied event photographs in the active Codex
  session on 2026-09-05
- Public story: the Catering and La Cajita pages now use real photography from a pink first-birthday
  event and explain that colors, liners, labels, packaging, and menu selections can be customized
- Catering menu: public starting points now name Añejo Fit bowls, Cuban party trays and bites, and
  individual Cajitas; exact items and availability remain subject to the custom quote
- Intake: optional event-theme and color/special-touch fields are saved in the lead record, included
  in the owner email, visible in the Hub request brief, and preserved in the email fallback
- Assets: seven supplied photos were resized for web delivery and stored under
  `public/assets/img/cajita/`; no generated food imagery is used in the new sections
- Validation: focused catering/Hub/indexability suites passed 48 tests, the repository suite passed
  1,764 tests, lint passed, local `/catering` and `/cajita` returned HTTP 200, and the deploy guard
  passed with the branch current against `origin/main`

## Exact Cajita and Cuban tray menu photography

- Approver: Dayan, by direct instruction with four supplied food photographs and one marketing
  reference in the active Codex session on 2026-09-05
- Image treatment: the actual Cajita, lechón, congrí, and tamales photographs were used as edit
  targets; the supplied pink marketing board was used only for lighting, palette, and presentation
  direction. Food types and event facts were preserved, and no price was invented.
- Public menu: the Catering page now names and shows Lechón, Congrí, and Cuban Tamales as requestable
  trays. Each tray action preselects Cuban Food and carries the specific item into the request brief.
- La Cajita: the hero now uses the polished Cajita presentation and the sample menu names the mini
  Cuban sandwich, empanada, croqueta, creamy party salad, and salami-cheese-grape bite shown in the
  supplied image.
- Assets: four non-destructive, web-sized generated edits are stored under
  `public/assets/img/cajita/*editorial-v2.png`; the supplied originals and previous real-event gallery
  remain unchanged.
- Validation: the focused catering request suite passed 10 tests; the repository suite passed 1,764
  tests; lint and the deploy guard passed; both local routes and all four new image URLs returned
  HTTP 200. Native desktop browser inspection was unavailable because the Mac was locked.
