# Inventory and proactive kitchen production — October 4, 2026

Authority: Dayan's direct-session inventory request authorizes pictures, manual entry, count/weight, photo approval, durable tracking, owner push notifications, and reviewed batch-prep assignments. Existing direct deployment authorization applies after release checks. No purchase, customer communication, credential or payment-setting change. Original marketing-readiness goal remains open.

## Implemented

Inventory cards display private photo thumbnails next to names; manual add, original on-hand unit, separate whole-item count, total grams and optional expiry. Phone file chooser uses camera capture where supported; JPEG/PNG/WebP are reduced client-side, bounded server-side and stored in existing Cloudflare R2 anejo-media under kitchen/inventory. Images remain private staff media; uploading never approves. Owner approval/rejection is bound to exact pending key and revision. Replacements invalidate old approval.

Every inventory route mutation has an atomic before/after ledger with actor/time and row-version fence, including finished-menu counts and photo review. A zero-row update produces neither a phantom receipt nor a push. Push sent/noop/failed is stored; sent is not device delivery. Existing owner subscriptions were read-only counted: three; no notification delivery test has been performed.

Production plans require owner-reviewed published recipe version, explicit ingredient AND packaging maps, exact stock basis/unit, current physical counts, freshness window, finished-stock target, min/max batch, optional kitchen assignee. No guessed ingredient names or conversion, no inferred recipe quantities, no invented targets. Owner may approve one eligible batch without enabling recurring automation. Enabled plans reconcile on inventory mutations, explicit owner check and existing nightly Ops tick. Shared reservations prevent the same supplies being assigned twice; targets account for today's committed same-day orders. Unknown finished count, old/expired counts, changed recipe, archived supplies and unlisted menu items block production with reasons. Unlisted items require owner listing review.

Queued → preparing → completed. Cooking staff record actual yield; any shortfall requires a note. Completion atomically deducts reviewed planned inputs, records shortfall/waste, adds only actual finished yield and optionally relists an active item when owner enabled that plan's relisting. Ingredient and packaging quantities on other measurement bases are separate reported measurements; no unverified cross-unit conversion is made. Preparing work cannot simply be cancelled and release its reserved stock: zero-yield completion records lost inputs. Duplicate completion cannot add or consume twice.

## Evidence and limits

- docs/evidence/inventory-2026-10-04/root-tests.log: npm run predeploy, 3,621 passed, zero failures; trunk ancestry guard passed.
- inventory-tests.log: 16 actual migrated SQLite tests for roles, ledger rollback, zero-row CAS, photo replacement, shared reservations, sold-through target, freshness/expiry/recipe change, actual yield and replay, owner-only one-off queue.
- functions-build.log: Pages Functions module graph compiled. Lint zero errors, existing warnings only; UI inline/external JS syntax and external-script lint pass.
- Supported Chrome actual-route local sandbox: manual entry saved count12/grams240; six planned → five accepted + one rejected; rice20→14 and boxcount30→24; finished stock0→5; photo upload, thumbnail and exact owner approval persisted. QA stock and images were local synthetic records, never production records. Phone viewport390/documentwidth390, loaded photo. sandbox-phone.png is local evidence only.
- schema-before.json: read-only production preflight shows new columns/tables absent before migration. Historical migration ledger is incomplete; do not replay all prior migrations.

Production release and authenticated live read evidence appended below after execution. No paid-order uplift, physical kitchen readiness, smartphone camera capture or push device-delivery claim.

## Dayan inputs / operating handoff

Review actual recipes and packaging quantities per sellable unit, physically count supplies and finished food, choose stock targets/batch limits/freshness/assignee, and choose one-off approval or recurring automatic tasks per item. Each new plan starts OFF. These are real operating facts, not an additional deployment permission. Unlisted menu items need listing review. Confirm push delivery on the actual phone when a real inventory update occurs. Existing unrelated Meta/Google/delivery-price/voice acceptance gates remain in their separate owner input queue.

## Recovery

Schema is additive. On a release failure, restore previous Pages revision; keep ledger/history, do not delete inventory/photo/task rows or drop columns. Disable reviewed plans through owner controls if production planning needs to stop; preserve preparing batches for yield/loss reconciliation. No existing recipes, stock quantities or availability are changed by installing the schema.
