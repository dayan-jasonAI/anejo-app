# Reviewed photo reuse — release candidate

This is private draft reuse, not approval to publish. Nothing uploaded previously becomes approved automatically.

In Hub → Marketing → Photos, open **Review for team reuse** on a photo. Select the actual catalog items represented, its theme and visual type, then explicitly opt in and save. The saved review records the current file hash, dimensions, reviewer and revision. If the catalog cannot be read, new approval is unavailable. **Stop team reuse** remains available independently of catalog availability.

The planner receives a bounded list of reviewed combinations and may request an exact product-set, theme and aspect-class match. The server checks that the requested combination was supplied, checks current approval and file content, and attaches only to an empty, unchanged private draft. No match leaves the draft needing media; explicit library requests never fall back to paid image generation. Absent library requirements retain the existing generator behavior.

Every attachment records the asset, hash, review revision and requested composition. Removing its slide or draft preserves that historical evidence. Reused drafts remain unscheduled, require composition review and cannot earn automatic clean-design trust credit. A model's chosen product combination is not evidence that an owner approved its interpretation.

Limits: portrait/square/landscape classes are matched, not exact pixel ratios. Registry review does not prove photo authenticity, intellectual-property rights, or which emblem source was used. R2 bytes are verified during selection and the registry revision is rechecked atomically at attachment; this cannot lock external R2 writes. An owner must revoke incorrectly tagged assets. Finished-image audits remain advisory and are separate from public approval.

Validation and deployment state: see MARKETING_READINESS_GOAL.md and the final release evidence. Do not treat this candidate guide as proof that the migration, UI, planner or provider flow has passed live acceptance.
