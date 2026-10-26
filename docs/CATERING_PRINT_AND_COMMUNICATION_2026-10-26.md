# Catering print and communication refinement

Dayan approved the rendered delivery templates with the specific instruction to replace celebration-only wording with neutral event/location wording. The direct-session instruction is the approval record for that scoped revision and future activation; it does not authorize retrospective delivery notices or test sends to real clients.

## Communication

`catering-delivery-care-v2-neutral` uses event-neutral EN/ES departure and delivered messages. A saved delivery address is included when available; HTML is escaped and control characters are removed. Missing/unreasonably long addresses fall back to the event location and account link. Quote, follow-up and experience copy also use event wording. Accepted historical receipts are retained; no already-sent message is rewritten or resent. Pending messages with an obsolete template version cannot send under the new approval. Activation is a separate persisted production operation after code verification, with future-transition cutoff, existing SMS consent/STOP and provider outcome fences intact.

## Band print profile

- Landscape 17×11-inch sheet, printed at 100% actual size without fit-to-page.
- Three 16×3-inch bands, x=.5 inch, y=.5/4/7.5inches. This is the canonical reusable preset; historical references vary slightly in trim height/row spacing.
- Owner’s production stock: Office Depot 100 lb glossy.
- Three starter styles: ivory/champagne, blush florals, signature green/ivory. Clean source artwork is reused byte-for-byte; private source hashes/provenance are outside the public repository. No customer name or baked-in QR was imported into shared assets.
- Authentic emblem, self-hosted Cormorant Garamond and Josefin Sans (licenses accompany font files), editable dish/event wording, theme ink QR, contact and Instagram handle.
- Website/catering and optional owner-configured honest Google review QR; Instagram fallback when no validated review destination is saved. QR quiet zones remain intact. Spare positions use standard reusable Añejo branding instead of blank bands.
- Existing Avery round geometry is separate. Do not apply17×11 band positions to sticker/tag sheets or inherit a misaligned historical top row.
- Every menu/theme/artwork change invalidates the previous renderer fingerprint approval. Owner reviews current layouts before final use. Physical printer alignment/phone scanning remains a separate acceptance step.

The shared `renderEventBands` function is used by the internal event label generator and the bounded public Atelier template-preview endpoint. The latter is transient and carries no approval, checkout, pricing or server-side design persistence. It does not proof customer-uploaded artwork; those designs still need review.

## Commissary records

See `COMMISSARY_USAGE_2026-10-26.md`. The supplied QR is an actual-use Google Form, not a reservation calendar; no third-party submission is automated. Server-timestamped visits, immutable correction history, owner review and uncapped ET monthly staff-hour totals are separate from planned reservations and external form-receipt verification. No monthly quota or guessed attendance is created. Actual recurring days/times and business/license details remain owner-supplied facts.

## Validation and release

Run the full test suite/lint/Functions build, browser scripts for event services, band print layout and commissary, plus the existing Atelier/quote flows. Record exact-head hosted checks, migration 0166 readback, guarded release, source hashes and saved activation readback privately before reporting them. Preview PDFs are synthetic review examples, not historical event artwork or proof of physical printing. No real attendance or client send is needed for acceptance tests.
