# Catering quote product selection — 2026-09-09

Owner: Codex. Approval: Dayan's direct-session request to add individual product selection to the quote form, continuing his authorized website updates and publication. Scope excludes prices, payment settings, production data edits and paid services.

## Changes
- Bilingual product selector under the three categories, with repeatable lines, quantities, units, filling choices, removals and per-line instructions.
- Fit bowls; Cuban roast pork, congrí, tamales, Hawaiian rolls, empanadas, croquetas, cold salad, skewers and tres leches; standard/custom Cajita versions; custom request entries.
- Explicit event totals rather than multiplying by guest count. Required notes for custom products. Existing Cajita designer remains available.
- Shared allowlisted catalog; server validates products, category, quantity and flavor. Product arrays are stored in catering_requests.event_json; bilingual human-readable product lines are retained in the Hub's original inquiry and immutable email outbox payload.
- Older builder requests without the new field remain supported. Retry request IDs and product snapshots remain immutable.

## Verification
- `npm run build:catering`: passed; generated public/assets/js/catering-products.js.
- Focused real SQLite + route tests: 16 passed. Proves saved product quantity/flavor/notes and queued email content. Providers stubbed; no customer emails sent.
- `npm test --silent`: 1,898 passed after merging the newer published menu work from origin/main; log /tmp/anejo-products-merged-tests.log.
- `npm run lint`: no errors, two pre-existing vendor warnings.
- `npx wrangler pages functions build --outfile=/tmp/anejo-products-worker.js`: compiled successfully.
- Local browser: Spanish product list; congrí deep-link selection; add chicken empanada quantity 10; English switch preserves quantity/flavor; Cajita selection reveals standard/custom versions.
- Initial full-suite run exposed a fixture missing the new UI interface; updated the fixture and tested immutable product retry payloads. Final suite passes.
- Predeploy guard initially stopped an outdated checkout. Merged origin/main without conflicts, preserving the other session's published menu work. Guard subsequently passed.

## Boundaries and next step
No prices invented, no new service purchased, no database migration. Email payload verified in tests, not a new real inbox-delivery test. Deployment/live asset verification pending below. The separate photorealistic 3D work is not claimed complete here.

## Live release evidence
- Published commit 6720dfd to origin/main; production deployment b8943788-d2f6-43c1-adc8-2f089f6264e9.
- Live /catering returns 200 and renders the new Spanish product selector. Lechón deep link preselects the correct product; quantity and add-product controls are present.
- Live /assets/js/catering-products.js returns 200 and exactly matches the locally tested bundle, SHA-256 796cec68210c912511dad37f14a846bd2035e21d594d6096bd4b824227555d96.
- Final release tests: 1,898 passed, zero failed (/tmp/anejo-products-release-tests.log). Retry controls remain locked during language switching; no new request ID or changed payload is created for ambiguous retry.
- Blocked: none for this product-selector change. Further approval required: none within the authorized scope. While the deploy guard blocked publication, integrated current main and reran validation instead of overwriting it.
- Next action: refresh /catering#quote and select categories, products and quantities. Real inbox delivery is not newly verified by this release; database and outbox integration are covered by the tests above.
