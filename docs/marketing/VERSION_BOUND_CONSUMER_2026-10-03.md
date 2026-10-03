# Version-bound private render consumer — October 3, 2026

Status: local implementation and binding acceptance; not deployed or imported by application routes. The full marketing goal remains open. This checkpoint supersedes the previous note that source capture was not consumer-bound.

## Change and evidence

Jobs now require a canonical source-version ID and source-metadata SHA256 in addition to the original photo, draft revision, selected slide, renderer, template and options. The private consumer obtains the actor-bound confirmed version, verifies its bytes and metadata, and renders the preserved copy. Replacing the original afterward does not change the captured pixels or inherited provenance. Each of the three final D1 mutations also requires the exact confirmed source record; losing that record before attachment rolls the transaction back.

Recovery performs bounded output storage readback before a final joined database-state read. Independent review reproduced a gap: unchanged pixels and job tags could hide altered output provenance. The repair derives the full expected metadata map from the registered source snapshot and uses the same mapping for output creation and recovery. Four regressions cover AI provenance, source-version ID, version key and metadata digest corruption. Uncertain post-commit verification stays commit_unknown rather than claiming a verified attachment or retrying blindly.

Output reads now use the shared streamed 5 MiB limit, 15-second deadline, chunk/empty-chunk caps and nonblocking cancellation. Tests reject oversized actual data despite a small declared size, and pathological empty chunks with a cancellation promise that never settles.

Root validation: npm --prefix tools/marketing-render-prototype test — 129 tests, 128 passed, zero failed, one explicit Node-native base64 skip. Log: evidence/version-bound-consumer-2026-10-03/prototype-tests.log. These include three complete-consumer tests using real local workerd D1/R2 bindings; rendering in those fixtures still executes in Node. Independently reviewed consumer subset: 29 passed, including four provenance cases and three D1/R2 cases; root full-suite log is the authoritative recorded result. git diff --check passed. No root application change was made in this checkpoint, so historical 3,577 root results are not re-labelled current.

## Limits and authorization

No production schema, application route, credential, provider request, public post, customer communication, charge or trust setting changed. Source copies and outputs are verified at observed reads; arbitrary R2 mutations after the last read are outside this proof. Bucket-wide writer policy, actual Worker renderer execution, authenticated HTTP integration, global concurrency, deployed CPU/peak memory, Canvas visual parity and owner visual acceptance remain open. Human review remains required and publicationApproved stays false.

Direct-session authorization covers continued engineering and gated release; this local-only checkpoint is not a release of a usable customer/marketing runtime. No new approval requested. Next: package the exact renderer/assets with existing roster-backed authentication in a local private draft-only Worker rehearsal, test roles and idempotency with actual bindings, and retain the production/resource gate until evidence closes it. Continue full-scope audit separately from external Google/auditor dependencies.
