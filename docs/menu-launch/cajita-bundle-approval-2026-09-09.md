# Complete Cajita bundle pricing approval

Approver: Dayan. Date: 2026-09-09 (session date).
Channel: direct-session. Source: Dayan answered “yes” to “Do you also approve $18 per standard Cajita and $20 with preset-themed printing for online checkout?”

Approved: complete six-item standard Cajita $18; same food bundle with preset-themed printing $20. Standard 48-hour and printed 72-hour minimum notice remain applicable.

Included: Hawaiian roll with ham spread, guava-and-cheese empanada, ham croqueta, 6 oz cold salad, one skewer, and 3–4 oz tres leches.

Exclusions: no new component credits, substitutions, bespoke design fees, larger packaging prices, payment settings or stock guarantees are approved by this price approval. The earlier $17.50/$19.50 component proposal remains a historical draft, not the approved complete-bundle schedule.

Implementation: `src/cajita/approved-bundle-pricing.js` is a pure exact-bundle calculator. It ignores customer price fields and returns no price for nonstandard combinations. It is not yet connected to the public builder or payment endpoint. No production publication in this step.

Remaining work: integrate server-classified printing, validated configuration persistence, fulfillment checks and server-owned payment totals; validate kitchen/management detail delivery. Price approval is not evidence that these paths work.

Validation: `node --test test/cajita-approved-bundle-pricing.test.mjs test/cajita-draft-pricing.test.mjs` and `git diff --check` (results recorded in HANDOFF.md).
