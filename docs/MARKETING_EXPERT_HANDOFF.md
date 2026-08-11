# Añejo HUB — Marketing Expert: Complete System Handoff

**Purpose of this document.** Everything true about the Marketing Expert role in the Añejo HUB as of
**2026-08-11**, written so it can be turned into an onboarding package, a user manual, a role scope,
and a metrics sheet without anyone having to read the code.

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
| Shipped in | PR #39, merged to `main` 2026-08-11 |
| Status | **Live in production**, except one migration (see §14) |

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
- The two **autonomy switches** (see §7) and **affiliate payouts** (see §5.4)

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

### 2.1 Prerequisite: apply the migration

**This has not been done yet.** Until it is, her daily-run checks will not save.

```bash
CLOUDFLARE_API_TOKEN=$(cat Aether/cf-dns-token) \
CLOUDFLARE_ACCOUNT_ID=5f4657e9b2f17a109f7c0406be0c7119 \
npx wrangler d1 execute anejo --remote --file=migrations/0089_marketing_desk.sql
```

Verify:

```bash
npx wrangler d1 execute anejo --remote \
  --command="SELECT name FROM sqlite_master WHERE name='marketing_daily_runs';"
```

Everything else about the role works without it — she can sign in, open every page, and use "Tell
the owner". Only the seven daily-run checkboxes fail to persist.

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

- [ ] Migration applied (§2.1)
- [ ] Account created, role `marketing`, team `marketing`, **Team lead ticked**
- [ ] PIN handed over in person
- [ ] She has signed in and set her own PIN
- [ ] HUB installed to her home screen
- [ ] Language set to her preference
- [ ] She has completed the **tutorial** at `/hub/training?role=marketing`
- [ ] She has the **printed quick card** from `/hub/training-card.html?role=marketing`
- [ ] Push notifications enabled (Account → Enable notifications)
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
| 📚 Content | `/hub/owner/content.html` | Document library + Creative Studio briefs |
| 📈 Traffic | `/hub/owner/traffic.html` | First-party website analytics |
| 🧭 Adoption | `/hub/owner/adoption.html` | Is the team actually using the HUB |
| 🎨 Studio | `/studio/` | Creative Studio (image generation) |
| 🎓 Training | `/hub/training?role=marketing` | Her own tutorial, re-runnable any time |
| 👤 Account | `/hub/account.html` | Change PIN, notifications, sign out |
| 🔒 My data | `/hub/my-activity.html` | Everything the system has logged about her |

### 3.2 Today — her desk (`/hub/marketing/`)

Four sections, top to bottom:

1. **Today's run** — the seven checks (§4). Progress reads `n/7 checked`.
2. **Close the run** — a note field for Dayan and the close button.
3. **Tell the owner** — her direct feedback route (§8.1).
4. **Last two weeks** — a strip of the last 14 runs; green = clean, red = had issues, with the
   issue count. Hovering a chip shows that day's note.

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
- **Create discount codes** — three kinds: `campaign` (shareable, optional limits), `customer`,
  `affiliate`
- **Activate/deactivate** a code
- **Resend** a partner's welcome
- **Read** what each partner is owed
- ❌ **Cannot** set a payout method or settle what is owed — owner only (§5.4)

Public application form: `/affiliate.html` → files a `partner_application` alert.

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

⚠️ Changes here are **live to customers immediately**. See §16 Decision 2.

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

`partners.js` is hers **except** two operations, which return 403 for her:

- `set_payout` — how a partner is paid (cash or credit)
- `mark_paid` — settling everything a partner is owed

`mark_paid` moves real money. It is already double-gated (the payouts switch must be on, and the
exact total must carry an unused approval), but those safeties answer *"was this amount approved"*,
not *"may this person spend"* — so the role check is separate and explicit.

---

## 6. Communication — every channel, in both directions

### 6.1 The four routes

| # | Route | Her → Dayan | Dayan → Her | Best for |
|---|---|---|---|---|
| 1 | **Tell the owner** (Today) | ✅ | — | Findings, problems, improvement requests |
| 2 | **Daily run note** | ✅ | — | The day's summary |
| 3 | **Comms / Messages** | ✅ | ✅ | Two-way conversation, questions, direction |
| 4 | **Push notification** | — | ✅ | Waking her device |

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
- **Note:** alerts raised by the system currently tickle `roles: ['owner']` only. She is not
  push-notified when Dayan replies. See §16 Decision 3.

---

## 7. "Dayan always approves" — how it is actually implemented

This is not one switch. It is four distinct mechanisms.

### 7.1 Mechanism 1 — per-item human action

No marketing content reaches the public on a timer alone. Instagram posts move through explicit
states — `draft` → `scheduled` → `publishing` → `published` — and each transition is a person
pressing something. Email campaigns must be composed, previewed, and sent.

**What this means in practice:** she is the human doing the tapping for day-to-day marketing. This
is per-item authority, not autonomy — but it is *her* tap, not Dayan's. See §16 Decision 1.

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
| **Set a partner's payout method** | **Dayan only** |
| **Settle what a partner is owed** | **Dayan only** |
| Anything touching finance, kitchen, customers, staff | **Dayan only** |

