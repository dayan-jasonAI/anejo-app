# Google Business Profile API — owner connection requirements

Updated 2026-09-17 America/New_York from current official Google documentation. Documentation only: no forms submitted, Google Cloud changes, credentials handled or replies sent.

Evidence boundary: parent reports managed profile browser access, Verified status and seven reviews. That establishes browser-visible state only. API project approval, OAuth/token validity, resource IDs and successful API reads remain Unverified. The deployed private review desk is a disconnected manual-draft workspace, not an API inbox.

## Decisions and evidence needed before connection

- Confirm the Google account that manages Añejo, its Workspace organization (if any), and the intended Cloud project number. Do not create a duplicate project merely because its approval evidence is missing.
- Confirm the profile has been verified and active for at least 60 days and has the business website listed. The access-request email must be an owner/manager. Google's prerequisites also list an Organization account step. API quota 0 QPM indicates unapproved access; 300 QPM indicates approval. Record actual approval/quota evidence, not a promised turnaround date. [GBP prerequisites](https://developers.google.com/my-business/content/prereqs)
- Choose OAuth audience/state deliberately. External apps left in Testing generally receive seven-day refresh tokens; business.manage is not a basic-identity exception. A permanent Testing setup is unsuitable as the default unattended plan. [Token rules](https://developers.google.com/identity/protocols/oauth2)
- Internal is appropriate only for users within the project's Workspace organization. Published External, OAuth verification and Workspace administrator controls are separate states. Do not assume the account is Internal or already has a Trusted-app override. [OAuth app states](https://developers.google.com/identity/protocols/oauth2/production-readiness/overview)
- Proposed first phase: a private read-only review inbox for the owner-managed Añejo profile. Public website review refresh, social reuse and reply sending require separately evaluated handling and approval. Credentials alone do not remove a dated website-review disclaimer.

## Draft intended-use statement — review before any submission

Añejo Catering Co. proposes an internal tool for its own authorized Business Profile: read review information into a private operations workspace and prepare proposed replies for explicit owner review. Initial integration will be read-only. Any later reply feature will show the exact review and proposed text before an authorized write. No third-party profile access, resale, social redistribution or automatic public review reuse is part of this initial scope.

This is a draft, not a submitted application. Confirm business/account facts and the current form before use.

## Minimal connection and permission plan

- After project approval, follow current Google setup instructions for enabling Business Profile APIs. Google's current body lists seven associated APIs (its generated page summary inconsistently says eight). Reviews remain in Google My Business API v4. Account Management and Business Information provide account/location discovery. Enabling APIs and granting OAuth permission are distinct operations. [Basic setup](https://developers.google.com/my-business/content/basic-setup)
- Use the documented `https://www.googleapis.com/auth/business.manage` scope. Both review listing and reply update expose this management scope; there is no narrower read-only review scope in these method references. The application must enforce its own initial read-only restriction despite the broader granted capability. [List reference](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list), [Reply reference](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply)
- Build a server-owned OAuth authorization-code callback with an exact registered redirect URI, state validation and offline access when required. The old “any URI you can complete once” wording is unsafe: scheme/case/trailing slash must match registration. Protect refresh tokens and client secret server-side; never put them in the repo, browser storage, screenshots or logs. Account/location resource identifiers are configuration, not OAuth secrets. Handle reauthorization explicitly. [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- First proof: successful authenticated account discovery, owner-confirmed Añejo location mapping, then `GET https://mybusiness.googleapis.com/v4/accounts/{accountId}/locations/{locationId}/reviews`. Location must be verified. Fetch all pages (`pageSize` maximum 50); returned `averageRating`, `totalReviewCount`, `reviews`, `nextPageToken` supply actual API evidence. Timestamp last success; auth/quota failures remain unavailable, not an empty inbox. [List reference](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/list)
- Reply capability is a later explicit phase. `PUT .../reviews/{reviewId}/reply` creates or replaces the reply, using a ReviewReply body. Before a write, show the exact review, existing reply and proposed replacement; require explicit owner approval, then read back provider state. Do not mistake a draft save or HTTP timeout for publication. There is no general GBP API sandbox; do not assume reply update has validateOnly. [Reply reference](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply), [Basic setup](https://developers.google.com/my-business/content/basic-setup)

## Content handling and public reuse

Google limits GBP API use to managing/reporting authorized listings. Automated replies require prior specific express consent. Its content-storage policy restricts caching/storage outside the project; permitted limited caching is for performance, temporary (maximum 30 calendar days), secure and unmodified/unaggregated. Preserve provided attribution and avoid presenting the Hub as a Google product. [GBP API policies](https://developers.google.com/my-business/content/policies)

Implementation consequence: design a separate expiring API cache, not indefinite import into the existing manual-draft table, embeddings, AI training datasets or social asset archive. Website display and review-to-social republishing are not established as permitted by this research. Remove them from automatic connection promises and seek a clarified permitted use before implementation. Authorize independent customer testimonial use separately; API access does not itself establish those rights. This is a bounded implementation recommendation, not a legal determination.

## Remaining facts and next step

Needs Dayan confirmation: intended Google account/Workspace organization, profile's 60-day active history, approved Cloud project number, existing API approval/quota evidence, applicable OAuth audience/state, authorized business mapping, and the precise desired phase (private read-only review inbox first recommended). Current permissions/scopes granted and token lifetime remain Unverified until inspected without exposing secret values.

Next step: confirm the listed account/project facts and agree on the private read-only phase before any connection setup. Keep the disconnected draft desk usable. No Google forms, credential changes, API writes, public display changes, automatic replies or review deletion follow from this research artifact.
