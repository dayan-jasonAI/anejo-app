# Lead retrospective evidence — October 3, 2026

Status: locally implemented and validated; release and live acceptance pending. Full marketing objective remains open. Existing direct-session engineering/release authorization applies; no customer sends, public posts, charges, credentials or trust settings changed.

The Lead now receives bounded read evidence for brief records, attributed performance, attribution counts, audited drafts and marketing outcomes. Failed reads remain unavailable instead of becoming empty boards or zero posts. Selected source IDs and actual timestamps accompany an exact hash of the text supplied to the Lead, preserved through its inference receipt. The signal detector internally catches failed queries, so its read coverage remains explicitly unknown. Revenue, booking attribution and ROAS are not manufactured.

Published posts without captures remain counted; absent reach/saves stay unknown. Partial captures label measured-post coverage separately for reach and saves. An observed sum for one measured post out of two cannot be presented as the entire brief's performance. Audit timestamps use audit_at, updated_at or created_at in that order. Failed all responses and malformed attribution counters cannot establish successful reads.

Root inspected the implementation and added the partial-capture regression after reviewing the agent's initial repair. Targeted retrospective/Lead run: 50/50 passed. Root whole application run: 3,586/3,586 passed; lint: zero errors, eleven existing warnings; Pages Functions build succeeded. Logs are under evidence/retrospective-receipts-2026-10-03. These tests exercise real migrated local SQLite, exact prompt hashing and inference persistence; they do not establish current production reads or an actual model's interpretation.

An additional joined Ana fixture runs the actual inbox tick, owner inbox read, stale-preview refusal, explicit reviewed send, durable acceptance receipt and replay using local model/provider responses. Automatic sending remains off; no actual customer/provider request occurs. Provider acknowledgement is deliberately distinct from recipient delivery. Root full-suite result includes that test; further changes must rerun appropriate checks.

Remaining: exact-head CI, gated release and provider/live readback; successful live auditor reasoning, deployed render resources/parity, actual device voice and channel acceptance, and the broader operational queue. No paid-order uplift claim. Safe local work continued while Cloudflare plan sign-in, auditor billing and Google prerequisites remained unresolved.

## Bilingual voice and final local validation

The operator now uses AnejoLang's EN/ES preference for recognition and browser speech, with safe page/storage/English fallbacks. The spoken response retains the locale captured at the user's tap even if the preference changes during the request. No microphone auto-start or remote TTS was added. Root inspected the change and independently ran the joined Ana plus voice tests: 13/13 passed. Root final application suite: 3,588/3,588 passed. Prototype suite: 143/144 passed with one explicit Node-native base64 skip; no failures. Lint remains zero errors/eleven existing warnings. Real-device microphone/synthesis and provider-delivery acceptance remain unverified. Existing Hub cache headers require revalidation; no template/cache change needed.

Cloudflare plan sign-in is now cleared by current read-only browser observation; account Paid and blank CPU override are recorded in AUTHENTICATED_WORKER_RESOURCE_2026-10-03.md. No resource gate is silently promoted. Release remains pending at this entry.

## Release receipt — October 3, 2026

PR195 passed all four exact-head checks at fa7356f2e43d176f7b9fc86474754f7618ca2c5d and merged as c53c9b5469df5efb711174dc682a1b4283774b98. Current Wrangler OAuth production inventory identifies deployment 2e84e4f0-79c3-4722-809c-65c0f598c27b with source c53c9b5; preceding inventory reported Active. This establishes the shipped revision. Normal supported Chrome loaded the authenticated marketing workspace and its operator script. Actual model interpretation, bilingual microphone/speech and recipient delivery remain unverified.

The public verifier passed its eight static surface and two unauthorized API checks, but skipped database reads and freshness (the local tracking ref was stale at invocation; subsequently fetched). These checks do not cover the new marketing capabilities. Strict deployment verifier exited 1 because its CLOUDFLARE_API_TOKEN/account environment was absent; existing Wrangler OAuth inventory supplies separate provider evidence without changing credentials. A direct static-byte hash attempt received HTTP 403 Forbidden and stopped; no byte match claimed. Exact logs and browser readback are adjacent in the evidence folder.

Next local engineering: durable executor admission and a whole-flow deadline. Existing per-isolate admission and job lease fencing do not stop simultaneous computation in separate isolates or prove termination after timeout. No prototype production route/resource/publication gate has been enabled.

## Local executor foundations

Root independently inspected and ran durable-admission.test.cjs and execution-deadline.test.mjs: 7/7 passed. Actual local workerd SQLite Durable Object tests hold admission through outstanding synthetic I/O, release only after fulfilled/rejected work settles, and preserve refusal after restarting with a seeded interrupted receipt. The bounded deadline refuses new dispatch at expiry and waits for pending operations to settle; invalid/reversed clocks permanently revoke this execution's dispatch authority. These modules are now included in the prototype test command.

No full renderer integration or deployed global resource gate is claimed. Next: put complete capture, exact-job consumption, commit/readback/recovery inside the coordinator-owned operation; propagate a server-created whole-flow deadline through stages and D1 execution-time mutation guards. Audit detached/streaming work before promoting admission. Real CPU/combined memory and image/ICC parity remain separate requirements.

Full prototype suite after adding executor foundations: 151 tests, 150 passed, one explicit Node-native base64 skip, zero failures. Log: evidence/retrospective-receipts-2026-10-03/prototype-admission-full-tests.log. No app runtime changed by these foundations.
