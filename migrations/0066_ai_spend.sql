-- The AI budget meter's ledger: one row per model call, priced at insert time.
--
-- The owner set a HARD $50/week ceiling on model spend. This table is what makes that
-- enforceable: every api.anthropic.com caller records what it just spent here, and the
-- gate refuses new calls once the week's sum reaches the ceiling.
--
-- Cost is INTEGER MICRODOLLARS ($1 = 1,000,000) because floating-point money drifts —
-- and a total that drifts is a ceiling that moves. Per-MTok USD prices are exactly
-- microdollars-per-token, so every row is a whole-integer multiply, no rounding debt.
CREATE TABLE IF NOT EXISTS ai_spend (
  id                TEXT PRIMARY KEY,
  week              TEXT NOT NULL,              -- ISO week 'YYYY-WW' (ET) — the unit the ceiling is enforced over
  day               TEXT NOT NULL,              -- ET calendar day, for drill-down without date math on epoch ms
  feature           TEXT NOT NULL,              -- which surface spent it (chat, social_plan, eod_draft_driver, ...)
  model             TEXT NOT NULL,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  cost_microdollars INTEGER NOT NULL DEFAULT 0,
  created_at        INTEGER NOT NULL
);
-- The gate runs SUM(cost_microdollars) WHERE week=? before every model call; without this
-- index that is a full-table scan on the hottest read in the AI path.
CREATE INDEX IF NOT EXISTS idx_ai_spend_week ON ai_spend (week);
