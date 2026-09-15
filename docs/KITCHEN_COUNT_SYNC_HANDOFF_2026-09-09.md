# Añejo — a raised lunch count now reaches the kitchen — Handoff

Date: 2026-09-09
Branch: `claude/anejo-kitchen-count-sync-t1m6f1`
Base: `origin/main` at `2553425`
Owner: Claude Code
Status: built and tested, NOT deployed — merging to `main` auto-deploys (Red: production kitchen path, Dayan approves)

## Reported

Dayan, 2026-09-09: Pompano submitted 23 lunches, then added two more. The Hub kept showing 23 — on
the kitchen board and still 23 when the drivers came to pick up. The invoice came out correct (this
also happened the prior week), so the money side was already right.

## What was actually happening

The count moves through four places. Three of them updated on a re-submit and one did not.

| | on a re-submit | why |
|---|---|---|
| `orders` row (headcount, items, totals) | ✅ updated | upserted by `submitHeadcount` |
| `contract_orders` ledger → **the invoice** | ✅ updated | upserted by `submitHeadcount` |
| SMS receipt | ✅ new count | rebuilt per submission |
| **`order_bowls` — the kitchen's per-bowl checklist** | ❌ **frozen** | `ensureOrderBowls` returned early |

`ensureOrderBowls` (`functions/_lib/orderbowls.js`) began with:

```js
let rows = await fetchOrderBowls(env, order.id);
if (rows.length) return rows;      // ← any rows at all, and it stopped here
```

Those rows are materialized once, when a cook taps **start prep**. After that the checklist was a
snapshot of the count at that instant and nothing ever revisited it. So a count raised afterwards
left **four** things stuck on the old number, not just the board:

1. **The kitchen board / ticket** — 23 bowls to check off (`kitchen/orders.js`).
2. **The readiness gate** — `mark_ready` requires every bowl checked off, and
   `markKitchenReady`'s SQL requires no pending `order_bowls`. With 23 rows, the order went
   **READY while two lunches short**.
3. **The driver's pickup count** — `driver/pickup.js` confirms against the same rows: 23.
4. Only the invoice disagreed, and it was the one that was right.

Net effect: **the office was billed for 25 and handed 23.** Not cosmetic.

## The fix

**`functions/_lib/orderbowls.js`** — the early return is replaced by a reconcile (`syncBowls`),
used by `ensureOrderBowls` (materialize + reconcile) and a new `reconcileOrderBowls`
(reconcile only, no-op when no checklist exists yet).

Deliberately asymmetric, because the two directions are not symmetric in the real world:

- Bowls the order **gained** are added as `pending`. Rows that already exist are never rewritten,
  so raising a count never re-opens work a cook already finished.
- Bowls the order **gave up** are removed **only while nobody has acted on them**. A bowl already
  checked off by a cook, or already counted by a driver at pickup, is a fact about the physical
  world; it is never deleted to make a number match. If the surplus is all real food, the rows
  stay and the mismatch is visible instead of silently erased.

Two hazards found while writing it, both fixed here:

- **A malformed `items` blob would have wiped the checklist.** `parseJson` falls back to `[]`,
  which reconcile would read as "this order owes nothing" and delete every un-prepped bowl. Now an
  order with no parseable items leaves its existing rows alone.
- **`MAX_PER_LINE` was 50, silently clamping.** `submitHeadcount` accepts up to 500, so a
  60-lunch office would have had 50 bowls materialized and been billed for 60 — the same
  kitchen/invoice split, triggered by size instead of by an edit. Raised to 500 (the largest
  headcount the intake accepts) and the inserts are now batched, because 500 sequential inserts
  inside one Worker request is how a large order half-materializes and times out.

**`functions/_lib/contract.js`** — `submitHeadcount` now reconciles the checklist on a re-submit,
and when the count went **up** on an order the kitchen had already started, says so out loud:

- An order that was already called **READY goes back to PREP** — there is food still to build, so
  it leaves the ready pool dispatch draws from. Only while it is still in the kitchen: once a cook
  has handed it off (`kitchen_cleared_at`), the status is a record of what physically happened and
  is left alone.
- A **`contract_count_changed` alert** fires to the kitchen — `warning` normally, **`critical`**
  when the order had already been handed off, because then the office is going to be short unless
  a person acts. Deduped on the new count, so a double-tap of the same number stays quiet while a
  further change speaks again.

**`functions/_lib/alerts.js`, `functions/_lib/push-message.js`** — the new alert type registered,
with generic bilingual lock-screen copy (which office and how many stays behind the Hub login).

## Verification

- `test/money/contract-count-change.test.js` — **15 new tests against real SQLite**, covering the
  reported case end-to-end through `submitHeadcount` (ledger, order row, checklist and driver count
  all land on 25), prep state preserved on a raise, the two never-delete cases, the ready→prep
  rollback, the already-handed-off critical alert, dedupe, the malformed-items guard, and a
  213-bowl batched materialization.
- **The tests were mutation-checked against the real bug**: restoring the old early return fails
  **10 of the 15**. They are not passing by construction.
- Full suite: **1946 passing, 1 failing** — `hub-push-vendor.test.js`, which fails identically on
  clean `main` (`ENOENT @block65/webcrypto-web-push/package.json`; the package is not installed in
  this sandbox). Not related to this change and not touched.
- `npx eslint functions test scripts`: no errors. `git diff --check`: clean.
- **Not verified:** live production behaviour. Nothing here is deployed.

## For Dayan

1. **This is the deploy decision.** It changes the live kitchen path, so it waits on you. Merging
   `main` auto-deploys.
2. **It does not repair today's order.** The fix applies from the next submission onward; any order
   already sitting with a frozen checklist keeps it until the office re-submits.
3. **Worth knowing:** an order can now drop out of "ready" back to "prep" when a count goes up. That
   is intended — it was never actually ready — but it is a visible behaviour change on the board.
4. **Still open, separately:** there is no lock on the count. An office can raise it at any time,
   including after the truck has left; the new critical alert makes that loud but does not prevent
   it. If you want a hard cutoff after which the count freezes, that is a product decision, not a
   bug, and I have not made it for you.

## Files

- Read: `functions/_lib/contract.js`, `functions/_lib/orderbowls.js`, `functions/_lib/alerts.js`,
  `functions/_lib/kitchen-ready.js`, `functions/_lib/push-message.js`,
  `functions/api/hub/kitchen/orders.js`, `functions/api/hub/kitchen/summary.js`,
  `functions/api/hub/driver/pickup.js`, `functions/api/contract/headcount.js`,
  `migrations/0026_contract_accounts.sql`, `migrations/0019_order_bowls.sql`,
  `migrations/0021_bowl_driver_confirm.sql`, `test/money/kitchen-ready.test.js`,
  `test/money/catering-outbox-fixture.js`, `test/money/hub-specific-push.test.js`.
- Created: `test/money/contract-count-change.test.js`, this handoff.
- Modified: `functions/_lib/orderbowls.js`, `functions/_lib/contract.js`, `functions/_lib/alerts.js`,
  `functions/_lib/push-message.js`.
