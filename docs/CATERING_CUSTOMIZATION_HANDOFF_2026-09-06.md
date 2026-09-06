# Catering Customization Handoff — 2026-09-06

## Direct-session approval

- Approver: Dayan
- Approval source: active Codex session on 2026-09-06
- Approved scope: launch the first eight Cajita themes, add the interactive Cajita slideshow and
  Catering preview, accept up to five private PDF/JPG/PNG design files of 10 MB each, connect those
  files to the Catering request and owner Hub/email workflow, apply the required production D1
  schema, and deploy the approved public experience.
- Exclusions preserved: no instant catering price, no automatic order acceptance, no payment on the
  request form, and no public file URLs.

## Implemented customer journey

- `/cajita` presents eight manually selectable themes with auto-play, pause/play, previous/next,
  direct theme controls, and reduced-motion behavior.
- The page uses nine real photographs from the supplied pink first-birthday event and keeps the
  exact Cajita sample-menu description.
- `/catering` previews the theme system and adds personal-design notes plus private file selection.
- The quote form accepts zero to five PDF, JPG, or PNG files, validates a 10 MB limit in the browser
  and Worker, and checks file signatures instead of trusting the declared MIME type.

## Data and notification path

1. The browser creates a short-lived upload session.
2. Each file is stored in the private `anejo-media` R2 binding; no public object URL is returned.
3. D1 records attachment metadata in `catering_attachments`.
4. `/api/leads` stores the complete Catering request first, then claims the upload session and
   links every attachment to that lead.
5. The owner Hub alert includes the file count. The owner email includes the file count and a link
   to the matching Catering desk card.
6. The Catering desk shows owner-only Preview and Download actions. The file route re-checks the
   current owner session and returns private, no-store responses.
7. If email delivery is not accepted, the request remains saved and a separate
   `catering_email_failed` Hub alert is raised.

## Image generation record

- Mode: built-in ImageGen image-editing workflow.
- Reference: the existing Cajita editorial photograph, with the box, food assortment, composition,
  camera angle, and premium Añejo presentation preserved.
- Prompt set: change only the surrounding styling, liner, ribbon, label palette, and decorative
  accents for Añejo Signature, Gender Reveal, Halloween, Christmas, Valentine’s, Easter, Patriotic,
  and Custom Occasion variants; avoid personal names and unreliable generated logo text because
  the site overlays the real Añejo mark and typography.
- Web assets: `public/assets/img/cajita/themes/*.jpg`.
- Real-event assets: `public/assets/img/cajita/event-gallery/*.jpg`.

## Validation evidence

- `npm run predeploy`: PASS — 1,768 tests and the deploy guard.
- `npm run lint -- --quiet`: PASS.
- Focused Catering/Hub suite: PASS — 25 tests.
- Local real-binding flow: PASS — R2 upload, D1 lead save, attachment claim, and Hub alert; evidence
  lead `ld_d95fdebbba2ffd208c0e` exists only in local development data.
- Responsive browser instrumentation: 390 px viewport reported `scrollWidth=390` on both public
  pages; Cajita theme controls and the Catering form/upload controls are present and enabled.
- Production D1 schema: `catering_upload_sessions` and `catering_attachments` created and queried
  successfully through database `anejo`.
- Native visible-browser QA: blocked during the build because the Mac was locked. Headless browser,
  HTTP, unit, integration, and local binding checks were used instead.

## Rollback

- Revert the deployment commit to restore the previous public pages and Worker routes.
- The two additive D1 tables can remain safely unused during an application rollback. Do not drop
  them until any uploaded request evidence has been reviewed and retained according to business
  policy.

## Remaining risk

- Device-level push display still depends on browser/OS notification permissions. The durable Hub
  alert row and email-provider acceptance are the server-verifiable delivery evidence.
- A final human visual pass on an unlocked phone/browser remains recommended after deployment.
