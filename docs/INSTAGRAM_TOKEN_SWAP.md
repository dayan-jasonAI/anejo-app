# Instagram Token Swap — replace the expiring user token with a System User token

**Read this before you touch anything.** It's written for whoever is doing this once, months from
now, under time pressure because the HUB is throwing a "token expires soon" warning. Follow it in
order — steps 1–5 happen entirely inside Meta Business Manager and touch nothing in this repo or
in Cloudflare; only steps 6–8 touch the app.

**Time to budget:** 30–60 minutes if the account is already Page-linked and Business Manager
access is in order. Add a day if it isn't — see Step 0.

---

## The problem this fixes

`IG_ACCESS_TOKEN` today is a **long-lived user token**. Meta caps those at 60 days no matter how
they were generated, and there is no API that pings you before one dies — publishing, the DM
inbox (`functions/_lib/instagram_messaging.js`), and performance insights
(`functions/_lib/instagram_insights.js`) all stop working **at the same moment, silently**. The
HUB Social page now shows a countdown for this (`functions/_lib/instagram_token_expiry.js`), but
that only buys warning time — it doesn't fix the underlying 60-day clock.

## Why a System User token is the right fix

A **System User** is a non-human identity that lives inside a Meta **Business Manager** (Business
Portfolio), not inside anyone's personal Facebook/Instagram login. Regular user tokens — including
long-lived ones — are downstream of a *person's* login session and Meta forces them to expire on a
fixed clock regardless of type. A System User has no personal login to expire: a token generated
for it can be issued with **no expiration at all**, and it only stops working if someone
deliberately removes the System User, unassigns it from the Page/Instagram asset, or revokes the
token in Business Manager. That converts "renew every ~60 days or everything goes dark" into "set
this up once."

