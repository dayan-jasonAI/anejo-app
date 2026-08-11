# Aña on Instagram — status & the Ice-Breakers delta

> **Aña is already LIVE.** She has her own Meta app and has been replying to DMs and comments on
> the real Instagram account for a week. We are **NOT** creating a new app or a new agent. The only
> new thing here is **Ice Breakers** (the tappable welcome) — Steps 1–6 below are reference/verify
> only; the one action item is Step 7.

**Delta to activate the new welcome:** in the existing Meta app's Webhooks, make sure
**`messaging_postbacks`** is subscribed (so button taps reach Aña), then publish the ice breakers
(Step 7). Nothing else changes.

## What Aña can and cannot do (the rules, so nothing here surprises you)
- ✅ **Reply to anyone who DMs, comments, or replies to a story** — within 24 hours of their message.
- ✅ **Ice Breakers** — tappable starter buttons shown when someone opens your DMs (built: `social-icebreakers`). This is the compliant version of the "auto-welcome" look.
- ✅ **Comment → DM** — "comment ANEJO and I'll send you the link" style funnels.
- ❌ **Message a new follower first.** Instagram has **no new-follower event or follower list** in the API. There is no compliant way to auto-DM every follower. (The accounts you've seen do it use Meta's separate AI Studio product or a special-access partner.)
- ❌ **Cold-DM influencers who haven't messaged you**, auto-follow/like, or **scrape** Instagram to find influencers. All against Meta's terms and get the account banned. Aña recruits creators by **replying** when they reach out, and by us **queuing prepared outreach for a human to send**.

## Prerequisites (accounts you already need)
1. **Instagram account = Professional (Business or Creator)**. Settings → Account type.
2. That IG account **linked to a Facebook Page** (IG app → Settings → Linked accounts).
3. A **Meta Business Portfolio** (business.facebook.com) that owns both.
4. Admin access to all three with the same login.

## Step 1 — Create the Meta app
1. developers.facebook.com → **My Apps → Create App** → type **Business**.
2. Add the **Instagram** product (use "Instagram API with Facebook Login" / Instagram Graph API).
3. Note the **App ID** and **App Secret**.

## Step 2 — Permissions to request
Aña needs these (request in App Review, Step 5):
- `instagram_basic`
- `instagram_manage_messages`  ← the one that lets her read + send DMs
- `instagram_manage_comments`  ← read + reply to comments
- `pages_show_list`, `pages_read_engagement`, `business_management` (to resolve the linked Page/account)

## Step 3 — Get the long-lived access token + IG user id
1. In the app's Instagram/Graph API tools, generate a **User/Page access token** for the connected Page.
2. Exchange it for a **long-lived token** (~60 days) — it must be refreshed; `instagram_token_expiry.js` already watches expiry, but plan to rotate it.
3. Get the **IG professional account id** (the Graph "IG User" id).

## Step 4 — Wire the environment (Cloudflare Pages → Settings → Env vars, then redeploy)
| Variable | What it is |
|---|---|
| `IG_ACCESS_TOKEN` | the long-lived token from Step 3 (this is the on/off switch — no token = Aña no-ops) |
| `IG_USER_ID` | the IG professional account id |
| `IG_APP_SECRET` | App Secret — **required**; the webhook fails closed without it |
| `IG_WEBHOOK_VERIFY_TOKEN` | any string you choose; you'll paste the same value into Meta in Step 6 |

## Step 5 — App Review (the gate)
`instagram_manage_messages` / `instagram_manage_comments` are **Advanced Access** — Meta reviews them.
1. App Review → Permissions and Features → request the four in Step 2.
2. For each, record a **screencast** showing the real use: a customer DMs Añejo → Aña replies; a customer comments → Aña replies. (You can demo with a test account before approval — Meta allows the app admins/testers to message it in Development mode.)
3. Write a plain-English use description: *"Aña is our customer-service assistant. She replies to DMs and comments from people who message our restaurant, to answer menu/ordering questions and take order intent. She never messages first."*
4. Complete **Business Verification** for the Business Portfolio (Meta will ask).
5. Submit. Approval typically takes a few days to ~2 weeks.

## Step 6 — Subscribe the webhook
1. App → **Webhooks** → **Instagram** → Callback URL: `https://anejocateringco.com/api/webhooks/instagram`
2. Verify token: the exact `IG_WEBHOOK_VERIFY_TOKEN` from Step 4 (our GET handshake checks it).
3. Subscribe to fields: **messages**, **messaging_postbacks**, **comments** (add mentions/message_reactions if you want).
4. On the connected Page/IG account, subscribe the app to those events.

## Step 7 — Turn Aña on, in stages
1. **Publish Ice Breakers:** HUB → Marketing → publish ice breakers (calls `social-icebreakers`). Now people who open your DMs see the tappable welcome, and taps route to Aña.
2. **Start in draft-only** (the default): Aña drafts every reply into the Comms inbox; you approve each send. Watch a day of real replies.
3. **Then flip auto-reply on** when you trust it: HUB → Marketing → auto-reply mode `dm` / `comment` / `both` (owner-only switch, `social-autoreply`).

## Recruiting creators (the compliant engine)
- **Inbound:** when a creator DMs (or taps the "Partner / creator program" ice breaker), Aña explains the program and sends them to **anejocateringco.com/affiliate** — which now auto-confirms them, alerts you, and lets you approve/onboard in one tap (with their code + welcome email fired automatically).
- **Outbound (needs a human tap):** we can have Aña research a Palm Beach County food-influencer list from public sources and draft a personalized pitch + code + link for each, queued for you or a VA to send from the IG app. That keeps the account safe while doing ~95% of the work.

---
*Built: `functions/_lib/instagram_icebreakers.js`, `functions/api/hub/owner/social-icebreakers.js`,
postback routing in `functions/api/webhooks/instagram.js`. Everything is gated on `IG_ACCESS_TOKEN`
and no-ops until connected.*
