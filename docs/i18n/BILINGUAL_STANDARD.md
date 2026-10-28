# Añejo bilingual operating standard

Every authored Añejo interface must work in English and Spanish. This includes public pages, owner/kitchen/driver/client screens, Studio, training, empty and populated states, errors, confirmations, accessibility labels, placeholders and dynamically rendered controls. A translated landing page alone does not meet this standard.

Use the shared language preference and the existing switch. Preserve the canonical values of selects, form inputs, record IDs, amounts, permissions and workflow actions when changing language. Never derive a business action from a translated button label. Do not rebuild dirty editors when language changes. Keep authored fallback labels in separate translatable text nodes; template captures must preserve actual record values, not accidentally freeze English UI defaults inside them.

Names, contact details, IDs, customer-authored notes and reviewed outgoing message bodies retain their exact source values. Authored system labels surrounding them must translate. These are data-preservation rules, not exceptions for untranslated instructions. Internal/private content must not be sent to a public translation service.

Internal manuals and recipes use authenticated, read-only reading editions stored in private D1. Bind an edition to the exact source hash and version; suppress stale content and show a translated warning. A reading edition does not approve a recipe, change its quantities, replace its editable source, or establish that a worker has been trained. Never commit proprietary recipe or internal-manual bodies to this public repository.

Before release, run `npm test`, the strict authored-copy gate (`node scripts/hub-html-copy-policy.mjs`), the populated catering/customer browser checks and the joined recipe/library API/browser checks. Verify ordinary live navigation after deployment. Source extraction and synthetic fixtures do not establish that arbitrary stored/provider text is translated or that an operator has completed a real shift.

The owner operating guide provides a daily routine and contextual instructions for each owner tab: purpose, timing, actions, evidence and escalation. New tabs require the same bilingual instructions.
