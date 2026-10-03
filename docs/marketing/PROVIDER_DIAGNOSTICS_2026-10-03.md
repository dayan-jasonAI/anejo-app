# Brand audit provider diagnostics — October3

Existing direct-session technical implementation/testing/gated release authority applies. No public posts, customer sends, charges, credentials or trust activation. V18 semantic acceptance failed: one initial multimodal request per each launch design returned API400. No rejection body was retained; actual cause remains unverified.

This increment captures a closed, safe diagnostic at actual visual and written provider rejection boundaries. Retains stage, HTTP status, allowlisted error type, sanitized request reference, read status and fixed inferred category. Never retains raw provider messages, bodies, prompts, URLs, secrets, image bytes or exceptions. Stream cap16KiB, empty-chunk guard64, fixed total read deadline1second, best-effort cleanup. Unknown/nonJSON/oversized/stalled replies still fail closed. No automatic retry. Semantic rubric version18 remains unchanged because findings/rules are unchanged.

Owner UI shows the bounded provider diagnosis and distinguishes a rejected request from an artwork defect. Classification is an inference from provider text, not proof of underlying cause. Anthropic documents both unsupported schema constraints and grammar complexity as possible400 errors: https://platform.claude.com/docs/en/build-with-claude/structured-outputs . No current rejection is attributed to those possibilities without current provider evidence.

Root inspected helper/diffs, requested and reviewed stalled-read hardening, and ran actual governance visual/written rejection plus rendered owner-UI tests. Full root3,545/3,545 passes; lint0errors11existingwarnings; Functions build succeeds; diffcheck clean. Logs saved in evidence/provider-diagnostics-2026-10-03. Tests prove local rejection handling, not provider success.

Release/current provider diagnosis pending. Next exact-head fourchecks, production inventory, one normal browser diagnostic review of catering source (not retries seeking a pass), independent persisted readback; then repair based on observed category or preserve unknown. Full marketing/team/content/Ana/voice/automation and broader market-readiness scope remains open.