---

## 8. Her two routes to Dayan, in detail

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

### 8.2 System improvement / update requests

There is **no separate "feature request" route.** This is a real gap, and the honest answer is that
improvement requests go through one of two existing channels:

| Kind of request | Route | Why |
|---|---|---|
| "This is broken / this is costing us output" | **Tell the owner**, warning severity | Lands as an actionable alert |
| "We should build/change X" | **Tell the owner** (info) *or* **Comms thread** | Info alerts are the low-urgency lane; a thread is better when it needs discussion |

**Recommended convention** (a process, not a feature — adopt it, do not expect the system to
enforce it):

- Prefix improvement requests with **`IMPROVEMENT:`** in the title
- Prefix bugs with **`BUG:`**
- Prefix questions with **`Q:`**

That makes them greppable in Dayan's alert feed and separable when someone builds the real thing
later. See §16 Decision 4.

---

## 9. How Dayan monitors her work and her results

### 9.1 Daily — 30 seconds

1. Open `/hub/owner/` — **Alerts**: any `marketing_feedback` items are hers
2. Open `/hub/marketing/` — he has full access; the **Last two weeks** strip shows at a glance
   whether runs are being closed and whether they are clean

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
| Daily (2 min) | Alerts + did yesterday's run close |
| Weekly (20 min) | Two-week strip, tracked-link clicks → attributed orders, trust streaks, AI spend |
| Monthly (45 min) | Traffic trend, campaign performance, affiliate growth, cadence adjustments |

---

## 10. Clock-in / clock-out and EOD — the honest answer

### 10.1 There is no clock-in for this role

Time clock exists **only for kitchen and driver** (`/api/hub/kitchen/clock-in`,
`/api/hub/driver/clock-in`). Those write to the `shifts` table, which is what feeds the owner's
"On shift now" tile and the lateness tracking.

**The marketing role has no clock-in, no clock-out, no shift record, and will never appear in
"On shift now."** This was not an oversight in her build — the timeclock is tied to hourly food-ops
work and she is not that. But it does mean:

- ❌ Hours worked are not tracked by the system
- ❌ Lateness is not tracked
- ❌ She does not appear in the on-shift roster

### 10.2 There is no EOD report for this role either

`/api/hub/kitchen/eod/submit` and `/api/hub/driver/eod/submit` are role-specific. There is no
marketing EOD.

### 10.3 What replaces both

**The daily run is her attendance record and her EOD in one.** A closed run with a timestamp is
evidence that she worked the system that day; the note is her end-of-day report. The two-week strip
is her attendance history.

**If Dayan needs actual hours** (for payroll, or because she is hourly rather than salaried), that
is a build, not a setting. See §16 Decision 5.

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

### 11.2 For Dayan

1. **Read the alert feed daily.** It is the route he told her to use; not reading it teaches her to
   text instead, and then there is no record.
2. **Do not grant auto-publish early.** Five clean approvals is the bar because it is evidence.
3. **Answer improvement requests, even with "no".** An unanswered request becomes an unasked one.
4. **Review the two-week strip weekly, not the individual runs.** The pattern is the signal.
5. **Revisit the §16 decisions after two weeks** of watching how she actually works.

### 11.3 Her optimal daily routine (~30–45 min)

| Time | Action |
|---|---|
| Open | Today → read yesterday's numbers and any overnight alerts |
| 1 | Instagram inbox — clear DMs and comments (check 1) |
| 2 | Drafts — move anything approved onto the schedule (check 2) |
| 3 | Campaigns — confirm due sends went, queued ones read right (check 3) |
| 4 | Tracked links — open each one (check 4) |
| 5 | Site copy — confirm nothing expired is still showing (check 5) |
| 6 | Affiliates — new applications, pending links (check 6) |
| 7 | Traffic — yesterday against what we published (check 7) |
| — | Anything found → **Tell the owner** immediately |
| Close | Write the note, close the run |

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
Yes, today. Flagged as §16 Decision 1 because it is high-stakes and irreversible.

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
Not by push today — system alerts tickle the owner only. She sees unread counts when she opens
Comms. See §16 Decision 3.

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
| 1 | **Migration `0089` not yet applied** | Daily-run checks do not save | Run §2.1 |
| 2 | No clock-in/out for the role | No hours tracked | Daily run is the attendance proxy |
| 3 | No EOD report for the role | — | The run note is the EOD |
| 4 | **$50/week hard AI ceiling** | At the limit every AI feature waits for the new week | Plan generation early in the week |
| 5 | Stories cadence is **recorded, not automated** | Nothing drafts or posts a Story | Manual, outside the HUB |
| 6 | No per-post owner approval queue | She publishes on her own tap | §16 D1 |
| 7 | Site copy is live with no approval and no undo history | A mistake is public until fixed | "Restore the shipped page"; §16 D2 |
| 8 | She is not push-notified for replies | May miss a message until she opens Comms | §16 D3 |
| 9 | No dedicated feature-request route | Requests mix with findings | Title prefixes (§8.2) |
| 10 | She cannot see her own training-compliance row | Cosmetic | Dayan can tell her |
| 11 | No reopen on a closed run | A mistake stands for the day | Use "Tell the owner" to correct |
| 12 | Bottom nav budget is **7 slots max** at 320px | New destinations go behind ⋯ More | By design |
| 13 | 12-hour idle session | Re-enter PIN after a long gap | Security, by design |
| 14 | Push requires the PWA install on iOS | No install, no notifications | §2.6 |
| 15 | Run is per-day, not per-person | Two marketing seats would share a run | Intentional; revisit if a second seat exists |

