# Añejo HUB — Marketing Expert: Complete System Handoff

**Purpose of this document.** Everything true about the Marketing Expert role in the Añejo HUB as of
**2026-08-11 (second revision)**, written so it can be turned into an onboarding package, a user
manual, a role scope, and a metrics sheet without anyone having to read the code.

**What changed in this revision.** Dayan ruled on the open questions and asked for more, and it all
shipped: SMS test added to her remit; a **time trace** of engaged work (still no clock-in); an
**end-of-session report** to the owner; **improvement requests** as a tracked object with a status;
**push notifications that actually reach her** (a real bug — his replies were waking nobody); **action
cards** on his alerts so a decision carries the way to make it; and her desk rebuilt as a studio.
Three authority leaks were closed. Sections 8, 10, 14 and 16 changed the most.

**Read this first:** every statement below is drawn from the shipped code, not from intent. Where
something does not exist, this document says so plainly rather than describing what it *should* do.
The section **"Known gaps — what does NOT exist"** is the most important section for planning, and
**"Decisions Dayan still owes"** lists four things nobody has ruled on yet.

**Audience:** Dayan (owner), the incoming Marketing Expert, and whatever tool builds the onboarding
package from this file.

| | |
|---|---|
| Role key (in the system) | `marketing` |
| Team key | `marketing` |
| Landing surface | `https://anejocateringco.com/hub/marketing/` |
| Shipped in | PRs #39 and #40, both merged to `main` 2026-08-11 |
| Status | **Live in production**, except two migrations (see §2.1) |

---

## 1. Purpose and scope of the role

### 1.1 What the role is for

The Marketing Expert is the **operator of the Añejo marketing system**. Dayan built the machinery;
this role runs it. Concretely, four jobs:

1. **Run it daily** — work the marketing surfaces so output is consistent rather than bursty.
2. **Test it** — open things and confirm they actually work, instead of trusting a dashboard.
3. **Report back** — tell Dayan what is broken and what should change, through a route he reads.
4. **Manage the marketing team** — the AI's training (rules and reference examples) and the team
   lead's brief.

### 1.2 What the role is NOT

This is deliberately not a second owner account. The role **cannot reach**:

- Finance, payouts, autopay, pricing, invoices, expenses, catering deposits, pay config
- The kitchen board, orders, order actions, kitchen audit
- The customer book (`customers`), data-erasure requests (`purge`)
- Staff administration (adding/editing/deactivating staff, resetting PINs)
- Driver schedule, routes, deliveries, dispatch
- The two **autonomy switches** (see §7), **affiliate payouts**, and **affiliate commission terms**
  (see §5.4)

Attempting any of these returns HTTP **403 Forbidden** from the API, and the HUB redirects her back
to her own desk. This is enforced server-side, not just hidden in the UI, and there are automated
tests that fail the build if any of it is widened by accident
(`test/ui/marketing-role.test.js`).

### 1.3 One-sentence scope statement (for a job description)

> Runs the Añejo marketing system end to end — Instagram, email campaigns, tracked links, website
> copy, content library, affiliate programme and customer messages — performs a recorded daily
> check of all of it, and reports findings and improvement requests to the owner; has no access to
> money, kitchen, customer records or staff administration.

---

## 2. Registration and setup (do this before her first day)

### 2.1 Prerequisite: apply the migrations

**Neither has been applied yet.** This is the single most important item on the list.

```bash
export CLOUDFLARE_API_TOKEN=$(cat Aether/cf-dns-token)
export CLOUDFLARE_ACCOUNT_ID=5f4657e9b2f17a109f7c0406be0c7119
npx wrangler d1 execute anejo --remote --file=migrations/0089_marketing_desk.sql
npx wrangler d1 execute anejo --remote --file=migrations/0090_marketing_desk_ops.sql
```

Verify all four tables:

```bash
npx wrangler d1 execute anejo --remote --command="SELECT name FROM sqlite_master WHERE name IN \
  ('marketing_daily_runs','marketing_sessions','improvement_requests','partner_applications');"
```

⚠️ **The failure mode here is silent, which is why it matters.** The code catches the missing
tables rather than erroring, so the desk *looks* fine — it opens, the checks render, the buttons
respond. Nothing persists. Her first day would leave no trace at all.

Without them: the daily run, the time trace and the requests board all record nothing. With them,
everything in this document works.

**Note — two files are numbered `0090`.** `0090_marketing_desk_ops.sql` (this role) and
`0090_partner_application_decisions.sql` (the affiliate auto-flow, built in parallel by another
session). Both apply cleanly because they are run by explicit filename, and neither touches the
other's tables. Apply the partner one too if it has not been:
`npx wrangler d1 execute anejo --remote --file=migrations/0090_partner_application_decisions.sql`

### 2.2 Create her account

1. Sign in as owner → **Staff** (in the ⋯ More sheet) → **+ Add staff member**
2. Fill in:
   - **Full name**
   - **Phone** — this is what she signs in with. Use the number she actually carries.
   - **Email** (optional but recommended — it triggers the welcome email)
   - **Role**: `marketing`
   - **Team**: `marketing`
   - **Team lead**: ✅ **tick this** (see §2.3 for why)
   - **Initial PIN**: leave blank to have one generated
3. Press **Add staff**.
4. **The PIN is shown ONCE, on screen, and never again.** Copy it and give it to her in person or by
   voice. It is deliberately not sent by email or SMS.

### 2.3 Why "Team lead" must be ticked

`visibilityScope()` in `functions/_lib/roles.js` grants:

- `owner` → everything
- **a team lead → their whole team's records**
- everyone else → only their own records

Without the lead flag she is scoped to *herself* and several team-oriented screens read as empty.
Tick it.

### 2.4 What the system sends automatically

| Trigger | Channel | Content | Contains PIN? |
|---|---|---|---|
| Staff created with a phone | SMS (Twilio) | "Welcome to the team! Sign in at anejocateringco.com/login…" | **No** |
| Staff created with an email | Email (Resend) | Welcome, names her role and team, links to `/login` | **No** |

Both are best-effort: if Twilio/Resend is not configured the account is still created and the API
reports the failure rather than silently swallowing it.

### 2.5 Her first sign-in

