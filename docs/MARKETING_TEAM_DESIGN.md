# Añejo Marketing & Sales Team — design

**Status:** decisions made 2026-07-31 — building. Phase 0 first.

## 0. Dayan's decisions (2026-07-31)

1. **Autonomy:** everything approved from the HUB at first; auto-publish opens up per CATEGORY as
   trust is earned. The Lead proposes; nothing public moves without a yes until then.
2. **Budget:** hard ceiling **$50/week** on model spend. The HUB shows spend against it.
3. **Video:** not required now. No video producer; templates/photo only.
4. **Lead autonomy:** acts only on approval first; graduates to autonomous per category later.
5. **Competitors:** the Lead identifies them itself — from the website, the brand brief and what
   Añejo offers. Dayan is not supplying a list.
6. **Objective: BOTH brand-building and lead-gen.** The mandate is awareness of the full offer:
   bowls, the Macro Portal, meal-plan options, catering — reaching everyone who could be
   interested. Premium brand, and people actually knowing what Añejo sells.

---

## 1. Why what exists today is not a team

Three things are missing, and no amount of extra agents fixes them:

| Missing | Consequence today |
|---|---|
| **Standards** | The planner has never read `brand-standards-brief.md`. It works from the menu and a one-line voice note I wrote by hand. |
| **Memory** | Nothing records what was posted or how it did. Week 10 is written exactly as well as week 1. |
| **Judgement** | No one asks "is this on brand?" before it goes out. A bare bowl photo with no branding passed because nothing was checking. |

A team is not N agents. It is **shared truth**, **someone who decides**, **specialists with bounded
jobs**, and **a loop that changes the next decision**. Agents without those are just parallel
guessing.

---

## 2. Architecture

```
                      ┌──────────────────────────┐
   You  ⇄  chat  ⇄    │   TEAM LEAD  (frontier)  │
                      │  strategy · delegation   │
                      └────────────┬─────────────┘
                                   │ writes a BRIEF, spawns TASKS
       ┌──────────────┬────────────┼────────────┬──────────────┐
       ▼              ▼            ▼            ▼              ▼
    INTEL         CREATIVE     GOVERNANCE   CONVERSATION     OPS
  (Sonnet)     (Sonnet/image)   (Haiku)       (Haiku)       (code)
       └──────────────┴────────────┴────────────┴──────────────┘
                                   │ artifacts
                                   ▼
                        ┌─────────────────────┐
                        │  YOUR REVIEW (HUB)  │
                        └──────────┬──────────┘
                                   ▼  publish
                        ┌─────────────────────┐
                        │  MEASURE  (48h)     │──┐
                        └─────────────────────┘  │
                                   ▲             │ feeds the next brief
                                   └─────────────┘
```

---

## 3. The context spine — what every agent reads

This is the part that makes it "know Añejo". Built once, used by all.

1. **Brand Brief** — `docs/brand-standards-brief.md`, chunked and indexed into Vectorize. Voice
   (§11), photo standard (§10), plating, the Golden Rule (§4), allergen rules (§8).
2. **Live business state** — menu, availability, real prices, delivery area, operating hours,
   ordering cutoffs. Already in D1. Not paraphrased: read at request time.
3. **Performance history** — reach, saves, comments, profile visits per post. **Does not exist
   yet**; needs `instagram_business_manage_insights`, which I deliberately left off the app.
4. **What we have said** — every past post and campaign, so it stops repeating itself.
5. **Market intel** — competitors, local search demand, platform norms. Refreshed monthly.

> **Rule:** an agent may not state an operational fact that is not in the spine. The invented
> "order by Wednesday" deadline came from a gap in this list, not from a bad model.

---

## 4. The Team Lead

**Model:** frontier (Opus). **Calls:** a few per week, not per task.

**Where:** HUB → Social → **Team**. A conversation, not a form. You say "I want to push the Macro
Portal at gym owners in Boca" and it answers with a plan, not a caption.

**What it does**

- Reads the spine and says where the brand actually stands right now
- Proposes strategy with reasoning you can argue with
- Writes a **Campaign Brief**: objective, audience, angle, channel mix, assets needed, cadence,
  what success looks like
- **Delegates** each asset to the right specialist at the cheapest model that can do it
- Reviews returned work against the brief before it reaches you
- After results land, says what it learned and what it will change

**What it does not do:** write captions, make images, or publish. If the Lead is doing the work,
you are paying frontier prices for drafting.

---

