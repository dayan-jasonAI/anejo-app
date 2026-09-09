# Google Business Profile API — access request packet

Date: 2026-09-09
Status: **ready to submit — needs Dayan's Google account** (Claude cannot sign in as him, and
google.com is blocked from this sandbox, so nothing below was clicked through)
Unblocks: `MARKETING_EXPERT_HANDOFF.md` §16 **D7** — auto-reply to Google reviews, sync them live
into the website's review section, reuse them as post content.
Related: `GOOGLE_REVIEWS_ES_HANDOFF_2026-09-08.md` — the six reviews on `/` and `/es/` are
hand-transcribed and carry a dated "not live" disclaimer. This credential is what removes that
disclaimer.

## Why this is a request and not a build

The Business Profile APIs are **not self-serve**. Enabling them in a Google Cloud project is not
enough — Google grants them a quota of **zero** until a separate access-request form is approved,
so the first call fails with a quota error and nothing in the code is wrong. Approval has
historically taken **days to a couple of weeks**, which is why this is worth sending now even
though the pipeline that consumes it is not built yet.

**Who has to do it:** the request has to come from a Google account that is an **owner or manager
of the Añejo Catering Co. Business Profile**. That is Dayan's account. Claude cannot submit it.

## Before you open the form (5 minutes)

1. **Google Cloud project.** console.cloud.google.com → project picker → **New Project**
   (or reuse one you already have).
   - Suggested name: `anejo-business-profile`
   - Write down the **Project ID** (e.g. `anejo-business-profile-481203`) and the **Project
     number** (the long numeric one). The form asks for both.
2. **Confirm the profile.** business.google.com → make sure the Añejo Catering Co. location is
   **verified** and that the account you are signed in as shows as Owner or Manager. An
   unverified location gets the request rejected.

## The form

Search **"Google Business Profile APIs access request form"** from the account above — Google
moves this page, so use the link from the current
[Business Profile APIs "Basic setup" / prerequisites docs](https://developers.google.com/my-business)
rather than a bookmarked URL. (I could not open it from here to confirm today's field list; the
fields below are the ones it has asked for, and any extras are self-explanatory.)

Answers to paste:

| Field | Answer |
|---|---|
| Contact name | Dayan Diaz |
| Contact email | dayan@dayanrealtyhub.com |
| Business / organization name | Añejo Catering Co. |
| Website | https://anejocateringco.com |
| Google Cloud **project ID** | *(from step 1)* |
| Google Cloud **project number** | *(from step 1)* |
| Are you an agency / reseller? | No — we manage our own single location |
| Number of locations managed | 1 |

**Intended use** (paste as-is):

> Añejo Catering Co. is a single-location catering business in Lake Worth, Florida. We operate our
> own website at anejocateringco.com and want to use the Business Profile APIs for our own
> verified location only. Three uses: (1) read our reviews so the review section on our website
> shows live ratings and text instead of a hand-transcribed snapshot; (2) reply to reviews from
> our internal operations dashboard so we answer customers faster; (3) read review content into
> our own marketing tooling to reuse as social posts. We are not an agency, we do not manage other
> businesses' profiles, and we will not resell or redistribute API access or data.

## After it is approved

1. **Enable the APIs** — Cloud console → APIs & Services → Library, in that project:
   - My Business Account Management API
   - My Business Business Information API
   - Google My Business API — **this is the one reviews live on.** Google has not moved reviews
     onto the newer versioned APIs; they are still served from the legacy `v4`
     `accounts.locations.reviews` endpoints. Confirm this on the docs at the time — if reviews have
     since moved, the endpoint changes but nothing else here does.
2. **OAuth consent screen** — External, app name "Añejo Catering", support + developer contact
   dayan@dayanrealtyhub.com. Add **yourself as a test user**; the app never needs to leave testing
   because the only user is us.
3. **Scope** — `https://www.googleapis.com/auth/business.manage` (the single scope these APIs use).
4. **Credentials** → OAuth client ID → **Web application**. Any redirect URI you can complete the
   consent flow on once is fine; `http://localhost` works. The output that matters is the
   **client ID + client secret**, and the **refresh token** you get from that one consent flow.
5. **Where the secrets go — never the repo.** Cloudflare Pages dashboard → anejo-app → Settings →
   Environment variables → **Encrypt**:
   - `GBP_CLIENT_ID`
   - `GBP_CLIENT_SECRET`
   - `GBP_REFRESH_TOKEN`
   - `GBP_LOCATION_NAME` (the `accounts/{id}/locations/{id}` string, from the account-management
     API once it is live)

   Then tell Claude they exist. The build (a scheduled function that refreshes the reviews JSON,
   plus the reply path from the Hub) is ordinary work once the credential is real — it is only
   this approval that cannot be coded around.

## One thing worth doing today, unrelated to the API

Dayan's own review is sitting on the Añejo listing. Google's policy disallows owner self-reviews;
it can be removed at any time and it slightly dilutes a genuine 5.0. Worth deleting from
business.google.com while you are in there.
