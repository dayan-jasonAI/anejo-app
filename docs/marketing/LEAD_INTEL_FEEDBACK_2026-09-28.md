# Lead research feedback — September 28, 2026

Implemented and validated locally; not deployed. The Lead previously requested research but received no completed answers in its prompt. Its spine now reads the five most recently updated completed Lead requests with linked Intel answers. Pending requests, missing links and other requesters are excluded.

Answers retain request/Intel IDs, timestamps and reported source URLs. Exact supplied text is hashed in the inference receipt; citation eligibility uses that same snapshot even when the database changes during inference. Research is explicitly unverified data, never permission to publish or override owner/menu authority. No links are fetched by this reader.

The reader bounds individual fields and the total JSON payload to 6,000 characters. Oversized/malformed records are omitted whole and omissions disclosed; it does not claim exhaustive research coverage. Owner answers up to the existing 4,000-character limit are supported. The producer's collectSources function stores arrays of URL strings, matching the reader. Automated answers exceeding limits remain omitted rather than silently clipped.

Root validation: 3,335 root tests passed, zero failed; lint zero errors and 11 existing warnings; Functions build succeeded. Six new SQLite-backed regressions cover filtering, unavailable reads, invalid/oversized records, whole-record budgets, full owner answers, and inference-time mutation with exact receipt continuity. Provider inference is mocked; these tests do not establish creative reasoning quality or live behavior. Evidence and source hashes: evidence-2026-09-28/lead-intel-validation.json.

No schema, credentials, public content, customer sends or automatic approval changed. Deployment remains pending the existing release stack and Cloudflare authorization repair; authenticated live acceptance is also pending. Next: CI on this exact revision, then release in stack order after access is restored and validate a completed research request in the live Lead conversation.
