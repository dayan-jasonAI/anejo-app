# Hub readiness and event-specific push — 2026-09-08

Owner: Codex. Bounded push, caller and UI implementation was delegated and reviewed in the same session. Branch: codex/kitchen-ready-notifications. Baseline: fb93160 (production code 3007c6e).

## Authority and scope

Dayan directly requested kitchen-ready owner notifications, visible readiness and specific iPhone notification messages in this session on 2026-09-08, following his instruction to publish the changes and keep new features English/Spanish. This is the direct-session approval receipt, not a request for duplicate approval. Scope: these Hub features, tests and normal Git/Pages release. Exclusions: no secrets, DNS, payment rules, automated assignment rules, production schema changes or synthetic live messages. No client-facing email sent.

## Changes / handoff

- Kitchen mark_ready persists its order status and owner alert in one D1 batch. Failure inserting the alert rolls back readiness; concurrent/repeated taps create only one receipt. Existing payment/PIN/all-bowls checks remain, with atomic status/bowl-state guards. A ready order cannot be accidentally moved back to prep or have its bowls unchecked through this endpoint. Bowl IDs are scoped to their parent order.
- New owner-only /api/hub/owner/ready-orders includes all ready dates and kitchen-cleared orders. Kitchen screen clearance is not delivery. It distinguishes pending/unfilled route offers from accepted drivers; returns 503 rather than a false empty queue on storage failure, with no-store success responses.
- Command Center, Orders and Deliveries show a shared readiness panel, refreshing every 30 seconds/on focus with freshness/error text. Dispatch selections survive independent refresh; links identify the date/order/existing route without auto-assignment. Mobile cards wrap actions below order details.
- New staff push payloads carry fixed event-specific EN/ES copy encrypted using Apple-compatible aes128gcm, dependency @block65/webcrypto-web-push pinned 2.0.0. No customer names, addresses, food notes, message bodies or arbitrary alert text goes on lock screens. Active staff/current roles are checked at send time; customer tickles retain their separate behavior. Four concurrent sends, independent 8-second timeouts, existing 20-device cap. No secret values logged.
- Service worker v8 reads payloads without a session fetch, retains selected language separately from shell cache, scopes cache cleanup and notification destinations, and uses distinct event tags. Legacy empty pushes show a truthful status/failure instead of inventing a new message.
- Actual completed Square payments, manual paid/pending orders and subscription invoice payments get the corresponding distinct alerts. Once-ever payment dedupe survives acknowledgement/retries. Existing APPROVED payment-to-kitchen behavior was not changed; the new paid notification waits for COMPLETED. Public unpaid abandoned checkouts and individual daily subscription prep rows do not cause extra owner pushes.
- Existing message, delivery-offer, marketing, EOD and social-inbox caller metadata is explicit. Removed the redundant partner application push after its central alert.

Outputs: functions/_lib/{kitchen-ready,push-message,push,alerts}.js; functions/api/hub/{kitchen/orders,owner/ready-orders,push/peek}.js; owner readiness.js and index/orders/deliveries HTML; hub.js/sw.js; notification callers and tests shown by git diff fb93160.

## Validation evidence

- npm test after the deployment packaging fix: 1,888 passed, 0 failed; /tmp/anejo-ready-build.5xZaOG/tests-vendor-final.log.
- npm run lint: exit 0, with two upstream unused-variable warnings in the generated vendor bundle; no errors. git diff --check: passed.
- npx wrangler pages functions build --outdir /tmp/anejo-ready-build.5xZaOG/functions: compiled successfully.
- node scripts/predeploy-guard.mjs: branch up to date with origin/main.
- Real SQLite handler tests: atomic status+alert rollback, concurrent ready calls, replay after acknowledgement, unpaid/canceled/fulfilled guards, bad PIN, undone/null bowl state, cross-order bowl ID, role restrictions, ready list with future/overdue/cleared orders, pending vs accepted routes, database failure.
- Independent synthetic receiver test decrypts the encrypted Web Push using HKDF/AES-GCM and verifies VAPID signature/headers. Tests cover offline/sessionless SW rendering, Spanish preference, safe URL/cache isolation, active-role query, current taxonomy, concurrency limit and customer regressions. No device/provider credentials used by tests.
- Local-only browser fixture: /tmp/anejo-ready-preview.drqA4E/server.mjs on 127.0.0.1:8812; fake owner/orders/drivers, mutations rejected. EN/ES readiness, date/order and existing-route links inspected. Driver/check selection survives both readiness and explicit assignment-list refresh. Language tests preserve exact customer text and selections.
- Mobile 390x844: document/body width390, no horizontal overflow; visually inspected final stacked readiness cards, labels and route actions. Temporary viewport restored before handoff.
- Production read-only preflight: Pages has VAPID_PRIVATE_JWK, VAPID_PUBLIC_KEY, VAPID_SUBJECT configured (names only inspected). D1 count query found 2 active-owner push device records and 1 ready order; rows_written=0. These counts are timestamped preflight, not a claim of live phone delivery.
- Cloudflare skills guided the transaction, runtime-compatible encryption, bounded fetches and normal deployment path. Current D1 batch docs and Workers types 5.20260908.1 reviewed. No configuration upgrade needed.
- Dependency-free build proof: copied Functions alone into /tmp/anejo-push-no-deps.hP5RQa, without project node_modules/package/config/secrets; the existing absolute Wrangler CLI compiled the entire Worker into its build directory. Checked-in encryption bundle reproducibility is covered by the test suite; full upstream MIT notices retained. Rebuild command: npm ci && npm run build:hub-push.
- An additional optional Miniflare smoke probe did not execute because the installed constructor rejected legacy options. It is not validation evidence; SQLite transaction tests and the compiled Worker remain the executed checks.

