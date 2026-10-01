# $10 Daily Lunch — implementation and release handoff

## Approval and scope
Dayan requested the attached $10 Daily Lunch website handoff in this conversation and confirmed same-day website ordering closes at 11:00 AM and next-day preorders at 7:00 PM. Both are interpreted as Eastern time, matching existing operating settings. Prior session authorization permits release after checks. No further approval is needed for this implementation; missing assets and release verification remain outstanding.

## Local implementation
Branch `codex/daily-lunch-menu`, based on main `113a576`. An automatic workspace commit `063952b` captured the initial implementation. This branch excludes the unmerged marketing repair stack.

- Customer page `/daily-lunch`, linked from home, menu, and order pages. Today and dated weekly offerings, $10 price, delivery offer, closed/sold-out states, one service day per checkout, address confirmation and existing Square checkout handoff.
- Owner menu desk links to `/hub/owner/daily-lunch.html`. Reusable meals, editable name/description/local image path, weekday templates, future-week assignment, explicit service dates, disabled/sold-out flags, and configurable cutoffs. Owner authorization and version conflict checks protect writes. Save locks edits until acknowledgement; stable product IDs cannot be edited accidentally.
- Public API and owner API read the singleton configuration introduced by migration `0140_daily_lunch.sql`. Four approved dishes are seeded for September 28–October 1. Future weeks require explicit assignment; templates do not silently open sales.
- Server fixes daily meal price at 1000 cents. Same-day ordering closes at 11:00 AM; prior-day preorders close at 7:00 PM. Earlier future preorders also get free delivery. Same-day fee uses existing `DELIVERY_FEE_USD` and its existing $5 fallback, not a newly chosen fee. Production configured value has not been verified. Existing eligible customer benefits remain applicable.
- Checkout enforces date, quantity, availability, operating closures/delivery days and ZIP restrictions. Rechecks eligibility immediately before provider call. Requires confirmed pending order persistence before exposing a daily-lunch payment URL; existing payment webhook/kitchen path is reused. No parallel contract-order insertion.
- Existing office/clinic contracts remain separate records. Owner must align the dated retail menu with that day's office production; this does not synchronize or rewrite office contract menus.

## Current evidence
- `docs/evidence/daily-lunch-2026-09-30/root-tests.log`: 3,256 tests passed, zero failed.
- `docs/evidence/daily-lunch-2026-09-30/lint.log`: zero errors, 11 existing warnings.
- `docs/evidence/daily-lunch-2026-09-30/functions-build.log`: Worker compiled successfully.
- Migration executed against an in-memory SQLite database: four products, cutoffs 11:00 and 19:00, revision 1.
- JavaScript syntax and `git diff --check` passed.
- Local browser observation: real-clock preview hides ordering after cutoffs. Controlled September 30, 10:00 AM ET fixture exposes today's meal and Thursday preorder. Selecting Papa Añejo shows October 1; quantity three shows $30 meals plus free delivery. Phone-width 390px cards and order form visually inspected. These observations used local fixture data, not live production or real payment.
- Three actual-source owner UI tests cover locked in-flight save, duplicate-save prevention, revision conflict preservation, non-overwriting week assignment and stable IDs.
- Address regression suite initially failed 11 tests because a local weekday check could serialize to Sunday UTC. Test helper now uses UTC consistently; all 30 address tests and full suite passed. Production address logic unchanged.

## Not complete / release limitations
1. Four supplied `/mnt/data/...png` assets are not available on this Mac. Customer page labels missing images explicitly. Need the actual approved files attached or accessible before final food presentation can be delivered.
2. Migration has not been applied to production. No deployment, live checkout, real payment, or customer communication occurred in this implementation.
3. Previous session recorded Cloudflare authorization error 7403; access restoration has not been verified here. Do not bypass a denial or change credentials. Release requires normal supported access and the repository release checks, then live verification.
4. Manual sold-out flags are not quantity reservations. Previously issued Square links remain payable. A failed order write can leave an unexposed provider link. No claim of oversell prevention.
5. Seed dates expire; confirm the relevant launch week before releasing if no longer September 28–October 1. Do not silently reuse past production for a new week.
6. Owner image selection currently accepts an existing local website path. It is not an image uploader/library picker.

## Files
New: daily_lunch library; public and owner daily-lunch APIs; migration 0140; public daily-lunch HTML/CSS/JS; owner daily-lunch HTML/JS; backend and owner UI tests.
Modified: checkout handler, home/menu/order links, owner menu link, UTC address-test fixture. Existing checkout and customer communications remain in their established paths.

## Next action
Supply the four approved meal images, connect their local asset paths, and review the final visual result. Confirm normal release access, apply only the required migration with preflight/rollback planning, release through repository gates, then verify public availability, authenticated owner save/readback and checkout-to-kitchen behavior without an unauthorized charge or send. Broader marketing, Google and catering work remains open in its existing handoffs.

## September 30 follow-through — supplied images and restored access
Dayan supplied all four approved images and explicitly authorized required database updates, release ordering and reconciliation. Copied original bytes into public/assets/img/daily-lunch; SHA256 tests bind each meal to its approved file. Square image layout preserves all artwork instead of cropping. 3,256 root tests pass after updating the former missing-photo assertion.

Fresh Wrangler OAuth and production D1 read succeeded: earlier 7403 blocker no longer reproduces. Recorded pre-change Time Travel bookmark privately in local release evidence. Schema preflight showed no daily_lunch_config/daily_schedule/daily_claims. Applied only0140 (not historical backlog); independent config readback follows. Application release still pending this checkpoint.

Reconciled PR79 against172:172 is canonical public lunch implementation. Do not apply79's0104 migration or merge its $15/mileage/clinic-contract changes. Keep allocation/combined production forecasting ideas as backlog; temporary holds alone do not prevent late-link overselling. Clinic pricing, contract menus and operations remain untouched. Next week's production confirmation was requested separately; no future week silently enabled.

Renderer acceptance is engineering-owned; isolated sandbox28tests and12local workerd runs passed. Visual samples at /tmp/anejo-render-review-2026-09-30. Peak production memory and low-contrast emblem remain unresolved. Daily lunch serves approved images directly and does not depend on unattended renderer readiness.
