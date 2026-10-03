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
