# Catering operational repair — October 25, 2026

## Authority and scope

Dayan directly requested production-workflow repair, an Apple-style event workbench, existing kitchen/PIN integration, accountable delivery communication, recipe authority, editable purchases, kitchen reservation and event-label automation. This session instruction is the scoped engineering/release approval record, not a request for duplicate approval. New customer-message templates remain staged until rendered review under workspace I12; old reviewed per-event approvals are preserved. No payment, pricing, historical physical-delivery, recipe-approval or calendar-reservation facts are invented.

Branch: `codex/catering-unified-operations`, based on trunk `b33bac5bf60636d3932b11bee14a6f4c3868a6fc`. Prior evidence and actual customer/provider receipts are private in `Aether/anejo-deliverables/catering-operations-2026-10-25/`.

## Requirements and evidence ledger

| Request / discrepancy | Implementation | Verification and remaining boundary |
|---|---|---|
| Saved event-care emails / missing review | Existing reviewed hashes and approval actors checked against D1; accepted receipt independently retrieved from Resend | Post-service email provider reports delivered. Pre-event approval was recorded on event day, outside its day-before window; no late email sent. Expired state becomes explicit, with approval history retained. |
| Catering absent from kitchen orders | Canonical paid catering adapter joins existing Upcoming/prep/ready board; PIN actions share execution history | Real migrated SQLite + browser acceptance proves retail ticket preserved, catering prep attributed to actual synthetic cook, no duplicate finance order. |
| Dense production / hidden progress | Stage stepper, next action, compact tabs, quantities distinct from cook minutes, contextual purchase actions | Mobile/desktop browser acceptance, retry and long-content stress. See event-workbench handoff. |
| Driver assignment and real handling | Ahead/day-of assignment exposed; owner delivery and signed-in driver paths prompt actual packing/pickup/drop-off data | Existing assignment-version/CAS/idempotency and PIN accountability retained. Measurements do not automatically certify food safety. |
| Missing purchasing protein / no editing | Every unmapped quoted dish remains visible with confirmation needed; event-specific edits/additions/removal | No fuzzy recipe or guessed cooked-to-raw yield becomes a purchase fact. Edits do not alter the quote or master recipe. |
| Missing departure / delivered communication | Reviewed EN/ES branded email + consent-gated SMS templates; real transition outbox, immediate waitUntil attempt plus existing minute scheduler | Disabled initially. No retrospective send. Unknown provider outcomes fence retry; signed/read-back email receipts and carrier statuses remain distinct from acceptance. New preview approval required. |
| Recipe inventory and training | Versioned structured staff drafts, owner saved-version/source approval, exact SKU/yield maps; Library/Studio/operator projections; production policies pin authority | Fresh private matrix: 243 SKUs, 35 unconfirmed references, 208 missing mappings, zero exact-version owner receipts. Includes variants/combos, not 243 distinct dishes. Real recipes and owner reviews remain necessary. |
| Kitchen calendar reservation | Staff draft hours → owner approval → deterministic Google event + overlap/lease checks and exact provider readback | Destination not assumed. No real booking made. Runtime Google connection and actual kitchen reservation calendar need confirmation. A personal reminder is not a kitchen reservation. |
| Event labels take too long | Saved event themes, item/title print aliases, auto menu fill, branded QR, generated botanical frame, rounds/bands/triangle signs | Three starter themes are drafts, not asserted replicas of all prior events. Avery 5655 geometry checked against saved template. Valid maximum text fits round/tent QR zones; long text needs explicit print aliases. Print at actual size, physical printer test and owner approval still required. |

## Release and validation

Apply only additive migrations `0161`, `0163`, `0164`, `0165` before dependent code. Do not bulk-apply unrelated historical migrations. No existing operations or recipe approvals are backfilled. Existing paid/completed events remain unchanged.

- Root lint: no errors; ten existing warnings.
- Root tests and Functions compilation: see final release receipt below.
- `scripts/verify-event-operations-ui.cjs`: stage flow, exact quantities, packing/owner handling, PIN, editable purchases, unknown response replay, mobile/desktop.
- `scripts/verify-kitchen-catering-board-ui.cjs`: real migrated API/SQLite, joined Upcoming, PIN attribution, exactly one transition after lost acknowledgement, actor-bound recovery, unavailable-storage refusal, no PIN storage.
- `scripts/verify-recipe-authority-ui.cjs`: staff draft isolation, saved-version owner review, required source/image facts, transactional approval, dirty/in-flight editing, mobile/desktop.
- `scripts/verify-event-services-ui.cjs`: real migrated API/SQLite, reservation readiness gate, labels and all four message previews; actual image decode, 80-character dish / 48-character event stress on round/tent layouts with separate QR/footer regions.
- QR raster capture independently decoded by jsQR to the first-party website. This does not replace a physical print/phone scan check.
- Hosted exact-head checks, production deployment/source, schema readback and live HTTP/assets must be recorded separately. Owner-authenticated live interaction requires a current legitimate session; no session was fabricated.

Rollback: redeploy the prior verified application source if needed, retain additive audit/recipe/notification tables and receipts, pause new message activation and external calendar bookings. Do not delete historical records or fabricate completed work to clear a screen.

## Remaining owner inputs

1. Renew the expired Hub browser login for final owner-screen verification.
2. Approve or revise the new rendered future delivery templates (four email/SMS previews). Prior event-care approvals need no repeat.
3. Identify the actual kitchen reservation calendar/portal and complete the runtime Google connection. No credentials should be pasted into chat.
4. Supply missing recipe facts and review exact submitted versions; resolve ambiguous sale-unit conversions deliberately.
5. Review generated label layouts and test the printer before treating artwork/alignment as final.

### Local acceptance receipt

Final combined local run: **4,079 tests passed, zero failed/skipped**, approximately 45 seconds; lint zero errors/ten pre-existing warnings. Wrangler Functions compilation passed. Four browser scripts run under production CSP using synthetic data/real migrated SQLite endpoints; no customer messages or production order mutations are performed by those scripts. Log copies and rendered artifacts are retained in the private release directory. This is local acceptance; it is not a deployment assertion.
