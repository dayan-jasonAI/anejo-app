# Añejo Catering Request Flow — Handoff

Date: 2026-09-05
Branch: `codex/anejo-catering-request`
Base: `origin/main` at `b5c952a891cd9efe3472e8443877690c942fb3bc`
Status: Local implementation validated; not deployed

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

The repository-wide `npm test --silent` run is not a clean completion signal in this checkout. Its
unchanged deploy/test helpers convert the workspace path through `URL.pathname` without decoding
it, then try to access `/Users/aiagent/Dayan%20Workspace/...`; those path-based tests fail before
they can exercise the repository. The catering-focused and indexability suites above run directly
and pass. This pre-existing runner defect is separate from the catering feature.

## Remaining risks and approval state

- Public deployment of both `/catering` and `/cajita` is authorized after the clean validation
  above; live propagation and the synthetic production proof remain pending.
- After deployment, a synthetic request must prove all four live outcomes: success confirmation,
  `kind='catering'` D1 row, owner inbox notification, and request card in the Catering Hub desk.
- Email delivery remains best-effort by design so an email-provider problem cannot discard a request
  already stored in the Hub.
- Exact Cuban/Cajita menus and catering prices remain intentionally unspecified. The flow gathers
  the event facts and requires Dayan to review pricing before creating a deposit link.

Rollback: revert the feature commit before merging or deploying; no production migration or data
change exists to reverse.
