-- Añejo HUB — Phase 4c: Ops reports & briefings. The agent writes a morning briefing (at the
-- first kitchen clock-in), end-of-service checklists (after lunch + after dinner), a daily
-- standup, a weekly summary, and insights — all deterministic data with an optional narrative.
-- Additive only. Apply: wrangler d1 execute anejo --remote --file=migrations/0024_ops_reports.sql

CREATE TABLE IF NOT EXISTS ops_reports (
  id           TEXT PRIMARY KEY,
  report_type  TEXT NOT NULL,   -- morning_briefing|eod_lunch|eod_dinner|daily_standup|weekly_summary|insights
  report_date  TEXT NOT NULL,
  title        TEXT,
  body         TEXT,            -- human-readable summary
  data         TEXT,            -- JSON structured detail
  generated_at INTEGER NOT NULL,
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ops_reports_type ON ops_reports(report_type, report_date);
CREATE INDEX IF NOT EXISTS idx_ops_reports_recent ON ops_reports(generated_at);
