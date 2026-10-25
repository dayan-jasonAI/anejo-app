# Catering event workbench UI — local evidence, October 25, 2026

## Scope and state

Source changes on `codex/catering-unified-operations`. This record establishes local implementation and synthetic acceptance only. It does not establish deployment, a real kitchen operation, a client notification, a calendar reservation, or printed-sheet alignment.

Owned UI files:

- `public/hub/kitchen/event.html`
- `public/hub/kitchen/event-operations.js`
- `public/hub/kitchen/event-operations.css`
- `public/hub/kitchen/catering-driver-assignment.js`
- `scripts/verify-event-operations-ui.cjs`
- `scripts/verify-kitchen-catering-board-ui.cjs`

Backend, signed-driver screen, recipe authority, joined kitchen board implementation, labels/calendar/communications services, CI, and release are separately owned by the parent and collaborating agents.

## Discrepancies addressed

The event page previously led with driver administration, independent planning checkboxes, and long configuration/history sections. Exact ordered quantities and preparation durations were difficult to distinguish. Purchases were derived and not editable per event.

The revised workbench leads with saved event progress and its next available action, followed by Production, Purchases, Pack/delivery, and Details tabs. History/configuration are disclosures. Dish cards show exact ordered quantities, preparation state, actual recorded quantities, and explicitly labeled cooking minutes. Ambiguous portion conversions display Confirm rather than a guessed serving count. The schedule links cooking and packing to canonical saved operations; it does not let planning ticks manufacture completion. Purchases have event-specific edit/status actions and manual additions. Driver assignment has an explicit owner/staff choice path.

Actual dish progress, purchase changes, measured handling records, prep start, and ready transitions use the supplied PIN/version/idempotency backend contracts. An unconfirmed operation retains its exact request identity without retaining the PIN. The operator must resolve that save before another action.

## Validation observed

Commands executed successfully:

```sh
node --no-warnings --test test/ui/catering-execution.test.js test/ui/event-task-save.test.js test/ui/catering-owner-assignment.test.js
npx eslint scripts/verify-event-operations-ui.cjs scripts/verify-kitchen-catering-board-ui.cjs
git diff --check
NODE_PATH=/Users/aiagent/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules CATERING_BROWSER_CHANNEL=chrome node scripts/verify-event-operations-ui.cjs
NODE_PATH=/Users/aiagent/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules CATERING_BROWSER_CHANNEL=chrome node --no-warnings scripts/verify-kitchen-catering-board-ui.cjs
```

- 37 existing execution/task/assignment regressions passed.
- Event workbench acceptance passed with production CSP at 390 and 1440 pixels: prep PIN, two dishes’ actual progress, packing readings, ready PIN, owner pickup readings, purchase edit/add, uncertain save retry using the same identity, no stored PIN, canonical timeline links, ambiguous units, and a 110-character unbroken dish name without horizontal overflow. All APIs are intercepted synthetic fixtures in this script.
- Joined-board acceptance uses the real kitchen orders GET/POST handlers with every migration applied to isolated SQLite. An upcoming catering booking and an existing retail ticket render together. A real synthetic cook PIN starts preparation. The server mutation succeeds before a simulated lost acknowledgement; retry reuses the same key/version and produces exactly one execution transition. The retail record and displayed content remain unchanged. No fabricated retail catering row is created. No external provider calls occur.
- Both browser scripts reported no page errors.

Screenshots:

- `/tmp/event-operations-ui-evidence/event-workbench-mobile.png`
- `/tmp/event-operations-ui-evidence/event-workbench-desktop.png`
- `/tmp/kitchen-catering-board-ui-evidence/joined-board-mobile.png`
- `/tmp/kitchen-catering-board-ui-evidence/joined-board-desktop.png`

## Review handoff and limits

The parent owns final joined-board recovery hardening, full CI, branch integration, hosted preview, migration/release ordering, and live readback. Root service review findings were sent to the parent: saved-vs-visible kitchen hours, exact unique preview loads, label preview loading, renderer fingerprint binding, and image-decode/print-layout proof. Recipe UI draft-loss/in-flight edits/image-readiness findings were sent to that file owner.

No real customer data, payments, email/SMS, calendar bookings, production databases, credentials, or live deployment were mutated by these checks. Printed Avery alignment still needs an actual-size physical test sheet. The presence of configured controls does not establish that an external provider action ran.
