# Twilio setup for the Añejo HUB (SMS / WhatsApp)

**Status:** code is ready and verified; waiting on a Twilio account. Until a sender is live,
in-app messaging works fully and every outbound SMS is logged to `sms_log` with `status='noop'`
(nothing is sent, nothing breaks).

## What this turns on
- **Outbound pings:** new purchase order → vendor texted; new route → driver texted; staff
  invite → welcome SMS with their PIN; (extensible to order/delivery notifications).
- **Inbound replies:** anyone texts your Twilio number → the message lands in their HUB
  conversation automatically (matched by phone). Reply from `/hub/comms` over SMS.
- The HUB never sends until the env vars below exist, so this is safe to leave unconfigured.

## The honest timeline (US SMS)
US carriers **block app-sent SMS from unregistered numbers**. To text US customers you must
register **A2P 10DLC**, which requires a **paid** Twilio account (trial can't register) and a
**Brand + Campaign** approval that currently takes **~10–15 days**. Plan around that.
Faster alternative with no 10DLC: **WhatsApp** (needs a Twilio WhatsApp sender approved).

## One-time setup (you do this in the Twilio Console)
1. **Create/upgrade to a paid Twilio account** at twilio.com.
2. **Buy a US 10DLC phone number** (Console → Numbers & Senders → Phone Numbers → Set up a new phone number).
3. **Register A2P 10DLC** (Console → Messaging → Regulatory Compliance / A2P): create a
   **Standard Brand** using the Añejo Catering Co. **LLC EIN**, then a **Campaign** (use case:
   "Customer Care" / mixed — describe order, delivery, and staff-ops notifications). Add the
   number to the Campaign's Messaging Service. Wait for approval (~10–15 days).
   - *Or* set up a **WhatsApp sender** instead to skip 10DLC.
4. **Point the inbound webhook at the HUB.** On the phone number's config (Console → the number →
   **Messaging** → "A message comes in"): set **Webhook**, **HTTP POST**, URL:
   ```
   https://anejocateringco.com/api/webhooks/twilio
   ```
   (If you use a Messaging Service, set it to **"Defer to sender's webhook"** /
   `useInboundWebhookOnNumber = true` so the number's webhook is used.)

## Wire it to the HUB (3 commands — run from the repo, or hand me the values)
Grab **Account SID** + **Auth Token** from the Twilio Console dashboard, and your number in
E.164 (e.g. `+15615551234`). Then:
```sh
export PATH="$HOME/.local/bin:$PATH"
cd "<repo>"
printf '%s' "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" | wrangler pages secret put TWILIO_ACCOUNT_SID --project-name anejo-app
printf '%s' "<your auth token>"                  | wrangler pages secret put TWILIO_AUTH_TOKEN  --project-name anejo-app
printf '%s' "+1561XXXXXXX"                        | wrangler pages secret put TWILIO_FROM        --project-name anejo-app
# optional WhatsApp sender:
# printf '%s' "+1415XXXXXXX" | wrangler pages secret put TWILIO_WHATSAPP_FROM --project-name anejo-app
```
No redeploy needed — Pages picks up secrets on the next request. Inbound **signature
validation activates automatically** once `TWILIO_AUTH_TOKEN` is set (the webhook rejects
forged requests). If the HUB is ever served from a non-apex host, also set `TWILIO_WEBHOOK_URL`
to the exact public URL Twilio signs.

## Test it
1. Text your Twilio number "hello" from your phone → open `/hub/comms` as owner → it appears
   as a new conversation within ~10s.
2. From the HUB, open that thread, switch the channel toggle to **SMS**, reply → you get the text.
3. Create a staff member with a phone (Owner → Staff) → they receive the welcome SMS.

## Env var reference (what the code reads — `functions/_lib/twilio.js`)
| Var | Required | Purpose |
|---|---|---|
| `TWILIO_ACCOUNT_SID` | yes | account auth + message resource |
| `TWILIO_AUTH_TOKEN` | yes | auth + inbound webhook signature check |
| `TWILIO_FROM` | yes (SMS) | sender number, E.164 |
| `TWILIO_WHATSAPP_FROM` | optional | WhatsApp sender (falls back to `TWILIO_FROM`) |
| `TWILIO_WEBHOOK_URL` | optional | exact signed URL if behind a proxy/custom host |
