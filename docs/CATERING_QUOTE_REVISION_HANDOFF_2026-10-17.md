# Catering quote revisions and optional recommendations — 2026-10-17

Status: local implementation and provider-mocked acceptance only. No production query, payment action, customer message, or deployment was performed by this work packet.

## Changed behavior

- Owner can clone an unpaid quote's lines, contact, date and headcount into the existing editor. The quote preview is required before its revision action in the UI. Paid quotes remain immutable.
- `catering_quote_revisions` records the original quote, deterministic replacement identity/token, frozen payload/terms, actor and state before external effects. Retry resumes that record rather than approving different values or minting a different checkout.
- The original Square checkout is deleted, and its associated order must be confirmed `CANCELED` with no recorded tenders before replacement creation. Provider uncertainty blocks creation. A locally unpaid quote that Square reports tendered/completed is blocked for owner review.
- Original quote becomes void only after its replacement is persisted. Retry recovers a lost final acknowledgement. Retired originals and unfinished replacements cannot be sent or expose a payment CTA through the hosted page.
- Optional croquetas use owner-selected published pack/filling/count and available D1 pricing. They are excluded from base lines, total and deposit. The recommendation CTA pre-fills a request for owner confirmation; it never adds items or charges.
- Source lead ID, existing quote metadata, bilingual line details and image references are preserved through revisions. Owner quote cards expose item details and revision lineage; void originals no longer inflate outstanding balances.

## Release order and limits

1. Apply additive migration `0147_catering_quote_revisions.sql` before deploying the new quote functions. Hosted pages deliberately return 503 if revision state cannot be checked.
2. Run the repository release checks and perform browser acceptance with synthetic records/provider sandbox before authorizing a real revision.
3. Existing quotes without Square identifiers cannot be safely revised automatically. Provider payment races and uncertain state require reconciliation rather than guessing.
4. No actual customer's quote was revised in this work packet. Source tests do not prove live behavior or Square production permissions.

## Evidence

- `node --no-warnings --test test/money/cake-reveal-gate.test.js test/money/catering-*.test.js test/ui/catering-quote-send-controls.test.js`: 333 passed, 0 failed. Output `/tmp/anejo-catering-all.log` (session-local log).
- Ten new SQLite/provider-mocked tests in `test/money/catering-quote-revision.test.js`: cancellation ordering, payment/stale version guards, unknown retirement, deterministic create recovery, lost final acknowledgement, inactive quote pages, optional totals/request CTA, live pack pricing and unavailable/stale price refusal.
- Selected changed server files and new tests passed ESLint; owner inline scripts parsed with `vm.Script`. Browser layout/interaction acceptance is pending parent-session verification.

Square provider contract consulted: https://developer.squareup.com/reference/square/checkout-api/delete-payment-link (deletion cancels the associated order), and https://developer.squareup.com/reference/square/orders-api/retrieve-order.