---

## 15. Known facts vs. unknown facts

### 15.1 Verified — read from the shipped code

- The role, its guards, its nav, its login path, and every ❌/✅ in §5
- The seven checks, the three answers, the completeness rule, the one-run-per-day constraint
- The alert routing for her feedback, and the issues-only alert on close
- The four approval mechanisms in §7, including the two owner-only switches and the payout carve-out
- The $50/week AI ceiling; the 12h/30d session policy; the 5-approval trust threshold
- No clock-in, no clock-out, no EOD for this role
- Comms auto-routing of a staff thread to the first active owner
- The welcome SMS/email content, and that neither carries the PIN
- Full test suite: **1680 passing** at the time of writing

### 15.2 Verified by the owner

- The floating bottom-nav fix is confirmed working on his device (2026-08-11)

### 15.3 Unknown — nobody has measured or decided these

- **Whether the migration has been applied.** As of writing, no.
- **Whether the daily run takes 30 minutes or two hours in practice.** The §11.3 estimate is
  reasoning, not measurement. Ask her at the end of week one.
- **Whether seven checks is the right number.** Untested against real use.
- **Whether $50/week is enough** once someone is working the system daily rather than occasionally.
  Historic burn was ~$0.60/week — that is *not* a prediction of her usage.
- **Whether she will use "Tell the owner" or default to texting.** Depends mostly on whether Dayan
  visibly acts on what arrives there.
- **Her actual employment terms** — hourly vs salaried, expected hours, days on. The system does not
  know and cannot enforce them.
- **Real reach/engagement baselines** for the account. The cadence research in the product is
  general 2026 food-account research, not measured on Añejo.
- **What "good" looks like** for her KPIs — no baselines exist yet. Suggested targets in §17 are
  starting points to be replaced with real numbers after 30 days.

---

## 16. Decisions Dayan still owes

Each of these is a real authority question the build had to answer one way. The current answer is
recorded; changing it is a small code change.

**Decision 1 — Should she be able to send an email campaign to the full list unilaterally?**
*Current:* Yes. *Consider:* a send is irreversible and reaches every customer. Options: leave as is;
require owner approval above an audience-size threshold; require owner approval for all sends.

**Decision 2 — Should site copy changes go live without approval?**
*Current:* Yes, immediately. *Consider:* this is text on the public storefront. Options: leave as
is; add an owner approval step; restrict her to scheduled entries only.

**Decision 3 — Should she receive push notifications?**
*Current:* No — system alerts tickle the owner only. *Consider:* adding the marketing role to
relevant push fan-outs so she is woken by a reply or a performance alert.

**Decision 4 — Does she need a real improvement-request route?**
*Current:* No; requests share the alert feed with findings. *Consider:* a distinct request type with
its own status (open / accepted / declined / shipped) so requests are tracked rather than read once.

**Decision 5 — Does she need hours tracked?**
*Current:* No clock-in exists for the role. *Consider:* if she is hourly, either extend the timeclock
to marketing or track hours outside the HUB.

---

## 17. Key metrics for onboarding (starting points, not baselines)

⚠️ **No baselines exist for this account.** Replace every number below with the real one after 30
days of measurement.

### 17.1 Process metrics — is the job being done

| Metric | Source | Suggested target |
|---|---|---|
| Runs closed per week | Two-week strip | 5/5 working days |
| Checks answered per run | Run record | 7/7 (enforced) |
| Days from finding → reported | Alerts | Same day |
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
| Her desk | `public/hub/marketing/index.html` |
| Her desk helpers | `public/hub/marketing/assets/marketing.js` |
| Her nav definition | `public/hub/assets/hub.js` → `NAVS.marketing` |
| Shared-page role handling | `public/hub/owner/assets/owner.js` → `Owner.init` |
| Alerts (her feedback route) | `functions/_lib/alerts.js` |
| Trust ledger | `functions/_lib/trust_ledger.js`, `functions/api/hub/owner/trust.js` |
| AI budget ceiling | `functions/_lib/ai_budget.js` |
| Schema | `migrations/0089_marketing_desk.sql` |
| Her tutorial | `public/hub/training.html` → `marketing:` |
| Her quick card | `public/hub/training-card.html` → `marketing:` |
| Spanish strings | `public/hub/assets/hub-i18n.js` |
| **The permission tests** | `test/ui/marketing-role.test.js` |
| Architecture overview | `docs/HUB_ARCHITECTURE.md` |

---

*Compiled 2026-08-11 from the Añejo HUB codebase at merge of PR #39. Every capability, limitation
and gap stated here was read from shipped code. Where something is unknown or undecided, it is
listed in §15.3 or §16 rather than guessed.*
