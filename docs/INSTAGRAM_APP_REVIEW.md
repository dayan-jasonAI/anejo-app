# Instagram App Review — submission pack

Everything Meta asks for, written out. Copy the justifications verbatim; record the four clips.

**App:** Anejo HUB · App ID `37280037854973941` · Instagram app ID `1320953250210919`
**Account:** `anejo.catering.co` (Instagram Tester role, accepted)

---

## What is already done, and does NOT need review

| | |
|---|---|
| `instagram_business_basic` | Ready for testing — working now |
| `instagram_business_content_publish` | Ready for testing — working now |

**Publishing needs none of this.** It works today in development mode because we own the account
and it holds a Tester role. Do not let a stalled review stop posting.

## What this submission is for

| Permission | Why we need it |
|---|---|
| `instagram_business_manage_comments` | Read and reply to comments on our own posts |
| `instagram_business_manage_messages` | Reply to DMs from customers who message us first |
| Human Agent (feature) | Auto-added with messages; a staff member replying past 24h |

Both also require the app to be **published**, which requires **business verification**.

---

## Order of operations

Business verification takes the longest and blocks publishing, so start it first.

1. **Business verification** — Dayan only. Needs the legal entity's documents.
2. **App settings** — icon, category, privacy policy URL, data deletion URL. Review will not start without them.
3. **Screen recordings** — four clips, below.
4. **Submit** — paste the justifications.

### Business verification — what to have ready

Añejo Catering Co. LLC. Meta matches these against public records, so the business name and
address must match the filing exactly, not the trading name:

- Articles of organization / state registration for the LLC
- An EIN letter or business tax document
- A utility bill or bank statement at the business address
- A phone number and domain Meta can verify (`anejocateringco.com` — already ours)

If the LLC address and the commissary address differ, use the one on the state filing.

### App settings that block submission

- **App icon** — 1024×1024, under 5 MB
- **Category** — Business and Pages
- **Privacy Policy URL** — `https://anejocateringco.com/legal/privacy`
- **Data deletion** — `https://anejocateringco.com/legal/privacy` (the section covering deletion
  requests) or a dedicated callback

---

## Justifications — paste these

### `instagram_business_manage_comments`

> Añejo Catering Co. is a Cuban-American meal-prep kitchen in Palm Beach County, Florida. We
> operate a single Instagram professional account, `anejo.catering.co`, which is our own.
>
> We use this permission to read comments left on our own posts and reply to them from our
> internal operations dashboard (the Añejo HUB), so that a customer asking "do you deliver to
> Boca?" or "is the tuna bowl gluten free?" gets an answer in minutes rather than days. Replies
> are drafted by our assistant from our own menu and delivery-area data, and a staff member sends
> them.
>
> We also use the hide capability, and only for spam. We do not delete comments: a customer
> complaint stays visible and gets answered.
>
> This permission is applied exclusively to comments on media owned by our own account. We do not
> read, analyse or store comments on any other account's media.

### `instagram_business_manage_messages`

> We use this permission to reply to direct messages that customers send to our own Instagram
> professional account, `anejo.catering.co`. Messages arrive in our internal dashboard alongside
> our SMS and email conversations so that one person can answer every channel from one place.
>
> Typical exchanges are questions about the menu, delivery area, pricing, allergens and order
> status. Our assistant drafts a reply using our published menu and delivery-area data; a staff
> member reviews and sends it.
>
> We only ever reply to a conversation the customer started, within Instagram's 24-hour window.
> We do not initiate conversations, we do not send promotional or bulk messages, and we do not
> message people who have not messaged us. Our implementation has no capability to do so: every
> send requires an existing conversation with a recorded inbound message, and the window is
> enforced in code before any request is made.

### Human Agent

> Used when a customer's question needs a person — a delivery problem, a refund, a custom
> catering quote — and the reply comes after the 24-hour window. The reply is written by a member
> of staff, not generated.

---

## Reviewer instructions — paste this

> The Añejo HUB is an internal staff dashboard at `https://anejocateringco.com/hub/`. Access is
> restricted to staff accounts.
>
> Test credentials: [Dayan to provide a reviewer staff login]
>
> To see the integration:
> 1. Sign in at `https://anejocateringco.com/hub/` with the credentials above.
> 2. Open **Comms** in the bottom navigation. Instagram conversations appear alongside SMS and
>    email, labelled with the Instagram channel.
> 3. Open a conversation to see the customer's message and a drafted reply. Sending posts the
>    reply to Instagram through the Messaging API.
> 4. Open **Social** in the bottom navigation to see comments on our posts and the reply box.
>
> All Instagram data shown belongs to our own account, `anejo.catering.co`.

---

## The four screen recordings

Each must show the permission being used, end to end, in one unbroken take. Screen-record the
laptop; no narration required.

1. **Comments — reading.** HUB → Social → a post with comments → the comments visible in the HUB
   next to the same comments on Instagram itself.
2. **Comments — replying.** Type a reply in the HUB → send → cut to the Instagram app showing the
   reply live under the post.
3. **Messages — receiving.** Send a DM to `anejo.catering.co` from a second Instagram account →
   cut to the HUB showing it arriving in Comms.
4. **Messages — replying.** Reply from the HUB → cut to the second account's inbox showing the
   message received.

Recordings 3 and 4 need a second Instagram account to play the customer — a personal account is
fine.

**Do not record these until Track C is deployed and the webhook is live**, or there will be
nothing to film.

---

## Honest expectations

- **Business verification:** days to a few weeks, mostly waiting on Meta.
- **App Review:** commonly one to three weeks, and rejection on the first pass is normal. The
  usual reason is a recording that does not clearly show the permission in use — which is why the
  four clips above are specific.
- **Nothing here blocks publishing.** Posting works today.
