# Guided catering intake and request audit — October18,2026

Owner direct-session request authorizes review of earlier requests, current lead attribution/journey, and fewer-typing catering improvements. Branch codex/catering-guided-intake based on mainf29ee0d. Existing release authorization applies after checks; no customer-specific repricing, message, credential change or payment authorized by this work.

## Changes
Three clear sections: gathering, menu and contact; optional design fields collapsed. Explicit occasion/headcount/time/city chips supplement editable inputs; browser contact autofill preserved; no contact drafts stored. Read-only request summary and delivery-only/fee-pending copy. Existing food choices and backend validation remain. No allergy answer or SMS consent selected automatically; existing allergy notes cannot be overwritten by the no-needs shortcut.

Product builder: opt-in guest-count quantity, current published signature croqueta suggestion before menu browsing, optional side/dessert exploration, advisory quantity differences, preserved custom picker details and bilingual controls. Suggestions never auto-add. Prices remain server-recomputed. Fixed pre-existing undefined public deposit button handler and stale estimate/payment window; changing cart invalidates old pricing immediately, and stale handlers refuse payment while pending. Existing submission/payment locks preserved.

Attribution: preserve external referral origin and allowed public entry route through homepage→catering navigation, stripping referral queries/private routes. Store submitted entry context with request; this is not a session replay or proof of complete browsing history. Successful GA lead event gets random internal lead_reference only when consent-gated gtag exists; no contact details sent to GA. Owner lead desk exposes source/unknown and submitted landing context. HTTP receipt-lookup failures remain explicit, with no claim of text delivery.

## Acceptance
3,813localtests passed/0failed/0skipped;lint0errors/10existingwarnings;Functionsbuildpassed. Later copy/layout-only adjustments passed syntax/diff checks and9focused builder regressions. Isolated real handlers+SQLite submission saved35guests,35porkservings and35hamcroquetas;entryroute/campaign retained;externalprovidercalls0. Synthetic prices/fixture images are not a live menu price assertion. Phone390px verified no horizontal overflow, EN/ES controls tested. Sandbox production security CSP applied. No actual customer request submitted during acceptance.

Evidence (synthetic only): evidence/catering-guided-intake-2026-10-18/. Private customer journey/audit stored outside public repository. No customer names, contact details or private quote links in public artifacts. Release/current-live acceptance pending until appended.

## Discrepancies and boundaries
Immediate acknowledgement activation, Calendar connection/hours/duration/messages, catering delivery fee/origin, Instagram reauthorization, signed-in inventory/Studio operational acceptance, unattended rendering/semantic auditor/voice acceptance and revenue attribution remain separate incomplete gates. Current production inventory has0policies/0tasks; building UI did not configure proactive production. Older release receipts sometimes live only on evidence branches; that is a documentation continuity gap, not proof of a code regression. Do not claim the full marketing team goal complete.