The trade-off: System User tokens are only available through the **Facebook Login** product
(`graph.facebook.com`), not the **Instagram Login** product (`graph.instagram.com`). Both are
already supported in this codebase — see the two-host comment at the top of
`functions/_lib/instagram.js` — but Facebook Login requires the Instagram professional account to
be **linked to a Facebook Page**, and requires `IG_USER_ID` to be set (Instagram Login resolves
its own id via `/me`; Facebook Login does not — `functions/_lib/instagram.js` refuses with *"The
Facebook Login path needs IG_USER_ID as well as the token"* if it's missing).

---

## Step 0 — Prerequisite: is the account Page-linked?

Open Instagram → the `@anejo.catering.co` professional account → **Settings and activity → Business
tools and controls → Connected accounts** (wording drifts by Instagram app version — the setting
that matters is "linked Facebook Page"). If a Page is already listed, skip ahead to Step 1.

If no Page is linked, link one now (a Facebook Page can be created for free if none exists) —
this is an Instagram account setting, not an API call, and does not touch `IG_ACCESS_TOKEN`. It
must be done before a System User token can be generated, because the System User is granted
access **through the Page**, not directly to the Instagram account, in Business Manager's asset
model as of this writing.

## Step 1 — Confirm the App and the Page are in the same Business Manager

Go to **business.facebook.com → Business Settings → Accounts → Apps**. The app is:

- **App name:** Añejo HUB
- **App ID:** `37280037854973941`

If it is not listed under this Business Manager, add it (Business Settings → Accounts → Apps →
Add → Claim/add an app ID → paste `37280037854973941`; you'll need to accept a terms dialog from
inside the App Dashboard the first time). Then confirm the Facebook Page from Step 0 is also under
**Business Settings → Accounts → Pages** in the *same* Business Manager. A System User can only be
granted access to assets that live in its own Business Manager — this is the step people skip and
then can't figure out why the token generation dialog shows no assets to pick.

## Step 2 — Create the System User

**Business Settings → Users → System Users → Add.**

- Name: something identifiable later, e.g. `Añejo HUB service account`.
- Role: **Admin.** (Employee-role System Users can be assigned assets too, but Admin avoids a
  second trip back here if a future permission needs a broader grant. This System User has no
  human logging in as it — the blast radius of "Admin" is the assets you explicitly assign it in
  Step 3, nothing else.)

## Step 3 — Assign it the Page and the Instagram account

Still in **Business Settings → Users → System Users**, select the one you just created →
**Assign Assets**.

- **Pages tab:** select the Añejo Facebook Page → grant **Full control** (or at minimum
  content-publish + messaging management — Full control is simpler to reason about for a
  single-purpose service account).
- **Instagram accounts tab** (if your Business Manager shows Instagram accounts as their own asset
  type, which is standard as of 2025+): select `@anejo.catering.co` → **Full control**.

If there is no separate Instagram-accounts tab, the Page grant above is sufficient — the
Instagram professional account inherits access through its linked Page under the older asset
model.

## Step 4 — Generate the token

Still on that System User's row → **Generate New Token**.

1. Choose the app: **Añejo HUB** (`37280037854973941`).
2. **Token expiration: select "Never."** This is the entire point of this migration — if the
   dialog only offers 60 days, you're generating the same kind of token we're trying to get away
   from; check that the System User's role and asset assignment (Steps 2–3) are actually saved
   before retrying.
3. Select every permission this app actually calls (do not guess — this list is derived directly
   from the code that uses `IG_ACCESS_TOKEN`, grep `env.IG_ACCESS_TOKEN` across `functions/_lib/`
   if you want to re-verify it yourself):

   | Permission | Used by | For |
   |---|---|---|
   | `instagram_business_basic` | `functions/_lib/instagram.js` (`resolveTarget`, `accountInfo`) | Identify the account, read follower/media counts |
   | `instagram_business_content_publish` | `functions/_lib/instagram.js` (`publishImage`, `publishCarousel`) | Create + publish posts and carousels |
   | `instagram_business_manage_comments` | `functions/_lib/instagram_messaging.js` (`replyToComment`) | Read/reply to comments on our own posts |
   | `instagram_business_manage_messages` | `functions/_lib/instagram_messaging.js` (`sendDirectMessage`) | Reply to DMs customers send us first |
   | `instagram_business_manage_insights` | `functions/_lib/instagram_insights.js` (`sweepAccountInsights`) | Reach/saves/shares per post for the daily insights sweep |

   Meta's permission-picker UI occasionally renames these — if a name above isn't offered
   verbatim, look for the closest match under "Instagram" in the picker and cross-check it against
   `docs/INSTAGRAM_APP_REVIEW.md`, which has the same list with the App Review justification text
   for each one (comments/messages permissions require the app to be **Published**, which requires
   **Business verification** — if this app isn't published yet, generation may fail or silently
   omit those two; that's a separate, larger process than this doc covers).

4. Generate, and **copy the token immediately** — Business Manager shows it exactly once. Paste it
   somewhere safe *outside this repo* (a password manager entry, not a chat message, not a file
   under version control) until Step 6.

## Step 5 — Get the Instagram User ID (`IG_USER_ID`)

The Facebook Login host needs this and Instagram Login doesn't set it, so if the account has only
ever run on Instagram Login, you likely don't have it recorded yet. Get it **without touching the
live `IG_ACCESS_TOKEN`**, using the new token you just generated:

- **Meta Graph API Explorer** (developers.facebook.com/tools/explorer): select the Añejo HUB app,
  paste the System User token, and call `GET /{page-id}?fields=instagram_business_account` — the
  response's `instagram_business_account.id` is `IG_USER_ID`. (`{page-id}` is the Facebook Page's
  own ID, visible on the Page's About tab or in Business Settings → Accounts → Pages.)
- Or **Business Settings → Accounts → Instagram accounts → `@anejo.catering.co`** — the account
  detail panel shows its numeric ID directly.

It's a 17-digit number, not a secret — it's fine to write it down next to the Page ID for next
time.

---

## Step 6 — Put the new token in Cloudflare Pages

Cloudflare dashboard → **Workers & Pages → anejo-app → Settings → Environment variables**
(Production environment — this app has no separate preview deploys that matter here).

| Name | Type | Value |
|---|---|---|
| `IG_ACCESS_TOKEN` | **Secret** (encrypted) | the System User token from Step 4 |
| `IG_USER_ID` | Var | the id from Step 5 |
| `IG_API_HOST` | Var (optional) | `facebook` |

`IG_ACCESS_TOKEN` already exists — **edit it in place**, don't add a duplicate. `IG_USER_ID` may or
may not already be set (it's unused on the Instagram Login host); add or correct it now regardless.
`IG_API_HOST=facebook` is optional but worth setting: without it, `resolveTarget()` in
`functions/_lib/instagram.js` probes `graph.instagram.com` first, gets rejected (a System User
token doesn't work on that host), and falls back to `graph.facebook.com` — functionally fine, just
one wasted round trip on every cold resolution. Setting it explicit skips that.

These names are also documented at the top of `wrangler.toml` — if that comment block and this
table ever disagree, trust the code (`env.IG_ACCESS_TOKEN` / `env.IG_USER_ID` / `env.IG_API_HOST`
in `functions/_lib/instagram.js`), not either piece of documentation, and go fix whichever doc
drifted.

**Before you save over the old value:** if you haven't already, copy the *current* `IG_ACCESS_TOKEN`
value out first if the field lets you (Cloudflare Pages secrets are normally write-only once set —
if you can't read it back, the rollback plan below is what you have). Cloudflare doesn't require
this, but it's the only way to get back to the old token if the new one turns out to be broken.

## Step 7 — Redeploy. The secret does nothing until you do.

**A Cloudflare Pages secret or var change is inert until the next deployment** — Pages bakes
environment bindings into each build/deploy, Functions don't read the dashboard live. Saving the
new `IG_ACCESS_TOKEN` in the dashboard changes nothing about the running site by itself.

Trigger a redeploy the normal way for this project — push any commit to `main` (auto-deploys), or
run `npm run deploy` from a machine with the right Cloudflare credentials. Use `npm run deploy`,
never a bare `wrangler pages deploy`: the npm script is what runs `scripts/predeploy-guard.mjs`
first, and that guard is the only thing stopping a stale checkout from reverting the live site.
(Extra wrangler flags still work — `npm run deploy -- --branch=main`.) **Do not run a `wrangler` deploy from an AI coding session** — per this
repo's standing rule, only the project lead deploys; this step is for a human at the terminal.

## Step 8 — Verify

In order, cheapest/safest checks first:

1. **HUB Social page** (`/hub/owner/social.html`, owner login required) — the status banner should
   read *"🟢 Connected as @anejo.catering.co"*. If it instead shows *"Set up, but Instagram
   refused the token"*, the token, the asset assignment, or `IG_USER_ID` is wrong — recheck Steps
   3 and 5 before re-generating a token.
2. Same page, check the small print under the green banner — it should say **"Token is a Facebook
   Page token"** (that's the `host: 'facebook_login'` label from `accountInfo()`), confirming the
   swap actually took, not just that some token happens to still work.
3. **Dry-run a real publish** — pick any existing draft post with a photo attached, use "Publish"
   only after you've confirmed the account is connected... actually don't: use the **dry run** path
   instead first. From the HUB, that's the `dry_run` op behind `POST /api/hub/owner/social`
   (`{"op":"dry_run","id":"<post_id>"}`) — it builds a real container at Meta and polls it to
   FINISHED but **stops before `media_publish`**, so nothing goes on the public profile. This is
   the one step that proves `instagram_business_content_publish` actually works on the new token
   without risking a real post.
4. **Comments/DMs** — wait for the next `social-inbox-tick` cron run (every minute) or trigger it
   by hand; confirm no new errors in its response. A permission gap here won't crash anything, it
   just silently stops drafting replies — check the HUB inbox for a new draft on a real recent
   comment/DM if one exists.
5. **Insights** — trigger `POST /api/hub/admin/insights-tick` by hand (owner session or the cron
   key) and check the response's `insights_error` field is `null`. Non-null means
   `instagram_business_manage_insights` didn't make it onto the new token.
6. **Record the real expiry as "none"** — on the HUB Social page's token-expiry control, you can
   leave the date blank (status shows "unknown") since a System User token has no expiry to track,
   or, if you'd rather the banner say something explicit, this doc's mechanism only understands a
   *date* — there's no "never" value modeled in `functions/_lib/instagram_token_expiry.js`. Leaving
   it unset is the honest choice: the banner will say "not recorded" forever, which for a token
   that genuinely doesn't expire is the correct steady state, not a defect.

---

## What can go wrong, and how to roll back

| Symptom | Likely cause | Fix |
|---|---|---|
| Social page still shows the OLD warning/expiry after redeploy | Deploy didn't actually happen, or hit a preview URL instead of production | Confirm the deploy in the Cloudflare dashboard shows a new build tied to your commit; check you're viewing the production URL |
| *"The Facebook Login path needs IG_USER_ID as well as the token"* | `IG_USER_ID` wasn't set, or was saved but the deploy predates it | Recheck Step 5/6, redeploy again |
| *"Instagram did not accept the token"* / *"Invalid OAuth 2.0 Access Token"* | System User isn't assigned the Page/IG asset (Step 3), or the app isn't in the same Business Manager (Step 1) | Re-open Business Settings → System Users → your user → Assigned Assets and confirm both are listed with access |
| Connects, but `insights_error` is non-null or comments/DMs stop drafting | Token generated without all 5 permissions (Step 4) | Generate a fresh token for the same System User with the full permission list re-checked — you do not need to redo Steps 2–3 |
| Token generation dialog only offers a 60-day expiration, never "Never" | You're generating a token from a personal user context, not the System User's row — or the System User role/assignment didn't save | Regenerate from **Business Settings → Users → System Users → [name] → Generate New Token**, not from the App Dashboard's own token tool |
| Need to undo entirely | New token is broken and the account needs to work RIGHT NOW | Paste the old token value (saved before Step 6) back into `IG_ACCESS_TOKEN`, remove/blank `IG_USER_ID` and `IG_API_HOST` if the old setup was Instagram Login, redeploy. If the old value wasn't saved, generate one more long-lived user token the same way the current one was made (Instagram → API setup with Instagram business login → Generate token) as a stopgap while you retry the System User setup |

**Do not delete or deauthorize the old token from Meta's side until the new one has passed Step 8
end to end.** Both can exist simultaneously without conflict — only one is ever read by the app
(`IG_ACCESS_TOKEN`'s current value), so there is no dual-posting risk in leaving the old one alone
for a day while you confirm the new one is solid.
