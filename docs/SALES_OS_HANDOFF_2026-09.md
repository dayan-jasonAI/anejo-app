# Añejo Sales OS — Handoff, 2026-09-10

**Where it is:** branch `feat/sales-os`, in the git worktree `~/anejo-sales-os` (cut from `main` at
`ec93c5c`). The worktree sits outside the 15-minute auto-sync job, which only touches
`~/Dayan Workspace/Aether/anejo-app`, so nothing here has been pushed by a robot.

**Nothing is live.** Not pushed, not merged, not deployed. Migration 0103 has **not** been applied
to production D1, and the cron Worker has not been redeployed. Every step to production waits for
Dayan (spec §2.6, §34).

## Status, labelled (spec §35)

| Label | What |
|---|---|
| **LIVE** | Nothing. |
| **BUILT + VERIFIED (in tests and a local browser run), DISABLED BY DEFAULT** | The Sales workspace (Dashboard, Prospects + detail, Approvals, Settings, Launch review) · organizations/contacts/evidence with dedupe · deterministic ICP scoring with reasons · CSV import · manual research of an org's own website (SSRF-guarded, robots.txt) · AI account brief with code post-validation (falls back to facts-only with no key) · opportunities + stages · the 4-step email sequence · deterministic email composer + governance flags · approval with a preview hash · the gated send loop · unsubscribe (token link + one-click) · Resend delivery/open/click/bounce/complaint → sales rows · personalised landing page + request form + event beacon · owner alert on a prospect request · proposals (integer cents, totals must agree) · **Convert to Contract Account** · funnel metrics + bottleneck diagnosis · scheduled jobs (`sales-tick`) · Team Lead `propose_campaign` (Broadcast **draft** only) · positioning filed as a Brief **proposal** |
| **BUILT BUT SWITCHED OFF** (flags default off) | Scheduled discovery · scheduled website research · sending approved prospect email · follow-up drafting |
| **LOCKED OFF IN THIS BUILD** | Auto-send without approval · AI voice. Owner approval of every prospect email is locked on. |
| **REQUIRES A CREDENTIAL / PROVIDER** | `GOOGLE_PLACES_API_KEY` (automatic discovery; CSV works without it) · Resend webhook events `email.delivered/opened/clicked` (bounces/complaints already subscribed) · `CRON_KEY` + a redeploy of `cron/` (for scheduled jobs) · automated inbound reply detection (**no provider** — replies are marked by hand) |
| **REQUIRES OWNER APPROVAL** | Merge + deploy · apply `migrations/0103_sales_os.sql` · redeploy the cron Worker · set the real postal address · set sender + Reply-To · read and **confirm** the offer · proof wording (DGP by name only with DGP's recorded permission) · the Google Places terms decision (`SALES_OS_COMPLIANCE.md`) · approve the positioning proposal in Reviews · read the Launch review · switch on each flag |
| **DEFERRED** | Voice (Sprint F) · avatar video · three new cardgen templates · Team Lead writing to prospects (it deliberately cannot) · an email-verification provider (unverified addresses are simply never sendable) · a generic institutional landing page (social CTAs should use `/business`) · extraction into Aether Hub |

## How it was verified

- `npm run lint` — **0 errors** (3 warnings, all pre-existing in files this branch does not touch).
- `npm test` — **2241 / 2241 pass**. This branch adds seven Sales test files and extends three existing
  ones for the new nav entry, the fourth Team Lead verb and the new alert type — those updates widen
  counts; no assertion was weakened.
- `npx wrangler pages functions build` — compiles (the CI step that catches unresolvable imports).
- **Real SQLite, not mocks:** the Sales tests run against `node:sqlite` with **all 111 migrations
  applied** (`test/helpers/sqlite-d1.js`, reusable by any test), so UNIQUE indexes, column names and
  the seeded DGP account are the real ones.
- **Browser walkthrough** against a local, isolated D1 (all migrations; `.wrangler/` is gitignored) via
  the localhost-only dev login: dashboard → add organization → score breakdown → add contact → create
  opportunity → draft → Approvals (Approve absent until Preview, present after, then "Approved and
  queued") → Settings (locked switches shown locked) → Launch review (all 14 sections) → the
  prospect's landing page (staff-preview banner, no internal data, no price).
- `npm run verify:deploy` — **not run**: nothing was deployed.

### Found and fixed during the walkthrough

1. **A missing distance scored as "0.0 mi".** `Number(null) === 0`, so an organization with no
   coordinates earned full route points. Fixed in the scorer, the distance helper and the data layer;
   pinned by two tests.
2. **The no-fact email opener implied customers** ("we work with programs in Boynton Beach…"). It now
   claims nothing ("I am writing to a few programs in … about scheduled meal service.").
3. Form labels were not tied to their inputs (screen readers). Fixed for every Sales form.
4. "The 1 highest-ranked prospects" → singular.

## Spec §28 test requirements → where they are

| Requirement | Test |
|---|---|
| Conversion uses owner-confirmed terms; no phantom $0; mismatched totals refused; cannot overwrite DGP/existing accounts; idempotent | `test/money/sales-conversion.test.js` |
| Suppressed prospect cannot be sent; no SMS from a discovered number; transactional consent not reused; unsubscribe/postal structure; no send without approval; stop-on-reply | `test/compliance/sales-send-path.test.js` |
| Repeated discovery / enrichment / send tick / conversion create nothing twice | `test/money/sales-idempotency.test.js` (+ conversion) |
| Sales in owner nav; six-slot rule; approval card names recipient + organization; Approve cannot exist without a rendered preview; suppressed cannot be approved | `test/ui/sales-workspace.test.js`, `test/ui/hub-nav-overflow.test.js`, send-path test |
| Missing facts stay missing; model cannot invent price; model cannot alter score; unsupported claims flagged; owner edit is what is stored and sent | `test/money/sales-ai.test.js` |
| Scoring reasons, SSRF guard, robots.txt, extraction, discovery provider | `test/money/sales-scoring-enrich.test.js` |
| Landing page: token-only, escaped, no internal data, no cross-prospect leak, staff previews not counted | `test/compliance/sales-landing.test.js` |

## Where current `main` differed from the spec, and what was chosen

Summarised here; the full table is in `SALES_OS_ARCHITECTURE.md`.
- Migration numbering had moved on: this is **0103**, not "after 0090".
- The human-preview law landed on `main` the same morning (#75). The Sales approval mechanism
  enforces it harder than the spec asked: approval carries the preview's hash.
- A real DGP account is seeded by the migrations. Conversion refuses any name or billing-email match,
  and a test proves the DGP rows stay byte-identical.
- No inbound mail exists for the sending domain, so reply detection is manual. The UI says so.
- Emails are composed deterministically from verified facts; the AI brief advises and never writes
  copy. This is what makes "the model cannot invent a price" true by construction.

## Changed files

New: `migrations/0103_sales_os.sql`; `functions/_lib/sales/*` (11 files); `functions/api/hub/owner/sales/{index,outreach,settings,deal}.js`;
`functions/api/hub/admin/sales-tick.js`; `functions/api/sales/{request,landing-event,unsubscribe}.js`;
`functions/for/[token].js`; `public/hub/owner/sales.html`; four `docs/SALES_OS_*.md`; seven test files +
two test helpers.

Modified (each additive): `functions/_lib/email.js` (opt-in `from`/`replyTo`; existing request bodies
byte-identical, tested) · `functions/api/webhooks/resend.js` (sales events after the unchanged
suppression block) · `functions/_lib/alerts.js` + `push-message.js` (one alert type, generic EN/ES
lock-screen copy) · `functions/_lib/team_lead.js` + `functions/api/hub/owner/team.js` (`propose_campaign`)
· `cron/worker.js` (five schedules) · `public/hub/owner/assets/owner.js` + `hub-i18n.js` (Sales in More)
· `.telemetry/tracking-plan.yaml` (17 `sales.*` events) · `docs/HUB_ARCHITECTURE.md`,
`docs/MARKETING_TEAM_GUIDE.md`, `public/hub/owner/marketing.html` (comment) · three tests updated.

## The shortest path to Clinic #3

1. Review this branch; approve the merge and deploy.
2. Apply 0103; redeploy the cron Worker.
3. Postal address → sender + Reply-To → confirm the offer (Settings).
4. Get ~50 organizations in (Places key, or a CSV from a public licensure list) and research them.
5. Read **Launch review**. Approve up to 20 first emails. Turn on sending + follow-ups.
6. Work the Approvals queue and mark replies daily. When one asks for pricing or a tasting, reply
   yourself, write the proposal, confirm it, and **Convert to Contract Account**.
