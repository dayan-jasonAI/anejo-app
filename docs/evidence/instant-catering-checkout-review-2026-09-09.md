# Instant catering pricing and checkout — read-only review

Owner: Codex. Requested by Dayan in the live session on 2026-09-08 ET. Scope: inspect other task, verify pricing evidence and design a path to unattended checkout. No live prices, payment behavior, database data or settings changed.

## Observed evidence
- Task: Enhance Añejo product images (01a08260-b4e4-72e0-babb-e5b23c00ba8a); release handoff docs/menu-launch/HANDOFF.md states 79 added SKUs and estimated, not measured, profitability.
- Live /api/menu queried: Cuban Table 10 $195, 25 $470, 50 $925; Cuban Bites 75 $150 and 150 $290; selected combos marked available with null stock counts. Null does not prove unlimited stock.
- Catalog arithmetic: table10 components $208.25 vs combo $195 (6.36% saving); table25 components $501 vs $470 (6.19%); table50 components $1,002 vs $925 (7.68%). Bites75 components $160 vs $150 (6.25%); bites150 $305 vs $290 (4.92%). These are menu discounts, not profit margins.
- functions/api/checkout.js resolves server-side catalog prices, checks availability, scheduled dates/cutoff/service area and creates Square-hosted payment links. Daily stock cap code is in the on-demand branch, while Traditional/Catering requires scheduled mode. No component reservation/capacity hold found in inspected checkout path.
- Payment-link creation uses a freshly generated idempotency key per call; persistent logical checkout reuse and expired-hold/late-payment reconciliation need design and tests.
- functions/api/webhooks/square.js verifies signatures and handles payment events. Presence of these controls is not an end-to-end payment certification.
- Current quote-product IDs and ordering SKUs differ. Unify mapping to the live server catalog before adding prices to quote selections.
- Live combo Spanish names/descriptions still contain English. Congrí descriptions use 8 oz and unmeasured volume while Dayan confirmed 2 cooked cups per serving. Correct serving specification before margin comparisons. Standalone dessert cup size and Cajita cup size should be explicitly distinct if intentionally different.

## Price assessment
Cannot certify best prices without measured ingredient yield, packaging, labor, waste, payment fees and delivery cost. Do not automatically lower prices from competitor comparisons.
- Hugo's Gourmet West Palm Beach lists medium lechón $64, feeds 10–12, minimum 24-hour notice and $250 delivery minimum: https://www.hugosgourmet.com/order-by-the-pan
- Cuban Cafe Boca lists lechón from $168, half tray 8–10 with rice, beans and plantains: https://cubancafe.com/menu/catering/
Different serving weights, sides and service inclusions prevent apples-to-apples ranking against Añejo's $100 pork-only 10-serving tray or $195 table bundle.

## Proposed design — not deployed
1. One canonical catalog: components, approved substitutions, sizes, packaging and bilingual labels. Combos expand to components for stock and kitchen counts; priced from a versioned server rule set.
2. Instant estimate on every edit: products + packaging + setup/artwork + eligible rush + delivery + applicable tax - discount. No invented prices for unrestricted bespoke work.
3. Auto-confirmable lane: approved food/options, available packaging, accepted artwork templates and an available kitchen/delivery slot. Reserve resources atomically before payment. Lock the shown price for the checkout reservation.
4. Bespoke lane: immediate estimate/range and a standard prepriced alternative; separate custom additions from the instantly purchasable food order. Any later paid change requires customer acceptance. Unlimited design requests are not unlimited guaranteed fulfillment.
5. Square-hosted checkout retained. Stable checkout ID, server calculation, immutable design/order snapshot, duplicate protection, signed webhook confirmation, durable Hub/kitchen/email notification outbox. Expire/release holds and prevent old payment links charging after release, with late-payment reconciliation.
6. Operational Hub controls: daily/slot capacity, ingredient and packaging availability, blackout dates, lead times by product/process, rush eligibility, delivery area/capacity. Rush fee does not override unavailable capacity.
7. Gate rollout on tests: simultaneous last-slot purchases, duplicate clicks/webhooks, expired checkout, payment success with network interruption, unavailable component in combo, artwork failure, bilingual totals, confirmed kitchen ticket and notification receipt.

## Required owner facts
Needs Dayan confirmation: minimum lead times and maximum capacity for food/boxes/custom printing; actual packaging/printing/labor costs or source; rush rules; whether standardized eligible orders become binding at payment without later discretionary repricing. Research source records before requesting facts already documented.

## Handoff
Created this audit/implementation outline only. Tests: live catalog reads, source inspection, competitor first-party pages and bundle arithmetic; no new payment test or production mutation. Approval needed before changing live prices/payment policy; owner facts needed before fully automated acceptance. Continued safe work: pricing and code review while identifying blockers. Next action: confirm operational rules, then implement canonical pricing and reservation-backed checkout in a test environment.

Square reference: https://developer.squareup.com/docs/checkout-api — existing hosted checkout can be reused; no new processor subscription proposed.
