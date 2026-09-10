# Añejo Sales OS — Compliance

*2026-09-10. This records how the code behaves and why. It is not legal advice; before live
outreach, have counsel confirm the points marked **(owner / counsel)**.*

## Cold B2B email — CAN-SPAM, and the Gmail/Yahoo bulk-sender rules

| Requirement | How the code meets it | Pinned by |
|---|---|---|
| Truthful header (From / Reply-To) | From is the owner's configured name on the verified sending domain; Reply-To is a mailbox a person reads. Send refuses without both. | `sendReadiness`, `test/compliance/sales-send-path.test.js` |
| No deceptive subject | Governance flags a first-touch subject beginning "Re:" / "Fwd:". | `checkDraft` |
| Identified as a solicitation | Every footer: "This is a one-time business solicitation from Añejo Catering Co. to …" | `complianceFooterText` |
| Valid physical postal address | Footer carries the Broadcast postal address. Cold email **refuses to send** on the "Palm Beach County" fallback. | `postal_is_real` |
| Working opt-out, honoured promptly | One-click link (token, never the address) + `List-Unsubscribe` + `List-Unsubscribe-Post`. Effective immediately — the address is suppressed across every organization and every sequence stops. The law allows 10 business days; we do it on click. | `functions/api/sales/unsubscribe.js` |
| Opt-outs checked before every send | `sales_unsubscribes`, `campaign_unsubscribes` (a customer who left Añejo marketing is out of prospecting too), `email_suppressions` (bounces/complaints), contact + organization do-not-contact — at draft, at approval, and immediately before delivery. Fails closed if the check errors. | `isEmailBlocked` |
| Footer cannot be removed | The footer is appended by the renderer, outside the editable body. | renderer test |
| Volume | Daily cap (default 10, hard ceiling 40), weekday business hours only, one touch per contact per day, four-step maximum. | `sendApproved` |

## SMS and voice — TCPA / Florida Telephone Solicitation Act

- **A phone number found on a public website is not consent.** Prospect contacts are created with
  `marketing_sms_allowed = 0` and `voice_allowed = 0`, and the Hub refuses to switch them on.
- The Sales OS **has no SMS or voice send path** and never reads the customer tables' transactional
  `sms_consent` or `marketing_sms_consent`. A test scans every Sales file for both.
- `sms_basis` / `voice_basis` columns exist so a lawful basis can be recorded before any such channel
  is ever built. `sales.voice_enabled` is locked off in this release.
- **(owner / counsel)** Before Phase 2 voice: prior express written consent rules for autodialed or
  artificial-voice calls, the FTSA's Florida-specific requirements, AI-voice disclosure, and
  recording-consent (Florida is an all-party consent state for recordings).

## Prospects stay out of warm audiences

Prospects live only in `sales_*` tables. `_lib/audience.js` is unchanged, so no Broadcast segment
(launch list, past customers, subscribers, founder legacy, all) can include a prospect. A test
resolves the `all` segment on email and SMS and asserts no prospect appears.

## Website research

- Only the organization's own domain is fetched, re-checked on every redirect; IP literals, private
  hostnames, non-standard ports, credentials in URLs and non-HTTP schemes are refused (SSRF guard).
- `robots.txt` is honoured for our user agent, which identifies itself honestly
  (`AnejoSalesResearch/1.0 (+https://anejocateringco.com/business; …)`).
- No gated social networks, directories or logged-in pages. No email address is ever constructed from
  a name and a domain; an owner-entered guess is stored as `unverified_guess` and is never sendable.
- Evidence rows are text only and capped at 8 KB.

## Google Places terms (owner / counsel)

Google Maps Platform terms restrict caching Places content other than place IDs (coordinates may be
kept temporarily). The code stores the **place_id** as the external id and keeps the provider payload
in an evidence row; the facts scoring relies on come from the organization's **own website**. Storing
Places-derived name/address/phone long-term in a CRM is a terms question for the owner to decide
before turning on automatic discovery. The CSV path (public licensure lists, owner lists) has no such
restriction.

## Health information

Prospects are organizations. The landing form asks for a name, a work email, an optional phone, an
approximate headcount and a free-text note — nothing about any patient or client. No medical,
nutrition-treatment, dietary-guarantee or outcome claim is generated; governance flags them in any
draft, including the owner's own edits.

## Claims and proof

- Prices appear only as the owner configured them ("from $X per meal" is opt-in); otherwise
  "quoted for your headcount". Governance flags any other dollar figure.
- "Free"/"complimentary"/tasting language is flagged unless the owner turned the tasting offer on.
- DGP is never named unless named proof is selected **and** permission is recorded. Anonymous proof
  text is blank until the owner writes a true sentence.
- Customer counts and testimonial language are flagged unless they are the owner's recorded proof.

## AI

The AI brief receives structured facts and a list of allowed source URLs; post-validation drops
unknown URLs, replaces un-evidenced people, removes prices, flags health claims, and states thin
evidence. It is metered against the $50/week AI budget. It never changes a score and never writes an
email.

## Data

Unsubscribes are kept permanently (that is what makes them work). Activity is append-only.
Telemetry events carry ids, counts and enums only — no names, emails, phones or message text.
