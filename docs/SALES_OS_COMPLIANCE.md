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
| Working opt-out, honoured promptly | Link (token, never the address) to a single page with one "Unsubscribe me" button, plus `List-Unsubscribe` + `List-Unsubscribe-Post` for mail-client one-click. Effective on that click — the address is suppressed across every organization and every sequence stops. The law allows 10 business days. **Opening the link (GET) changes nothing**: corporate link scanners open every link in an inbound email, and a GET opt-out would unsubscribe prospects the moment an email arrived. | `functions/api/sales/unsubscribe.js`, `sales-send-path.test.js` |
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

## Discovery sources and their terms

**Google Places — NOT APPROVED, locked off.** Google Maps Platform terms restrict caching Places
content other than place IDs, and a prospect CRM exists to persist organizations. The adapter stays
in the code, isolated, but `sales.places_persistence_approved` is a **locked** flag (false in code;
the settings API refuses it; a row written straight to `app_settings` is ignored). No discovery run —
scheduled, the owner's "discover now", or a direct call to the provider — can reach Places, whether
or not `GOOGLE_PLACES_API_KEY` / `GOOGLE_MAPS_API_KEY` is set. The Hub labels it "not approved for
production". Unlocking it requires (1) counsel's reading of the current Maps Platform terms for this
use, and (2) a deliberate code change to the lock — not a setting. Pinned by
`test/compliance/sales-places-gate.test.js`.

**CSV / manual — the approved production source for this release.** Recommended public lists
(verify each source's current page and terms at download time; these were checked 2026-09-10):

| Source | ICP coverage | Access | Terms as found |
|---|---|---|---|
| Florida AHCA **FloridaHealthFinder** facility locator — "Adult Day Care Center" | Licensed adult day care centers, with **licensed beds** (a real capacity signal) | Search → Download CSV/XLSX; imports as-is (File Number, Facility name, Street Address, City, Zip, Phone Number, Licensed Beds) | State public-records data; no reuse restriction stated on the page |
| SAMHSA **FindTreatment.gov** (N-SUMHSS directory) | Behavioral-health and substance-use facilities, incl. service setting (residential / outpatient) | Download from the locator, or the documented keyless JSON API `findtreatment.gov/locator/exportsAsJson/v2` | U.S. Government work published under the **Open Database License** (data.gov) — internal use is fine; attribution and share-alike apply if a derived database is ever made public **(owner / counsel)** |
| Florida DCF **SUD Provider Search** | Licensed substance-use providers | Interactive search only | Stated purpose "licensing verification and transparency" — use to **verify** a license, not as a marketing list |

**Recommended next automated source:** a FindTreatment.gov adapter behind the existing provider
interface (`functions/_lib/sales/discovery.js`). Not built in this release: the API's parameters were
documented but not verified against live responses here, and nothing is integrated on guesswork.

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
