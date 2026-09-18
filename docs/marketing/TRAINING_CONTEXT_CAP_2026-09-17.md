# Training context scope correction — local evidence

Lead, weekly planner and Teach preview now share DEFAULT_MAX_CHARS=16000 from functions/_lib/training.js. Lead prompt includes the training receipt's read status, original/supplied sizes, truncation and source-selection limits. Teach preview exposes source failure as incomplete, not untrained, reports truncation/500-row selection limits, and does not claim every tool receives its exact text. Ana keeps its explicit customer-reply budget.

Team sidebar catalog counts include bowls and other_items (including catering/Traditional). Followers are labeled with metrics_as_of snapshot date, or date unavailable. A stored76 does not become a fresh77 by inference.

Validation:50 focused training/API/UI tests pass, including a synthetic31-rule24-example library exceeding8000characters retained entirely, partial source failure and a retained-only truncated receipt. Additional behavioral sidebar test passes for mixed catalog counts and snapshot date. Scoped ESLint and git diff --check pass. Logs /tmp/anejo-trainingcap-focused.log and /tmp/anejo-trainingcap-summary.log. No provider calls or deployment performed. Actual current production training content was not reread by this subtask; the current-size test is synthetic. Parent owns full-suite/release validation.