## Risks / boundaries / next action

Hub alert persistence and push-provider acceptance are different. Push is best-effort and subject to endpoint/OS permission, connectivity and expiry; no new general retry-outbox was introduced. An external push failure does not remove the durable Hub alert or readiness panel. There were no synthetic production messages and no real orders changed for testing. Actual iPhone lock-screen receipt remains Unverified until Dayan sees a real post-release event; he should reopen the installed Hub so its updated service worker/language code can load. No new approval needed for the requested release. Older unrelated dispatch/planning copy has English gaps outside this change; all newly added readiness/push copy is bilingual.

Rollback: reviewed code revert on main through the existing Pages pipeline. No database rollback or deletion of alerts/orders. Existing auto-sync commits with [skip deploy] captured work on this feature branch; release commit explicitly publishes reviewed code.

## Publication

Published release commit: 60c4ca618503f1127b56bdd009fc7c228940d913, pushed to main and codex/kitchen-ready-notifications via normal fast-forward Git. No deployment settings changed.

Cloudflare production deployment cb3d1d16-b555-44b2-bc10-964f6aa21f5a: queued, initialize, clone_repo, build and deploy all success. Deploy ended 2026-09-08T17:01:55.202801Z. Deployment URL: https://cb3d1d16.anejo-app.pages.dev. Preview deployment 91f04839-023f-41b8-b602-386998b74c34 is separate and is not the production proof.

Initial releases c459728 and e7911f5 failed the hosting Functions compiler because it could not resolve the new npm dependency. They did not replace the existing successful deployment. The final release includes a reproducible, checked-in browser/Workers ESM bundle at functions/_lib/vendor/webcrypto-web-push.js and uses a relative import, preserving the existing hosting pipeline. Bundle SHA-256: a3c9ac7ac312424f230285599d9e8112a4caf1c51d67dc82d3ec7e9530b1f2a9.

Production read-only checks immediately after deployment:

- https://anejocateringco.com/hub/sw.js: HTTP 200, bytes match local release; SHA-256 05e06cb6581986aebb583e070e0f5416810ef8256156a5c43838e012d1f502a9.
- https://anejocateringco.com/hub/owner/assets/readiness.js: HTTP 200, bytes match local release; SHA-256 c6b1cb830d998d981173a0d9785af14edd23c0a08d1dd677bed58422b27ce6f2.
- /hub/owner/deliveries.html: HTTP 200 at canonical /hub/owner/deliveries. An unauthenticated browser still requires sign-in; this check is not authenticated workflow proof.
- /api/hub/owner/ready-orders: HTTP 401 with Not signed in, confirming the deployed endpoint rejects an unauthenticated caller (previously 404).

GitHub release workflow: https://github.com/dayan-jasonAI/anejo-app/actions/runs/34254557173 completed successfully. Both Añejo Functions test/lint/Pages-build and hub-app React lint/test/build jobs passed.

While hosting was blocked, continued safe work on dependency-isolated build proof, bundle reproducibility, regression tests and release evidence. Remaining user action: reopen the installed iPhone Hub and confirm the next genuine notification. No additional approval required; actual iPhone receipt remains Unverified.
