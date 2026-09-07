# Cajita 3D backend audit evidence

Date: 2026-09-07
Scope: bounded Cajita configuration backend and authorized Hub reads. No deployment, live mutation, or live email send was performed.

## Measured repository checks

Command:

```text
npm test --silent
```

Result: exit code 0; 1,779 tests passed, 0 failed, duration 4.44s.

Command:

```text
npm run lint
```

Result: exit code 0; `eslint functions test scripts` completed without diagnostics.

Additional focused checks previously run: Cajita/config and catering tests passed; `git diff --check` passed.

## Backend path evidence

- `functions/api/leads.js` imports and invokes `normalizeCajitaConfiguration`.
- Valid configuration is serialized into the existing `leads.message` as a complete versioned JSON payload plus readable summary; no new database table or migration is used.
- Owner notification is sent after persistence through `sendEmail`, and its HTML includes the Cajita summary. Values are escaped by the existing email template path.
- Owner catering reads are gated by `requireRole(request, env, ['owner'])` in `functions/api/hub/owner/catering-deposit.js`.
- Kitchen catering reads are gated by `requireRole(request, env, ['kitchen', 'owner'])` in `functions/api/hub/kitchen/catering.js`.
- Kitchen output excludes name, email, phone, and company; it returns event/production fields and parsed Cajita configuration only.
- `extractCajitaConfiguration` includes both personalization artwork IDs and `theme.artworkAttachmentId` when reconstructing attachment ownership for Hub display.
- Summary includes per-variant quantities/items, ingredient totals, themes/colors/patterns/pick settings, labels, text placements with coordinates/scale/rotation, artwork metadata, prompts, packaging requests, and notes.

## Production status

No production verification was attempted in this audit. Live configuration, D1 state, upload linkage, role sessions, notification delivery, and deployed frontend/backend version alignment remain unverified and require the separate post-deploy synthetic check.

The 3D service realism attempts and AI endpoint status are outside this backend audit; no claim of 3D service success is made here.
