# Añejo Sales OS — Runbook

*For Dayan and whoever operates the Hub with him. 2026-09-10.*

## Going live (only after you approve the Launch review)

Nothing below has been done. Each step is yours to approve.

1. **Merge + deploy the branch** `feat/sales-os` through the normal path (`npm run lint`,
   `npm test`, `npm run deploy`, `npm run verify:deploy` — see `CLAUDE.md`). Deploying alone changes
   nothing a prospect can see: every outbound flag defaults to off.
2. **Apply the migration** to production D1 (additive; creates `sales_*` tables and the default
   sequence, touches no existing table):
   `wrangler d1 execute anejo --remote --file=migrations/0103_sales_os.sql`
   Then confirm: `SELECT name FROM sqlite_master WHERE name LIKE 'sales_%'` returns 13 tables.
3. **Deploy the cron Worker** (`cd cron && wrangler deploy`) so the scheduled jobs exist. They
   no-op until their switches are on.
4. **Provider settings** (Pages → Settings → Variables):
   - **Google Places is NOT an approved prospect source in this release** and is locked off in code;
     setting `GOOGLE_PLACES_API_KEY` does nothing for discovery. Load organizations by CSV (below).
   - In Resend → Webhooks, add `email.delivered`, `email.opened`, `email.clicked` to the existing
     endpoint (bounces/complaints are already subscribed) so the funnel can see delivery.
   - Optional: `APP_BASE_URL=https://anejocateringco.com`. Every prospect-facing link is built from
     it (default: that same address) — never from the host you happen to be using the Hub on.
5. **Configure, in this order, in Hub → More → Sales → Settings:**
   1. Postal address — Marketing → Broadcast (the same one Broadcast uses). A street address or a
      registered mailbox; "Palm Beach County" does not count and cold email will not send without it.
   2. Sender — From name, a From address on the Resend-verified domain, and a **Reply-To you read
      every day**.
   3. The offer — read every sentence; tick "every statement is true of our operation today"; save.
   4. Proof — leave "None" unless you have a true line. Named DGP proof needs DGP's permission first.
   5. Service area, send window, ICP weights — the defaults are Palm Beach + Broward, weekdays 9–4 ET.
6. **Open Launch review.** It shows the ICP, geography, sources, the 20 best prospects with every
   reason, the exact first email, the sequence, a landing page, caps, unsubscribe behaviour, proof
   wording, flags, and what stays manual. Approve there, then switch on what you want.

## Suggested first experiment (spec §22)

- Import or discover ~50 organizations. Research them (button, or turn on scheduled research).
- Read the top 20 in Launch review. Create opportunities for the ones you would actually call.
- Draft first emails; read, edit, preview, approve up to 20. Cap stays at 10/day (Settings).
- Turn on **Send approved prospect emails** and **Draft follow-ups when due**.
- Every morning: Approvals (follow-ups appear here), and mark any replies in your inbox as
  "Reply received" on the prospect. Replies stop the sequence.
- The dashboard's "Where it is stuck" line reads the funnel for you.

## Where good prospect lists come from (CSV)

The CSV importer takes any list with a header row (name, website, street, city, zip, county,
category, capacity, notes, contact_name, contact_title, contact_email, contact_phone, source_url).
Public sources for the ICP — **check each source's current page and terms at download time**
(details in `SALES_OS_COMPLIANCE.md`):
- **Florida AHCA FloridaHealthFinder** (quality.healthfinder.fl.gov → Facility/Provider → Adult Day
  Care Center): filter by county (Palm Beach, Broward), Download CSV, import as-is — licensed beds
  come in as capacity. Names without "adult day" in them: add a `category` column set to `adult_day`.
- **SAMHSA FindTreatment.gov**: search near Palm Beach / Broward for mental-health and substance-use
  facilities, download, and import. Rename columns if needed: `name1`→`name`, `street1`→`street`.
  Add `category` = `behavioral_health` or `addiction_treatment` if their names don't say so.
- Florida DCF SUD Provider Search: use it to verify a license, not as a list.
- Your own list of programs you know, or referrals.
Imported emails are marked `owner_provided` and are sendable; an address you are only guessing
should be entered as "It is a guess" — it will never be emailed.

## Daily / weekly

- **Daily (5 minutes):** Approvals · mark replies · move stages.
- **When a prospect asks for pricing/tasting:** you get a Hub alert; their sequence has already
  stopped. Reply from your own mailbox, then record the meeting stage.
- **Proposal:** on the prospect page, fill the terms in dollars; save; confirm the monthly total
  (the number on the button is the number that is checked); **Convert to Contract Account**. The
  new account is active on exactly those terms; its headcount links are on the Contracts page.
  Nobody is texted or emailed by conversion.

## When something looks wrong

| Symptom | Where to look |
|---|---|
| "Nothing is sending" | The yellow box on Dashboard/Approvals lists every unmet gate, in words. |
| Approve says "not the email you previewed" | Preview again — something changed (your edit, sender, or footer). |
| Approve says flagged claims | Read them. Fix the wording, or tick "I have read the flags" to send as written — recorded on the email. |
| Discovery error | Settings → Setup status. "Places API (New) has not been used" means enable it on the key in Google Cloud. |
| A site has no contacts after research | robots.txt may block us (Evidence shows "robots block"), or the site lists no names/emails. Add a contact you know. |
| A prospect replied but a follow-up is queued | Mark "Reply received" — it cancels queued steps. |

**Public-facing incident:** kill outgoing first — Settings → *Send approved prospect emails* → Off.
That stops every send immediately (the send loop checks it per batch). Diagnose second.

## Rollback

Switch flags off (instant). The migration is additive; leaving the tables in place is harmless. To
remove the feature from the UI, revert the nav entry in `public/hub/owner/assets/owner.js`.