## 5. Specialists

Grouped by real job. Several roles on your list are **deliberately code, not agents** — see §6.

| Group | Agent | Job | Model |
|---|---|---|---|
| **Intel** | Market Researcher | Local demand, seasonality, food trends in PBC | Sonnet + web |
| | Competitor Watch | What comparable brands post, cadence, what lands | Sonnet + web |
| | Platform Analyst | Format/timing/hashtag norms; what Instagram is favouring | Sonnet + web |
| | Performance Analyst | Reads our own metrics, finds patterns | Haiku |
| **Creative** | Copywriter | Captions, hooks, CTAs in brand voice | Sonnet |
| | Art Director | Shot briefs to the §10 photo standard | Sonnet |
| | Image Producer | Generates or composes the asset | image model |
| | Video Producer | Reels/shorts — see the open question in §8 | TBD |
| | Template Designer | Reusable branded layouts | Sonnet |
| **Governance** | Brand Auditor | Scores every asset against the brief **before** you see it | Haiku |
| | Claims Checker | No invented prices, deadlines, allergens, delivery areas | Haiku |
| **Conversation** | DM/Comment Drafter | Replies from the knowledge base; 24h rule enforced in code | Haiku |
| **Sales** | Lead Qualifier | Spots a real enquiry in a DM and routes it | Haiku |

---

## 6. What should be code, not an agent

Making these agents adds cost and nondeterminism for no benefit:

- **Scheduler, Publisher, Tracker** — already built, deterministic, tested
- **Executor / Previewer** — that is the pipeline
- **Security** — signature verification and the 24h window are code, and must stay code. An agent
  that can be talked out of a rule is not a control.
- **Coding** — that is me, in this chat, with tests and review

I would rather have **12 agents that each do one job well** than 22 titles where half overlap.

---

## 7. The loop that makes it learn

1. Asset published, with the brief that produced it recorded alongside
2. **48 hours later** — metrics pulled and attached to that brief
3. Performance Analyst summarises: what worked, what did not, against what we predicted
4. Next planning session **opens with that summary**
5. Brand Auditor's rejection reasons also accumulate — recurring misses become prompt rules

Without step 2 there is no learning, and step 2 needs the insights permission. **This is the
single highest-value missing piece.**

---

## 8. Open questions — your call

1. **Autonomy.** Start: everything needs approval. Target: auto-publish categories you have come
   to trust (e.g. menu posts) while campaigns and anything with a claim still need a yes?
2. **Budget.** A weekly ceiling in dollars. The Lead spends against it and the HUB shows cost per
   campaign. What is the number?
3. **Video.** Generated video is not yet at a premium brand's bar. Options: (a) templates over
   footage you shoot, (b) fully generated, (c) skip video for now. My recommendation: (a).
4. **Does the Lead act or only propose?** It can queue work automatically, or wait for your yes on
   every brief. Recommendation: acts on research and drafting, waits on anything public.
5. **Competitors.** Name 3–5 accounts to watch. Guessing this produces generic strategy.
6. **First objective.** Brand-building (premium perception) or lead-gen (orders this month)? They
   produce different content. Recommendation: brand-building for 4 weeks — with 35 followers,
   conversion optimisation has nothing to convert.

---

## 9. Prerequisites before any of it works

| # | Blocker | Why |
|---|---|---|
| 1 | **File upload** (jpg + video, phone and desktop) | Today you can only paste an R2 key. This blocks every creative workflow. |
| 2 | **Caption editing in the HUB** | The API op exists; the page has no field. I claimed otherwise. |
| 3 | **Insights permission** | No learning loop without it |
| 4 | **Brand Brief indexed** | The standards exist and nothing reads them |

1 and 2 are small and unblock you immediately. 3 and 4 are the foundation of the team.

---

## 10. Build order

- **Phase 0 — Unblock you.** Upload (jpg + video), caption editing, brand brief indexed into the
  spine. The planner starts writing to your actual standards.
- **Phase 1 — See.** Insights permission, metrics recorded per post, performance visible in HUB.
- **Phase 2 — The Lead.** Conversational strategy surface, campaign briefs, task queue with
  visible cost.
- **Phase 3 — The bench.** Intel and Creative specialists behind the Lead.
- **Phase 4 — Governance.** Brand Auditor and Claims Checker in front of every asset.
- **Phase 5 — Conversation.** DM/comment drafting, then graduated autonomy.

Phase 0 is worth doing regardless of what you decide about the rest.
