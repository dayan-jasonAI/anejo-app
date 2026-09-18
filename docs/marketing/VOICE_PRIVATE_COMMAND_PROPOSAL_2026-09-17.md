# Añejo private operator commands — bounded proposal

2026-09-17. Read-only source inspection; no repository changes, provider calls, or live execution claims. Release 112 remains parent-owned. This is a proposed next increment, not deployed capability.

## What to borrow from DRH

Inspected only the primary workspace checkout `/Users/aiagent/Dayan Workspace/Aether/drh-crm`: `core-hub/operator.mjs`, `core-hub/operator-d1.mjs`, `test/operator-card.test.mjs`, and `test/operator-executor.test.mjs`. The old operator.mjs is a retirement tombstone; operator-d1.mjs is the current implementation pointer, not proof of current deployment. Its useful pattern is structured action results and cards, with deterministic narration derived AFTER the executor result. It does not establish success from the model's pre-action prose. Its card tests exercise handler execution, a better precedent than source-string assertions. Do not import DRH's external action permissions or its broad executor.

## Current Añejo boundary

`functions/api/hub/owner/operator.js` is owner-gated; capabilities and marketing status are deterministic, read-only paths. Queue counts and recorded scheduler evidence are timestamped. The browser widget `public/hub/owner/assets/operator.js` currently displays/speaks replies only; it has no structured navigation dispatcher. Speech input and output use browser facilities (the file header's ElevenLabs claim is stale). Typed input remains necessary when browser speech is unsupported.

The marketing Lead's action allowlist lives in `functions/_lib/team_lead.js` (`ALLOWED_ACTIONS`), with execution in `functions/api/hub/owner/team.js`. It is not automatically the voice operator's authority. `create_brief` currently writes a private draft to team_briefs with a random identifier and created_by='lead'; it lacks a retry key. Do not route voice requests directly through it without resolving attribution and duplication.

## Smallest useful increment

Implement an explicit deterministic intent table (English and Spanish aliases), returning a typed private UI descriptor; no model/provider call is needed for these commands. Accept only named destinations in a browser allowlist, never arbitrary model-supplied URLs, script, selectors, or actions.

| Owner command | Deterministic result | Evidence and clarity |
|---|---|---|
| Open Photos / Abrir fotos | Navigate to `/hub/owner/marketing.html#photos` | Same-page hash routing preserves current inputs. Confirm opening only after client routing succeeds. |
| Open Create & Schedule / Crear y programar | Navigate to `marketing.html#create` | Navigation does not create, schedule, or publish anything. |
| Show drafts / Mostrar borradores | Navigate to `marketing.html#create?filter=drafts` | Reuse current hide-only queue filter, preserving typed captions. Show latest 60 scope; do not imply all historical drafts. |
| Show audit status / Estado de revisión | Read current saved draft audit evidence, then offer/select a draft card | Show pass/stale/unavailable and observed time using computed audit_current plus audit_detail_json. A pass is not permission to publish. No new judge call. If a requested draft is outside the loaded queue, say so instead of claiming it was opened. |
| Draft campaign brief: [owner text] / Preparar brief: [texto] | Return an UNSAVED private brief preview containing supplied title/notes | No fabricated audience, dates, prices, menu or objectives. Explicit Save private draft and Cancel; preview alone is not a saved brief. |

Keep global capabilities text accurate: “I can open private marketing screens and show saved status. I can prepare an unsaved brief. I cannot publish, send replies, or change orders.” Offer visible buttons alongside speech; a hidden double-tap gesture should not be the only route to typing. Reuse Hub language for speech locale where available, but do not claim browser recognition works on every device.

## Minimal implementation files

1. NEW `functions/_lib/operator_commands.js`: pure normalized intent parser, named destination descriptors, bounded plain-text brief-preview parser. Unknown/ambiguous commands do not map to a write.
2. `functions/api/hub/owner/operator.js`: owner gate remains before dispatch; handle deterministic commands before budget/model fallback. Return structured receipt `{mode:'deterministic',mutation:false,observed_at}` and command descriptor. Read-only audit evidence must use the same current-context/revision predicate as social GET, preferably a shared helper rather than weaker duplicated SQL.
3. `public/hub/owner/assets/operator.js`: allowlisted descriptor renderer, explicit destination links/buttons and unsaved preview. Same-page navigation uses hash; cross-page navigation must protect dirty forms or require an explicit Open button. Do not say “saved” or “opened” from server prose before the client performs the action. Render text with textContent.
4. `public/hub/owner/marketing.html`: a small optional bridge can expose queue routing/focus completion and brief-preview mount without re-rendering existing cards. Existing MarketingTabs.routeQueue and filterQueue already support filter/post targets. There is no #team route: current tabFromHash supports photos, teach, create/email, otherwise today. Do not invent a brief deep link.
5. If persistent brief save is included in a second increment: extract private brief creation from `functions/api/hub/owner/team.js` into a shared helper with correct owner attribution, bounded validation, explicit idempotency token and actual DB receipt. Keep the existing Lead contract intact. This extra step is unnecessary for useful phase-one navigation/status/unsaved preview.

## Required behavioral tests

- Parser: explicit EN/ES aliases; arbitrary URL/injection and publish/send/schedule requests cannot become navigation or writes; missing brief topic produces an honest clarification.
- Endpoint: owner authorization; deterministic routes succeed without model credentials or budget; trap fetch/provider and DB writes to prove none occur. Audit statuses include stale/null legacy evidence, DB failure and observed_at.
- Browser: dispatch allowlisted destination, preserve typed caption across queue filters; no navigation for unsupported descriptor; dirty cross-page state is protected; target outside latest60 produces no false focused claim. Use real DOM events rather than only source regex.
- Brief preview: no DB mutation on generation/open/cancel; explicit save-only path if implemented, duplicate request returns same persisted draft, DB failure never says saved.

## Limits and recommended order

First ship navigation + saved status + unsaved brief preview. That yields useful private voice operation without expanding publication authority, paid calls or external writes. Add persistent private brief save only with idempotent receipts and a visible private preview. Keep scheduler wording as observed execution, not currently running; a heartbeat is not proof that an individual post was sent. Actual browser/mobile acceptance remains required after implementation. No DRH tests or runtime were executed for this source-only proposal.
