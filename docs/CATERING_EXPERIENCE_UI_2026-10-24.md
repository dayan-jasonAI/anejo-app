# Catering service check-in and after-delivery feedback UI

Local implementation and synthetic verification; parent release handoff determines deployed/live status.

## Created

- `/catering-feedback?t=<random-token>`: Añejo green/gold/cream editorial page with authentic emblem, accessible mood choices, optional 1–10 score, optional repeat-choice and a 2,000-character comment.
- Pre-event form explicitly asks about booking/planning, not food that has not been delivered. Post-delivery form welcomes every experience. An optional Google review link is shown before and after submission for every score; no incentive or rating-based gate exists.
- `/hub/owner/assets/catering-lifecycle.js` and stylesheet: separate rendered email previews, one-message send approval, per-event future-trigger approval, provider acceptance receipts, saved feedback, and runtime timestamps.

## Modified

- Owner catering quote card and associated request include a service-check-in/after-delivery control, including fully paid bookings.
- Paid quote summaries say Final payment received / Paid in full, omit an obsolete due-date pill and never offer collection or a checkout for a waived/paid balance. Original agreed terms stay intact.

## Safety and workflow

Opening the owner panel stages previews only. It sends no email. A preview must load before either send or trigger approval can be enabled; every action includes the saved review hash and kind. Accepted, suppressed, sending and unknown outcomes stay locked against blind retries. A closed panel ignores stale asynchronous previews. If staging fails, saved history is retrieved read-only. No emails or approvals were executed against a real customer during implementation.

The public endpoint returns no customer names, emails or quote IDs. The page accepts only a correctly shaped private token, requires a mood or score and reports saved feedback only after a successful server response. Retry preserves input. Google links reject non-Google hosts and embedded credentials. The page sends no event token as a referrer to external destinations.

## Validation

`NODE_PATH=<bundled-node-modules> CATERING_BROWSER_CHANNEL=chrome node scripts/verify-catering-experience-ui.cjs`

Executed against a local synthetic server under production Content Security Policy, mobile 390px and desktop 1440px: decoded brand/preview images, required mood/score, failed-save retry retaining input, low/high ratings with identical Google link, pre-event booking wording, no pre-delivery Google solicitation, fully paid owner action, separate reviewed approval, approval without sending, one mocked send with lock, closed-preview race, staging failure preserving read-only history, credentialed Google URL rejection and no horizontal overflow. Zero browser errors, external messages or payment calls. Screenshots: `/tmp/catering-experience-ui-evidence/`.

Owner desk/revision/send regressions: 49 passed. Browser script ESLint and JS syntax/diff checks passed. Parent runs the full test suite, migration 0160 release, live read-back and actual approved communication.