1. Go to **anejocateringco.com/login**
2. Enter her **phone number** → the system detects she is staff and asks for a PIN
3. Enter the **one-time PIN** Dayan gave her
4. She is forced to **set her own PIN** immediately (`must_change_pin`)
5. She lands on **/hub/marketing/** — her desk

### 2.6 Install it as an app (recommended)

The HUB is a PWA. On iPhone: Safari → Share → **Add to Home Screen**. It then opens full-screen with
no browser chrome, which is how the bottom nav is designed to be used. Push notifications require
this install on iOS.

### 2.7 Language

Everything she touches is bilingual EN/ES. The **EN/ES toggle** is in the top-right of every HUB
page and the choice persists across sessions and pages. Her tutorial and printed quick card both
have full Spanish. Her role appears as `marketing` in both languages (the word is the same).

### 2.8 Onboarding checklist (day one)

- [ ] **Both migrations applied (§2.1)** — nothing records without them
- [ ] Account created, role `marketing`, team `marketing`, **Team lead ticked**
- [ ] PIN handed over in person
- [ ] She has signed in and set her own PIN
- [ ] HUB installed to her home screen
- [ ] Language set to her preference
- [ ] She has completed the **tutorial** at `/hub/training?role=marketing`
- [ ] She has the **printed quick card** from `/hub/training-card.html?role=marketing`
- [ ] Push notifications enabled (Account → Enable notifications) — she now receives his replies
      and her own alerts, so this is no longer optional decoration
- [ ] Dayan has confirmed her training completion on **Training compliance**
- [ ] Decisions in §16 answered

---

## 3. Her surface: the tile-by-tile map

### 3.1 Her bottom bar

Five primary tabs plus **⋯ More**. This bar appears on her own desk *and* on the owner pages she
shares, so the app never shows her a tab she cannot open.

| Slot | Tab | Destination | What it is |
|---|---|---|---|
| 1 | ◎ **Today** | `/hub/marketing/` | Her desk — the daily run + her line to Dayan |
| 2 | 📈 **Marketing** | `/hub/owner/marketing.html` | The marketing workspace (3 tabs) |
| 3 | 📣 **Affiliate** | `/hub/owner/partners.html` | Affiliate programme + discount codes |
| 4 | 📢 **Site copy** | `/hub/owner/site-copy.html` | Banners and legal text on the public site |
| 5 | 💬 **Comms** | `/hub/comms.html` | Messages — her line to Dayan and to the team |
| ⋯ | **More** | — | The eight below |

Behind **⋯ More**:

| Tile | Destination | What it is |
|---|---|---|
| ⚙️ Marketing settings | `/hub/owner/marketing-settings.html` | Cadence, posting times, image providers, market intel |
| 📲 SMS test | `/hub/owner/sms-test.html` | Send a test SMS — added to her remit 2026-08-11 |
| 📚 Content | `/hub/owner/content.html` | Document library + Creative Studio briefs |
| 📈 Traffic | `/hub/owner/traffic.html` | First-party website analytics |
| 🧭 Adoption | `/hub/owner/adoption.html` | Is the team actually using the HUB |
| 🎨 Studio | `/studio/` | Creative Studio (image generation) |
| 🎓 Training | `/hub/training?role=marketing` | Her own tutorial, re-runnable any time |
| 👤 Account | `/hub/account.html` | Change PIN, notifications, sign out |
| 🔒 My data | `/hub/my-activity.html` | Everything the system has logged about her |

### 3.2 Today — her desk, "the Studio" (`/hub/marketing/`)

Rebuilt 2026-08-11 as a studio rather than a dashboard. Dayan's framing: *"this is the HEART of the
company... it produces every emotion and experience we want our face to show."* A checklist that
looks like a form does not put anyone in the frame of mind to make the brand's face.

Top to bottom:

1. **The stage** — a dark editorial band: "Our face to the world." Sets what the surface is for.
2. **The live session strip** — engaged time worked today, a pulsing dot while the session is live,
   and the **End session & report** button (§10).
3. **Today's run** — the seven checks (§4) with a gold progress rail. A row dims when answered
   `ok` and picks up a red wash when answered `issue`, so the state of the run is legible without
   reading it.
4. **Close the run** — a note field for Dayan and the close button.
5. **Tell the owner** — her direct feedback route (§8.1).
6. **Requests to Dayan** — the improvement-request board (§8.2), with every request's status and
   his reason on it.
7. **Last two weeks** — a strip of the last 14 runs; green = clean, red = had issues, with the
   issue count. Hovering a chip shows that day's note.

Every colour is an existing Añejo brand token — the studio is a different *arrangement* of the
palette, never a second palette. All motion is disabled under `prefers-reduced-motion`.

### 3.3 Marketing workspace (`/hub/owner/marketing.html`)

One page, three tabs, hash-routed so links work:

**Tab: Today** — the cockpit
- **AI budget** for the week — a **hard $50/week ceiling** on model spend. At the limit, every AI
  feature waits for the new week; nothing borrows ahead. (`functions/_lib/ai_budget.js`)
- **Tracked links** — each `/l/` short link with 7-day and 30-day clicks and attributed orders
- **Aña's tray** — pending Instagram DMs/comments and AI-drafted replies awaiting a human
- Performance alerts and the trust ledger state

**Tab: Teach** (`#teach`) — how the AI learns
- **Team Lead** — the standing brief the AI works from; it opens with how the last round went
- **Train the team** — two inputs that ground every AI marketing prompt at runtime:
  - **Training rules** — plain-language guidance ("always show food in the first slide")
  - **Training examples** — a reference photo plus a note ("this is the look I want" / "never do
    this"); the image lives in R2, the note in the database
- Both are rendered into prompt-ready text under a hard character budget, so the library can grow
  without silently blowing the prompt window or dropping the newest guidance.

**Tab: Create & schedule** (`#create-instagram`, `#create-email`)
- **Instagram** — draft, generate covers, schedule, publish; the carousel/photo pipeline
- **Email campaigns** — compose, preview, test-send, schedule, send in resumable batches

### 3.4 Affiliate (`/hub/owner/partners.html`)

- **Onboard** a partner
- **Approve or decline an application in one tap** — the auto-flow (added 2026-08-11 alongside this
  role) sends an instant confirmation on application, and the approve/decline decision goes out as
  a warm email without retyping anything
- **Create discount codes** — three kinds: `campaign` (shareable, optional limits), `customer`,
  `affiliate`
- **Activate/deactivate** a code
- **Resend** a partner's welcome
- **Read** what each partner is owed
- ❌ **Cannot** set a payout method, set a commission rate, or settle what is owed — owner only
  (§5.4). She approves the *partner*; Dayan sets the *terms*.

Public application form: `/affiliate.html` → files a `partner_application` alert, which now carries
a deep-link push and one-tap approve/decline.

### 3.5 Site copy (`/hub/owner/site-copy.html`)

Edits **live text on the public website** with no deploy.

- **Named slots**, each holding a **queue** of entries so several can be lined up in advance
- **Tone**: Neutral (dark green) / Good news (green) / Urgent (red)
- **Placement**: bar across the top of every page, or a once-only modal
- **Scheduling**: optional start and end datetime; no dates = on until switched off
- Distinguishes **"switched on"** from **"showing right now"** — with a queue and schedules those
  are different questions
- Also holds the **legal blocks**
- A **"restore the shipped page"** action reverts to what was deployed

⚠️ Changes here are **live to customers immediately** — no approval step, no undo history. Dayan
 confirmed this is intended (§16.1 D2).

### 3.6 Marketing settings (`/hub/owner/marketing-settings.html`)

Four things that previously required a developer:

1. **Feed & Stories cadence** — new feed posts per week the planner tops up to. The page carries the
   2026 research: 3–5/week is the sweet spot; average reach *per post* falls above ~5/week.
   ⚠️ The **Stories** numbers are **recorded, not automated** — nothing in the product drafts or
   posts a Story today. Changing them causes no Story to be posted.
2. **Posting times** — default hour(s) ET per weekday. Must be 8–19. Research embedded in the page:
   the 11:00–13:00 ET lunch-decision window is strongest; 17:00–19:00 ET secondary; Friday
   out-performs; Tue–Thu strong; weekends weakest for feed reach.
3. **Plate image providers** — the ordered chain the Creative Studio tries. First success wins. A
   provider with no API key is skipped regardless of rank.
4. **Market intelligence** — a standing local-competitor sweep, a recurring Instagram platform
   pulse, and questions she files herself. **Every answer cites its source URLs**, so nothing there
   is an unverifiable opinion.

Takes effect on the **next** planner run (weekly Sunday tick or a manual re-run); saving does not
itself re-run the planner.

### 3.7 Content, Traffic, Adoption, Studio

- **Content** — the document library (brand brief, manuals, policies, procedures, recipes, content
  briefs, legal) with per-role scoping, plus Creative Studio briefs built from **real** 4–5★
  post-delivery reviews. Never fabricated testimonials.
- **Traffic** — first-party analytics from `page_views`. Customer-facing question.
- **Adoption** — is the *team* using the HUB, and are EOD reports being filed. Staff-facing
  question. Every query filters `actor_type='human'` so automation cannot make adoption look
  healthy while nobody logged in.
- **Studio** — Creative Studio image generation, shared with the kitchen role.

---

## 4. The daily run — how "consistent output" is made auditable

### 4.1 The seven checks

Defined in `functions/_lib/marketing_run.js`. Each links to the surface that answers it.

| # | Key | Check | What "working" means |
|---|---|---|---|
| 1 | `inbox` | Instagram inbox answered | Every DM and comment from yesterday has a reply or a deliberate skip |
| 2 | `drafts` | Drafts moved | Nothing approved is still unscheduled; nothing scheduled has silently failed |
| 3 | `campaigns` | Email campaigns on track | Due sends went out; queued ones still read right |
| 4 | `links` | Tracked links resolving | Open each `/l/` link in the bio — a dead redirect is a day of traffic lost |
| 5 | `site` | Site copy correct | Banners and legal say what they should; nothing expired still showing |
| 6 | `affiliates` | Affiliates handled | New applications reviewed; nobody approved is waiting on their link |
| 7 | `traffic` | Yesterday's numbers read | Traffic and attribution checked against what we published |

### 4.2 The three answers

| Button | Value | Means |
|---|---|---|
| ✓ | `ok` | Checked, working |
| ! | `issue` | Checked, something is wrong |
| – | `skip` | Deliberately not today |

### 4.3 Rules the system enforces

- **A run cannot be closed with a check left blank.** "Not today" is an answer; silence is not.
  That is the difference between "we looked and it was fine" and "nobody looked."
- **Opening the page never creates a run.** A GET does not write. If it did, Dayan glancing at her
  desk would make "was it checked today" answer yes.
- **One run per calendar day** (America/New_York), enforced by a unique index.
- Unknown check keys and unknown results are refused, not stored.
- Taps are optimistic — the button flips immediately and is corrected by the server's answer, so a
  seven-tap routine does not wait on seven round-trips.

### 4.4 What Dayan gets from a closed run

| Outcome | What happens |
|---|---|
| Closed with **0 issues** | Nothing. Silence means the day was clean. |
| Closed with **≥1 issue** | A **warning alert** on his overview: "N issues on today's marketing run", carrying her note |

This asymmetry is the design: alerts stay meaningful because a green day does not generate one.

---

## 5. Complete permission matrix

### 5.1 How permission actually works

Two layers, both real:

1. **Server** — every endpoint calls `requireRole(request, env, <allowed>)`. Not signed in → **401**.
   Wrong role → **403**. Staff sessions are re-checked against `staff.active` on every request, so
   deactivating her kills access immediately rather than at session expiry.
2. **Client** — `Hub.guard()` redirects her away from a page she cannot open, so she never sees a
   screen that would only 403.

The constant `MARKETING_DESK = ['owner', 'marketing']` is what admits her. The owner is in every one
of her lists — he can always see and do what she can.

### 5.2 Full API access table

| Surface | Endpoint | Her access |
|---|---|---|
| Marketing team brief | `/api/hub/owner/team` | ✅ Read + write |
| AI training rules/examples | `/api/hub/owner/team-training` (+ `-upload`) | ✅ Read + write |
| Instagram posts | `/api/hub/owner/social` (+ `-upload`, `-cleanup`, `-drill`) | ✅ Read + write |
| Instagram inbox | `/api/hub/owner/social-inbox` | ✅ Read + write |
| Posting cadence | `/api/hub/owner/social-cadence-config` | ✅ Read + write |
| Posting times | `/api/hub/owner/social-posting-times` | ✅ Read + write |
| Email campaigns | `/api/hub/owner/campaigns` | ✅ Read + write (**incl. send** — §16 D1) |
| Tracked links | `/api/hub/owner/links` | ✅ Read + write |
| Attribution | `/api/hub/owner/marketing-attribution` | ✅ Read |
| Performance alerts | `/api/hub/owner/performance-alerts` | ✅ Read |
| Site copy | `/api/hub/owner/site-copy` | ✅ Read + write (**live** — §16 D2) |
| SMS test | `/api/hub/owner/sms-test` | ✅ Full — added 2026-08-11 |
| Content library | `/api/hub/owner/content` | ✅ Read + write |
| Affiliates | `/api/hub/owner/partners` | ✅ Except payouts (§5.4) |
| Traffic | `/api/hub/owner/traffic` | ✅ Read |
| Adoption | `/api/hub/owner/adoption` | ✅ Read |
| Trust ledger | `/api/hub/owner/trust` | 👁️ **Read only** (§7) |
| Aña auto-reply mode | `/api/hub/owner/social-autoreply` | 👁️ **Read only** (§7) |
| Messages | `/api/hub/comms/*` | ✅ Full, scoped to her threads |
| Push notifications | `/api/hub/push/*` | ✅ Full |
| Her own training | `/api/hub/training/complete` | ✅ Full |
| Her daily run | `/api/hub/marketing/run` | ✅ Full |
| Her session / time trace | `/api/hub/marketing/session` | ✅ Full |
| Improvement requests | `/api/hub/marketing/requests` | ✅ File + read. **Deciding is owner-only** |
| Her own activity log | `/api/hub/me/activity` | ✅ Read |
| **Finance / payouts / autopay / pricing / invoices / expenses** | various | ❌ **403** |
| **Kitchen / orders / order actions / kitchen audit** | various | ❌ **403** |
| **Customers / purge (erasure)** | various | ❌ **403** |
| **Staff administration** | `/api/hub/owner/staff` | ❌ **403** |
| **Training compliance (everyone's)** | `/api/hub/owner/training-status` | ❌ **403** |
| **Who's on shift** | `/api/hub/owner/staff-status` | ❌ **403** |

### 5.3 Where the boundary is machine-enforced

`test/ui/marketing-role.test.js` fails the build if any of the ❌ rows gains marketing access, if
her nav ever links to finance/kitchen/customers/staff/orders, or if the two autonomy switches or the
payout ops are widened. This is not documentation-only.

### 5.4 The affiliate money carve-out

`partners.js` is hers **except** the parts that decide money:

- `set_payout` — how a partner is paid (cash or credit) → **403 for her**
- `mark_paid` — settling everything a partner is owed → **403 for her**
- `commission_pct` / `payout_method` **anywhere they are accepted** — including on `onboard` and on
  the one-tap `approve_application` — are ignored for anyone who is not the owner and fall back to
  the house default (10%, cash).

`mark_paid` moves real money. It is already double-gated (the payouts switch must be on, and the
exact total must carry an unused approval), but those safeties answer *"was this amount approved"*,
not *"may this person spend"* — so the role check is separate and explicit.

**Why the third bullet exists.** The one-tap approve/decline flow was built in parallel by another
session and lands *before* the payout guard in the same handler, and it accepts a commission rate.
That is `set_payout` by another name: without the fallback, "she handles affiliates" would quietly
have included signing one at 50%. She keeps the **act** — approve, decline, onboard; Dayan keeps
the **numbers**. Pinned by a test, because the two features are maintained independently and this
will drift again otherwise.

---

## 6. Communication — every channel, in both directions

### 6.1 The six routes

| # | Route | Her → Dayan | Dayan → Her | Best for |
|---|---|---|---|---|
| 1 | **Tell the owner** (Today) | ✅ | — | A finding: something is wrong, right now |
| 2 | **Requests to Dayan** (Today) | ✅ | ✅ | A change to the system. Tracked until he decides |
| 3 | **End-of-session report** | ✅ | — | What she did, obstacles, good/bad news, feedback |
| 4 | **Daily run note** | ✅ | — | The day's one-line summary, attached to the run |
| 5 | **Comms / Messages** | ✅ | ✅ | Two-way conversation, questions, direction |
| 6 | **Push notification** | ✅ | ✅ | Waking either device — now genuinely both ways |

### 6.2 Comms is genuinely two-way

`/hub/comms.html`. The behaviour that matters:

- **A non-owner staffer's new thread is automatically routed to the first active owner.** She does
  not need to pick a recipient — anything she starts reaches Dayan.
- **Dayan** can start a thread with any active staff member, or send a `broadcast` to everyone.
- **Her visibility** is scoped to threads where she is the subject, threads she created, and
  broadcasts. She cannot read other people's conversations.
- **Unread counts** per thread and a total, based on a read watermark.
- Threads have a lifecycle: **open** (the default inbox view) / **closed**.
- Channels: `in_app`, `sms`, `whatsapp` — SMS/WhatsApp delivery is no-op-safe when Twilio is not
  configured.

### 6.3 Push notifications

Web push, payload-less "tickle" — the notification wakes the app, which then fetches the context.
No message content ever rides in the push payload.

- She enables it herself: **Account → Enable notifications** (requires the PWA install on iOS)
- Fan-out targets staff IDs, roles, or emails

**Fixed 2026-08-11 — a real bug, not a missing feature.** When a staffer opens a thread, the routing
sets `staff_id` to the **owner** (staff always reach the front office) and `created_by` to the
staffer. The push logic then asked "is `staff_id` someone other than the sender?" — no, on his reply
it is him — and fell through to "is the sender not the owner?" — also no. **Both branches missed and
nobody was woken.** She was never told she had an answer, on any thread she started. It now targets
the other *participant* rather than guessing by role.

**She now also receives**, on her own device:
- Instagram performance signals (soft post, weak run, follower trend, silence)
- A high-confidence commercial DM captured as a lead
- A trust lane reaching eligibility (it is her streak)

Alerts carry an opt-in `notifyRoles`, so this is per-alert rather than "wake the whole roster" —
the owner is always included and extras never replace him.

---

## 7. "Dayan always approves" — how it is actually implemented

This is not one switch. It is four distinct mechanisms.

### 7.1 Mechanism 1 — per-item human action

No marketing content reaches the public on a timer alone. Instagram posts move through explicit
states — `draft` → `scheduled` → `publishing` → `published` — and each transition is a person
pressing something. Email campaigns must be composed, previewed, and sent.

**What this means in practice:** she is the human doing the tapping for day-to-day marketing. This
is per-item authority, not autonomy — but it is *her* tap, not Dayan's, and he confirmed that is
intended (§16.1 D1).

### 7.2 Mechanism 2 — the trust ledger (earned autonomy)

Five lanes: `menu`, `macro_portal`, `catering`, `brand_story`, `promo`.

- Each lane counts **consecutive clean approvals** — drafts approved without being edited
- At **5 clean in a row** the lane becomes *eligible* for auto-publish
- **Only Dayan can flip the switch.** Eligibility is earned; autonomy is granted.
- The eligibility check lives inside the SQL UPDATE, so a stale page cannot re-enable a lane whose
  streak reset a minute ago
- **Turning autonomy OFF is unconditional and always available** — taking it away must never have
  preconditions

**She can see the ledger; she cannot flip it.** A role whose output is the thing being approved
cannot be the role that decides approval is no longer needed.

**The lane now announces itself (2026-08-11).** The moment a lane earns its fifth clean approval it
raises a `trust_lane_eligible` alert — push to his phone, plus an **action card** carrying a button
straight to the switch. He cannot flip a switch nobody told him about, and a lane could otherwise
sit at the bar indefinitely because nobody mentioned it. Deduped per lane: eligibility is a *state*,
not an event, so re-announcing it on every further approval would train him to ignore the one alert
that asks him for a decision. She is notified too — it is her streak, and she is the one who will
ask him about it.

### 7.3 Mechanism 3 — Aña's auto-reply mode

Aña (the AI) drafts replies to Instagram DMs and comments. Whether those go out without a human is
one setting: `off` / `dm` / `comment` / `both`. **Absence of the setting means OFF** — the code
default is draft-only, so a missing row can never mean "loose."

**Owner-only to change. She reads it, she works the draft tray.**

### 7.4 Mechanism 4 — the money safeties

Anything that moves money requires **both**: the relevant payouts switch ON, **and** the exact
amount carrying an unused approval. Refusals leave rows pending and are recorded in
`money_movements`. She is outside this system entirely by role (§5.4).

### 7.5 Summary table

| Decision | Who |
|---|---|
| Draft, edit, schedule an Instagram post | **Her** |
| Publish an Instagram post | **Her** |
| Compose, preview, schedule an email campaign | **Her** |
| Send an email campaign | **Her** (§16 D1) |
| Change site copy on the live site | **Her** (§16 D2) |
| Onboard an affiliate, mint a code | **Her** |
| Change cadence, posting times, image providers | **Her** |
| **Enable auto-publish for a lane** | **Dayan only** |
| **Turn Aña's auto-reply on/off** | **Dayan only** |
| Approve or decline an affiliate application | **Her** |
| **Set a partner's commission rate or payout method** | **Dayan only** |
| **Settle what a partner is owed** | **Dayan only** |
| **Decide an improvement request** | **Dayan only** |
| Anything touching finance, kitchen, customers, staff | **Dayan only** |

---

## 8. Her routes to Dayan, in detail

### 8.1 Direct feedback — "Tell the owner"

On her desk. Three fields:

| Field | Notes |
|---|---|
| **Title** | Required. Max 160 chars. What she found. |
| **Detail** | Optional. Max 2000 chars. What she thinks we should change. |
| **"This is costing us output today"** | Checkbox → severity `warning` instead of `info` |

**Where it lands:** an alert of type `marketing_feedback` on **Dayan's overview alerts feed** — the
same feed he reads every morning. Not a separate inbox he has to remember to open.

**Deliberately not deduplicated** — two findings on the same day are two things he needs to know,
not a repeat.

**Guidance for her:** send it when she finds it. Do not save it up for the run close.

### 8.2 System improvement / update requests — the Requests board

**Built 2026-08-11.** This used to share the alert feed with findings; it no longer does, because
they are different objects with different lifetimes.

> A finding ("the bio link is dead") is read once, acted on, acknowledged — an alert is exactly
> right. A request ("we should be able to schedule Stories") has no natural end: it is open until
> somebody decides, and the person who filed it needs to see **that** it was decided. Sharing the
> alert feed meant every request was acknowledged into silence, which teaches the person filing
> them to stop.

**On her desk**, under **Requests to Dayan**:

| Field | Notes |
|---|---|
| **Kind** | `Improvement` · `Bug` · `Question` |
| **Title** | Required, max 160 chars |
| **Why it matters** | Optional, max 4000 chars |

**The lifecycle**, which only Dayan can move:

| Status | Meaning |
|---|---|
| `open` | He has not decided. It stays on the board. |
| `accepted` | He wants it. |
| `declined` | He does not — **with a reason, shown back to her verbatim** |
| `shipped` | It exists now. |

**Declining is a first-class outcome.** A decided request is a served request; the failure mode this
route exists to prevent is the *unanswered* one.

**How he decides:** the board renders Accept / Decline / Shipped buttons **only for him**, and the
filing alert carries an action card straight to it. She files and reads; she cannot decide her own
request, or the status would mean nothing.

**Guidance for her:** use *Tell the owner* when something is broken today; use *Requests* when the
system itself should change. If in doubt, a request is safer — it will not get lost.

---

### 8.3 The end-of-session report

**Built 2026-08-11**, at Dayan's request: *"an update report at the end of her session... the works
she did, the obstacles she ran into, any good news and bad news... feedback is very important and it
also gives a sense of accountability."*

She taps **End session & report** on the studio's session strip. Five named questions:

1. **What you got done**
2. **What got in the way**
3. **Good news**
4. **Bad news**
5. **Feedback**

Five fields rather than one box on purpose: *a person asked five specific things answers five; a
person given a blank field writes "all good".* Anything left blank is simply omitted.

**What Dayan gets:** an alert titled `Marketing update — N min worked`, carrying the answers and the
**engaged minutes from the time trace** (§10), plus a push. Severity is `info` normally and
**`warning` when the report carries bad news**, so the feed's colour says which reports need him
today.

Submitting closes the session. There is no reopen — the next sitting starts a new one.

---

## 9. How Dayan monitors her work and her results

### 9.1 Daily — 30 seconds

1. Open `/hub/owner/` — **Alerts**. Hers are `marketing_feedback` (a finding),
   `marketing_session_report` (her end-of-session update, with minutes worked),
   `improvement_request` (a request awaiting his decision) and `trust_lane_eligible` (a switch
   waiting on him). **Each carries a button to the place the decision is made** — see §9.8.
2. Open `/hub/marketing/` — he has full access; the session strip shows time worked today and the
   **Last two weeks** strip shows whether runs are being closed and whether they are clean.

He does not have to go looking: everything above also pushes to his phone.

### 9.2 The run record itself

`marketing_daily_runs`, one row per day: which checks were answered and how, the issue count, her
note, and the timestamp it was closed. This is the audit trail for "was the system checked."

### 9.3 Activity log

Every meaningful action writes to `activity_log` with actor, role, team and timestamp. Her events
include `marketing.run_submitted`, `marketing.feedback_filed`, `dashboard.viewed`, plus every
content action. Visible on the owner overview **Activity** feed.

### 9.4 Adoption screen

`/hub/owner/adoption.html` — is the team actually using the HUB. Filters to `actor_type='human'`
throughout, so automation cannot inflate it.

### 9.5 Training compliance

`/hub/owner/training-status.html` — every active staffer and whether they completed their role's
tutorial, with the timestamp and the language they took it in. Her marketing module appears here.
**Owner-only** — she cannot see her own compliance row from that screen.

### 9.5b Time worked

`marketing_sessions` records every sitting: when it started, when it ended, and **engaged seconds**.
See §10 for why that number is trustworthy. Visible on her desk (today's total, live) and carried
on every end-of-session report.

### 9.5c Session reports and the requests board

- Every **end-of-session report** is an alert and a row — the answers are kept, not just announced.
- The **requests board** shows every request and its status. An `open` count that grows week over
  week is the clearest early signal that he has stopped deciding, which is the failure this route
  was built to prevent.

### 9.6 Result metrics she is accountable for

All available to both of them:

| Metric | Where | What it answers |
|---|---|---|
| Clicks per tracked link, 7d / 30d | Marketing → Today | Is the bio link working |
| **Orders attributed per campaign** | Marketing → Today | Did it produce revenue |
| Page views, sessions | Traffic | Is the site getting traffic |
| Per-post Instagram metrics | Marketing → Today | What is landing |
| Follower trend, weak-run / silence signals | Performance alerts | Is the account healthy |
| Campaign recipients, sends, failures | Marketing → Create → Email | Did the send work |
| Trust streak per lane | Trust ledger | Is draft quality improving |
| AI spend vs $50/week | Marketing → Today | Are we inside budget |

**Note on attribution:** orders are attributed **by campaign tag**, and only **paid** orders count —
pending checkouts do not. This is the honest number.

### 9.7 Suggested review cadence

| When | What |
|---|---|
| Daily (2 min) | Alerts + did yesterday's run close + any session report |
| Weekly (20 min) | Two-week strip, time worked, open requests, tracked-link clicks → attributed orders, trust streaks, AI spend |
| Monthly (45 min) | Traffic trend, campaign performance, affiliate growth, cadence adjustments |

### 9.8 Action cards — alerts that carry their own next step

**Built 2026-08-11.** An alert that *asks* him for something now renders a button to the place the
thing is done. Acknowledging "this lane earned auto-publish" with no route to the switch is how a
decision sits unmade for a month — he reads it on his phone, means to act, and the card is gone.

| Alert | Button goes to |
|---|---|
| `trust_lane_eligible` | The trust cockpit — the switch itself |
| `improvement_request` | The requests board, to decide it |
| `marketing_session_report` / `marketing_feedback` | Her studio |
| `social_commercial_lead` | The lead |
| `partner_application` | The application, for one-tap approve/decline |
| `marketing_review_ready` | The Instagram queue — **registered but nothing raises it yet, see §14** |

Alerts with no real next action stay Ack-only, deliberately: if every card had a button, a button
would stop meaning anything.

---

## 10. Time tracking — a trace, not a timeclock

### 10.1 There is still no clock-in, and that is deliberate

Dayan's ruling: *"i don't need her to clock in or out but I do need a time log or time trace of her
activity and time actively working in the hub."*

The kitchen/driver timeclock (`shifts`) is the wrong shape for this role — it is a shift a person
starts and ends, tied to hourly food ops, and it drives lateness tracking and the "On shift now"
roster. **She has no clock-in button, writes no shift row, and will never appear in "On shift
now."** She is not on payroll (§16 D5).

### 10.2 What exists instead — the engaged-time trace

**Built 2026-08-11.** A session opens **by itself** the first time she touches the desk and is kept
alive by a heartbeat every 60 seconds. She never starts or stops anything; the only deliberate act
is ending it with a report.

### 10.3 Why the number is trustworthy — read this before quoting it

The recorded figure is **engaged seconds accrued per heartbeat**, not `ended_at - started_at`.
That distinction is the whole point:

| Situation | Wall clock would say | What is recorded |
|---|---|---|
| 90 min of steady work | 90 min | **90 min** |
| Tab open through a 2-hour lunch | +120 min | **0 for the gap** |
| Laptop left open overnight | ~10 hours | **0** |
| Phone locked mid-session | counts | **0 for the gap** |

Three rules make that true:

1. **A gap wider than 5 minutes contributes zero.** A heartbeat further apart than that is treated
   as her having walked away.
2. **The client stops beating on a hidden tab.** A backgrounded tab cannot hold a session open.
3. **A session silent for 30 minutes is closed where it stopped, not where we noticed.** Its
   `ended_at` is the last heartbeat, so nothing is invented after the fact.

This is verified by executed tests, not by reading the code: `test/marketing/session-time.test.js`
simulates a working day with a two-hour lunch and asserts **135 minutes, not 255**.

### 10.4 What it does NOT do

- ❌ It is not payroll-grade and is not meant to be. It measures HUB engagement, not work done
  away from the HUB (a shoot, a call, editing in Canva).
- ❌ It cannot tell focused work from an idle-but-moving tab within the 5-minute window.
- ❌ No lateness, no schedule, no expected hours — the system has no opinion about when she works.

**How to read it:** as evidence of engagement and a trend line, not as a timesheet. "She closed a
run every weekday and logged 40–60 minutes a day" is the question it answers well.

### 10.5 There is still no EOD report for this role

`/api/hub/kitchen/eod/submit` and `/api/hub/driver/eod/submit` are role-specific. **The
end-of-session report (§8.3) is her EOD**, and it is richer: it carries the time worked and asks
five questions instead of a form.

---

## 11. Best practices

### 11.1 For her

1. **Run the check first, answer second.** Tap "Open it" and look. A dashboard saying green is a
   claim; opening the thing is the evidence. Every dead redirect ever shipped looked fine on a
   summary screen.
2. **Use "not today" honestly.** It is a real answer and it costs nothing. Leaving a check blank
   just means the run cannot close.
3. **Send findings immediately.** Do not batch them into the close note.
4. **Never close a run she did not do.** A clean run sends no alert — so silence has to mean the day
   was clean, or the whole signal is worthless.
5. **Check the AI budget before a heavy generation day.** $50/week is hard; at the ceiling every AI
   feature waits for the new week.
6. **Test a campaign to herself before sending.** The test-recipients feature exists for this.
7. **Watch the reach-per-post curve.** Above ~5 feed posts/week, average reach per post falls.
8. **Teach the AI when she corrects it.** A correction made only in the draft is lost; the same
   correction as a training rule or example changes every future draft.
9. **End the session with a report, every time.** It is the only thing that turns a day of work
   into something Dayan can see. Two honest lines beat a polished paragraph written weekly.
10. **Say the bad news.** It is a named field because it is the most valuable one — and it is what
    changes the report's severity so he actually looks today.
11. **Use Requests for anything structural.** A finding is read once; a request stays on the board
    until he decides. If it should change the system, file it as a request.

### 11.2 For Dayan

1. **Read the alert feed daily.** It is the route he told her to use; not reading it teaches her to
   text instead, and then there is no record.
2. **Do not grant auto-publish early.** Five clean approvals is the bar because it is evidence.
3. **Answer improvement requests, even with "no".** An unanswered request becomes an unasked one.
4. **Review the two-week strip weekly, not the individual runs.** The pattern is the signal.
5. **Decide requests, do not let them queue.** A growing `open` count is the clearest sign the
   route has stopped working, and declining with a reason costs thirty seconds.
6. **Read the session reports rather than the time number.** The minutes are context; the five
   answers are the content.
7. **Revisit the §16 decisions after two weeks** of watching how she actually works.

### 11.3 Her optimal daily routine (~30–45 min)

| Time | Action |
|---|---|
| Open | Open the studio — the session starts itself. Read yesterday's numbers and overnight alerts |
| 1 | Instagram inbox — clear DMs and comments (check 1) |
| 2 | Drafts — move anything approved onto the schedule (check 2) |
| 3 | Campaigns — confirm due sends went, queued ones read right (check 3) |
| 4 | Tracked links — open each one (check 4) |
| 5 | Site copy — confirm nothing expired is still showing (check 5) |
| 6 | Affiliates — new applications, pending links (check 6) |
| 7 | Traffic — yesterday against what we published (check 7) |
| — | Anything found → **Tell the owner** immediately. Anything structural → **file a request** |
| Close | Write the run note, close the run |
| End | **End session & report** — the five questions. This is what Dayan actually reads |

### 11.4 Weekly (beyond the daily run)

- Review the trust ledger — which lanes are approaching eligibility
- Review cadence and posting times against the last two weeks' reach
- File a market-intelligence question if a competitor moved
- Add at least one training rule or example from something corrected that week
- Review the AI budget burn rate

---

## 12. FAQ

**Q: Can she see how much money the business makes?**
No. Finance, payouts, invoices and pricing all return 403. She sees *orders attributed to a
campaign* — a count, in the marketing context — not revenue, margins or the books.

**Q: Can she see customer names, emails or addresses?**
Not through the customer book — `customers` is blocked. She *does* see Instagram handles in the
inbox and email addresses in campaign audiences, because that is what the work is. She cannot browse
the customer database.

**Q: Can she add or remove staff?**
No. Staff administration is owner-only.

**Q: Can she post to Instagram without asking Dayan?**
Yes — publishing is a per-item human action and she is the human. Dayan's control is the trust
ledger and the auto-reply switch, not a per-post approval queue. If per-post owner approval is
wanted, that is a build (§16 D1).

**Q: Can she send an email campaign to the whole list without asking?**
Yes. High-stakes and irreversible, and Dayan confirmed it is intended (§16.1 D1).

**Q: What happens if she edits site copy wrongly?**
It is live immediately. There is a "restore the shipped page" action, and slots can be scheduled or
switched off. There is **no approval step and no undo history** beyond that.

**Q: How long does her session last?**
12 hours idle for staff, 30 days absolute. She re-enters her PIN after a long gap.

**Q: What if her screens are all blank?**
Almost always an expired session — an expired session empties every screen at once, which looks
exactly like a quiet day. Look for the "You have been signed out" card. This is taught explicitly in
her tutorial because it caused real operational failures for other roles.

**Q: Can two people share the marketing account?**
Technically yes, but do not. The activity log and the run record both attribute to one person, and
the value of the record is that it says who.

**Q: What if she is out sick?**
Dayan has full access to her desk and can do the run himself. The run is per-day, not per-person.

**Q: Can she undo a closed run?**
No. There is no reopen. The next day's run is a new row.

**Q: Does she get notified when Dayan replies?**
Yes, since 2026-08-11 — this was a real bug (his replies woke nobody) and it is fixed. She is also
pushed for Instagram performance signals, commercial DMs, and a trust lane reaching eligibility.
Requires the PWA install on iOS.

**Q: Is her time tracked? Does she clock in?**
No clock-in. Engaged time is traced automatically from a heartbeat while she works — see §10, and
read §10.3 before quoting the number: a tab left open overnight records zero, not ten hours.

**Q: What happens if she forgets to end her session?**
It closes itself after 30 minutes of silence, at the last heartbeat — so no time is invented. Only
the report is lost, and she can still file the update the next time she opens the desk.

**Q: Can she decide her own improvement request?**
No. She files and reads; only Dayan moves a status. Otherwise the status would mean nothing.

**Q: Can she set an affiliate's commission rate?**
No. She can approve, decline and onboard; the rate and payout method fall back to the house default
(10%, cash) unless Dayan sets them.

**Q: Is she paid commission on sales she generates?**
Not yet — it is agreed in principle (10%) but not built. See §16.2 D6. **No data is being
lost meanwhile**: order-level `utm_source`/`utm_campaign` attribution is already recorded.

**Q: Can she see other staff's messages?**
No. Her comms are scoped to her own threads plus broadcasts.

**Q: What language does the AI draft in?**
Driven by the training rules and brief she maintains, not by her UI language toggle.

---

## 13. Advanced instructions

### 13.1 Teaching the AI properly

The training system beats editing drafts, because a draft edit is lost and a rule is not.

- **Rules** are plain-language and are rendered into every marketing prompt at runtime
- **Examples** pair a reference photo with a note, flagged as "do this" or "never do this"
- Both are budget-capped so the library can grow without blowing the prompt window
- A rule is soft-deleted (`active = 0`), never row-deleted, so `created_at` stays honest

**Practice:** when she rejects or heavily edits a draft, write the reason as a rule the same day.

### 13.2 Earning autonomy on a lane

To get a lane to auto-publish: produce five consecutive drafts good enough to approve **untouched**.
Editing resets the streak — which is the point; the streak measures whether the AI can be trusted
unattended, not whether she can fix its output.

### 13.3 Campaign sending mechanics

- The audience is **frozen** at send time
- Sends run in **resumable batches** — a crash costs at most one undelivered message
- A **preview expectation**: if the audience changed between preview and send, the send refuses and
  tells her the new number. A scheduled send passes no expectation, because nobody is watching.
- `UNIQUE(campaign_id, address)` means a retry can never double-send to anyone
- The postal address and unsubscribe footer are required — the day a rushed send skips them is the
  day the sending domain burns

### 13.4 Tracked links and attribution

- Links live at `/l/<code>`; the redirector tags the visit with the campaign
- Orders attribute by `utm_campaign`, **paid only**
- The bio links are the highest-leverage thing she owns — check 4 exists because a dead redirect is
  invisible everywhere except by opening it

### 13.5 Market intelligence

Questions filed on Marketing settings are answered by a research bench that **cites its source
URLs**. Treat an uncited claim as an opinion.

---

## 14. Limitations and known constraints

| # | Limitation | Impact | Workaround |
|---|---|---|---|
| 1 | **Migrations `0089` + `0090` not applied** | Run, time trace and requests record **silently nothing** | Run §2.1 — highest priority |
| 2 | **She earns no commission yet** | The 10% is agreed but unbuilt | §16 D6. Attribution data is already being captured, so nothing is lost by waiting |
| 3 | **Google Business reviews: not built at all** | No autoreply, no live website review section, no review-sourced posts | §16 D7 — blocked on Google API access, which takes days to obtain |
| 4 | `marketing_review_ready` **has no trigger** | The alert type and action card exist; nothing raises them | By design for now: she publishes on her own tap, so nothing genuinely waits on him except trust eligibility. §16 D8 |
| 5 | Time trace is **not payroll-grade** | Measures HUB engagement only — not a shoot, a call, or editing in Canva | §10.4. Read as a trend, not a timesheet |
| 6 | **$50/week hard AI ceiling** | At the limit every AI feature waits for the new week | Plan generation early in the week |
| 7 | Stories cadence is **recorded, not automated** | Nothing drafts or posts a Story | Manual, outside the HUB |
| 8 | No per-post owner approval queue | She publishes on her own tap | §16 D1 — Dayan's explicit choice |
| 9 | Site copy is live with no approval and no undo history | A mistake is public until fixed | "Restore the shipped page"; §16 D2 — Dayan's explicit choice |
| 10 | No reopen on a closed run or a closed session | A mistake stands for the day | Use "Tell the owner" to correct |
| 11 | She cannot see her own training-compliance row | Cosmetic | Dayan can tell her |
| 12 | Bottom nav budget is **7 slots max** at 320px | New destinations go behind ⋯ More | By design |
| 13 | 12-hour idle session | Re-enter PIN after a long gap | Security, by design |
| 14 | Push requires the PWA install on iOS | No install, no notifications — and she now depends on them | §2.6, non-optional |
| 15 | Run and session are per-day / per-person-per-sitting | Two marketing seats would share a day's run | Intentional; revisit if a second seat exists |
| 16 | Two migrations both numbered `0090` | Cosmetic — they apply by filename and touch different tables | Noted in §2.1 |

### 14.1 Resolved since the first revision

Kept so the change is visible rather than silently edited away:

- ~~No clock-in, no time tracking of any kind~~ → **engaged-time trace** (§10)
- ~~No end-of-session report~~ → **five-question report to the owner** (§8.3)
- ~~No dedicated improvement-request route~~ → **the Requests board** (§8.2)
- ~~She is not push-notified when Dayan replies~~ → **fixed; it was a bug, not a gap** (§6.3)
- ~~SMS test is owner-only~~ → **hers** (§3.1)
- ~~An eligible trust lane tells nobody~~ → **alert + push + action card** (§7.2)

---

## 15. Known facts vs. unknown facts

### 15.1 Verified — read from the shipped code

- The role, its guards, its nav, its login path, and every ✅/❌ in §5
- The seven checks, the three answers, the completeness rule, one-run-per-day
- Every alert route in §6 and §9, including which ones push to whom
- The four approval mechanisms in §7, the two owner-only switches, the payout **and commission**
  carve-outs
- The time-trace arithmetic in §10.3 — executed, not inspected
  (`test/marketing/session-time.test.js`)
- The request lifecycle and that only the owner can move it
- $50/week AI ceiling; 12h/30d session policy; 5-approval trust threshold
- No clock-in, no shift row, no EOD for this role
- Full suite: **1705 passing** at the time of writing

### 15.2 Verified by the owner

- The floating bottom-nav fix, confirmed on his device (2026-08-11)

### 15.3 Unknown — nobody has measured or decided these

- **Whether the migrations have been applied.** As of writing, no.
- **How long her daily run actually takes.** The §11.3 estimate is reasoning, not measurement.
  The time trace will answer this within a week — it is the first thing to check on day 5.
- **How much time she will actually spend in the HUB per day.** Genuinely unknown; there is no
  prior. Do not set an expectation before the trace has two weeks of data.
- **Whether seven checks is the right number.** Untested against real use.
- **Whether $50/week is enough** once someone works the system daily. Historic burn was ~$0.60/week
  — that is *not* a prediction of her usage.
- **Whether she will use the routes or default to texting.** Depends almost entirely on whether
  Dayan visibly acts on what arrives — decided requests and answered reports are what make the
  routes real.
- **What her 10% is 10% *of*.** Not decided — see §16 D6. This is her pay; it should not stay open.
- **Real reach/engagement baselines** for the account. The cadence research in the product is
  general 2026 food-account research, not measured on Añejo.
- **What "good" looks like** for her KPIs — no baselines exist. §17 targets are starting points to
  be replaced after 30 days.

---

## 16. Decisions

### 16.1 Ruled on 2026-08-11

| # | Question | Ruling |
|---|---|---|
| D1 | May she send an email campaign to the full list unilaterally? | **Yes** — kept |
| D2 | Should site copy go live without approval? | **Yes** — kept |
| D3 | Should she receive push notifications? | **Yes** — built |
| D4 | Does she need a real improvement-request route? | **Yes** — built (§8.2) |
| D5 | Does she need hours tracked? | **No clock-in; a time trace instead** — built (§10). She is not on payroll |

### 16.2 Still open

**D6 — What is her 10% of, and for how long?**
Agreed in principle: every lead from social media is tracked, and where marketing produced the sale
she earns 10%. Not built, because two answers change the schema:
1. **10% of gross order value, or net of food cost?**
2. **First order only, or every order that customer ever places?** (i.e. is it a bounty or a
   lifetime rev-share)

⚠️ This is her **compensation**. It should be answered before she starts, even if the build comes
later. No data is lost meanwhile — order-level `utm_source`/`utm_campaign` attribution is already
recorded on every order, so the ledger can be computed retroactively.

**D7 — Google Business Profile reviews.**
Wanted: auto-reply to Google reviews, sync them live into the website's review section, and reuse
them as post content. Not started, and **blocked on Dayan, not on the build**: it needs Google
Business Profile API access via OAuth on the verified location. Worth requesting now — verification
takes days. Once the credential exists the pipeline is a normal build.

**D8 — Should anything actually wait for his review?**
Today nothing does: she publishes on her own tap (D1/D2), so the only thing awaiting him is trust
eligibility, which pushes. A "work ready for review" queue would mean making some of her actions
approval-gated — the opposite of D1/D2. The alert type and action card are registered and unused,
ready the moment he names something that should wait.

---

## 17. Key metrics for onboarding (starting points, not baselines)

⚠️ **No baselines exist for this account.** Replace every number below with the real one after 30
days of measurement.

### 17.1 Process metrics — is the job being done

| Metric | Source | Suggested target |
|---|---|---|
| Runs closed per week | Two-week strip | 5/5 working days |
| Checks answered per run | Run record | 7/7 (enforced) |
| **Session reports filed per week** | Alerts / `marketing_sessions` | 5/5 — one per sitting |
| **Engaged time per working day** | Session strip | ⚠️ **No baseline. Measure for two weeks before setting one** |
| Days from finding → reported | Alerts | Same day |
| **Open requests older than 7 days** | Requests board | 0 — this measures **Dayan**, not her |
| Training rules/examples added | Teach tab | ≥1/week |

### 17.2 Output metrics — is the system producing

| Metric | Source | Suggested target |
|---|---|---|
| Feed posts published/week | Marketing → Today | 3–5 (product research) |
| Instagram inbox items unanswered >24h | Inbox | 0 |
| Campaigns sent/month | Campaigns | Set with Dayan |
| Drafts approved untouched (trust streak) | Trust ledger | Rising |

### 17.3 Result metrics — is it working

| Metric | Source | Note |
|---|---|---|
| Clicks per tracked link, 7d/30d | Marketing → Today | Baseline in the first 30 days |
| **Orders attributed per campaign** | Marketing → Today | The one that matters. Paid only. |
| Site sessions | Traffic | |
| Follower trend | Performance alerts | |
| New affiliates onboarded | Affiliate | |
| AI spend vs $50/week | Marketing → Today | Stay under the ceiling |

### 17.4 First 30 days — recommended framing

Weeks 1–2 are **measurement, not performance**. Establish baselines for every §17.3 row and record
how long the daily run actually takes. Set real targets at day 30 against real numbers.

---

## 18. Reference — file map

For whoever maintains this next.

| Concern | File |
|---|---|
| Role definitions, guards, teams | `functions/_lib/roles.js` |
| The seven checks | `functions/_lib/marketing_run.js` |
| Daily run API | `functions/api/hub/marketing/run.js` |
| **Time trace + session report** | `functions/api/hub/marketing/session.js` |
| **Improvement requests** | `functions/api/hub/marketing/requests.js` |
| **Time-trace arithmetic tests** | `test/marketing/session-time.test.js` |
| **Action cards on the alert feed** | `public/hub/owner/index.html` → `actionFor()` |
| **Push targeting on a reply** | `functions/api/hub/comms/messages.js` |
| Her desk | `public/hub/marketing/index.html` |
| Her desk helpers | `public/hub/marketing/assets/marketing.js` |
| Her nav definition | `public/hub/assets/hub.js` → `NAVS.marketing` |
| Shared-page role handling | `public/hub/owner/assets/owner.js` → `Owner.init` |
| Alerts (her feedback route) | `functions/_lib/alerts.js` |
| Trust ledger | `functions/_lib/trust_ledger.js`, `functions/api/hub/owner/trust.js` |
| AI budget ceiling | `functions/_lib/ai_budget.js` |
| Schema | `migrations/0089_marketing_desk.sql`, `migrations/0090_marketing_desk_ops.sql` |
| Her tutorial | `public/hub/training.html` → `marketing:` |
| Her quick card | `public/hub/training-card.html` → `marketing:` |
| Spanish strings | `public/hub/assets/hub-i18n.js` |
| **The permission tests** | `test/ui/marketing-role.test.js` |
| Architecture overview | `docs/HUB_ARCHITECTURE.md` |

---

*Compiled 2026-08-11 from the Añejo HUB codebase; second revision at merge of PR #40 (`70a32b3`).
Every capability, limitation and gap stated here was read from shipped code. Where something is
unknown or undecided, it is listed in §15.3 or §16.2 rather than guessed. Items resolved since the
first revision are kept struck through in §14.1 rather than deleted, so the change is visible.*

**Three things to settle before she starts:** apply the migrations (§2.1), answer what her 10% is
10% of (§16 D6), and request Google Business Profile API access (§16 D7).
