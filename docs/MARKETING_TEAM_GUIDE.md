# Añejo Marketing Team — Owner's Guide

*For Dayan. What the AI marketing team can do, how to get the most out of it, and where
everything lives. Written 2026-07-31, the day the team went fully live.*

## The roster (who does what, and what it costs)

| Member | Model | Job |
|---|---|---|
| **Team Lead** | Claude Opus (frontier) | Strategy, campaign briefs, delegation. Your thinking partner. |
| **Intel analyst** | Claude Sonnet + live web search | Answers the Lead's research questions with real sources. |
| **Content drafters** | Claude Haiku | Post captions, Aña's replies — the cheap, fast bench. |
| **Governance auditor** | Claude Haiku + hard rules | Scores every draft 0–100, flags price/cutoff/link/claim errors. |
| **Aña** | Claude Haiku | Front of house: Instagram DMs & comments, instant replies. |

Everything runs inside the **$50/week ceiling** you set. Every model call is metered; the
budget bar in HUB → Marketing is the truth. A typical Lead conversation costs ~$0.10;
Aña replies are ~$0.003 each. You will struggle to spend $5 in a normal week.

## Where to drive it

- **HUB → Team** — chat with the Team Lead. This is the steering wheel.
- **HUB → Marketing** — the cockpit: draft queue, budget bar, Aña's inbox, link stats,
  auto-publish trust toggles.
- **HUB → Comms** — reply to any customer thread yourself; your reply supersedes Aña's.

## What it can do today

1. **Strategize with you.** The Lead reads live state before every reply: your brand brief
   verbatim, the live menu with prices, Instagram metrics (best/worst posts), the draft
   queue, budget, active briefs, and the ordering surfaces (/order, /go, /portal,
   /calculator). Ask it anything you'd ask a marketing director.
2. **Research for real.** If it doesn't know something, it files a request and the intel
   analyst does actual web searches with cited sources — it is trained to never invent
   facts about your own business.
3. **Write campaign briefs** (objective, audience, angle, cadence, success metric) that
   persist and steer future drafting.
4. **Draft posts on command** — every draft is governance-scored before you see it.
   Nothing unscored can exist in the queue, whichever door it came through.
5. **Plan the week automatically** — the planner drafts against performance data daily;
   carousels (2–10 slides) fully supported, timer-published unattended.
6. **Run the front of house.** Aña answers DMs and comments in seconds, English or
   Spanish, on-brand, with hard safety rails: no invented facts, no medical claims, no
   made-up discounts; angry/medical/refund messages send NOTHING and page you; special
   requests get a "checking with the kitchen" and alert you.
7. **Learn.** Daily ~6 AM metrics sweep of the whole account feeds the planner and the
   Lead — what worked shapes what gets made next.
8. **Track money, not vibes.** `/go` and `/l/…` tracked links carry attribution through
   to orders; review asks go to every delivered customer with your Google link.

## How to use it well (the honest playbook)

- **Talk to the Lead like a partner, not a vending machine.** "Reach was 357 on the COCO
  post but 3 clicks — why, and what do we run next week?" beats "make me a post." It has
  the numbers; make it argue from them.
- **Your approvals are training data.** Approving a draft *unedited* counts toward the
  5-clean-approvals streak per category; editing resets it. When a category hits 5 you
  can flip its auto-publish toggle in Marketing — that's how the team graduates from
  "propose" to "publish" one category at a time. The toggle physically won't turn on
  early, and a governance flag always blocks auto-publish.
- **Weekly rhythm that works:** Monday — 10 minutes with the Lead setting the week's
  brief. Daily — approve/reject drafts from the cockpit (rejecting with a reason teaches
  more than silently editing). Friday — ask the Lead "what did the numbers say this week?"
- **Trust the record, not the prose.** Every Lead message that fires an action gets a
  system record of what actually executed; the Lead is under orders to never claim an
  action ran without it. If something looks off, the draft queue and briefs list in the
  side panel are the ground truth.
- **When something goes wrong publicly: kill first.** Marketing → auto-reply OFF (or tell
  Claude "public-facing incident" — the standing protocol is kill outgoing first, diagnose
  second).

## What grounds every design and word (source of truth)

- **`docs/brand-standards-brief.md` — your brief, and it rules everything.** It is
  compiled *verbatim* (never summarized) into the code by
  `node scripts/build-brand-context.mjs` and injected into the Lead, the planner, the
  governance auditor, and Aña. **To teach the whole team something new: edit the brief,
  run the script, deploy.** That one file is the steering document — voice, photo
  standards, macro Golden Rule, banned claims, the Reposado feeling.
- **Live D1 data beats memory**: menu names/prices, `ops.order_by_hour` cutoff, metrics.
  No model is allowed to quote a price or cutoff from memory.
- **Visual templates**: `tools/cardgen/` in the repo — the exact generators, fonts, and
  palette behind the posted cards, plus `tools/cardgen/references/` where you drop
  example images + a short note so future design work learns from them. Full details in
  `tools/cardgen/README.md`.

## Where the posts themselves live

Captions/schedule/scores in D1 (`social_posts`, `social_post_media`); image files in the
R2 bucket `anejo-media` (`studio/2026-07/series/…`); bowl photography in
`public/assets/img/`. The HUB draft queue is the human view of all of it.

## Not yet built (so you don't go looking)

Video content (your call #3 — deferred); Meta App Review / business verification (Track B,
your paperwork); email campaigns are a separate system (Broadcast layer) not yet driven by
the Team Lead; token renewal due ~late September.
