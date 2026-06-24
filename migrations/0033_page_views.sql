-- First-party, cookieless, no-PII analytics. Logged server-side in functions/_middleware.js on every
-- HTML pageview. Stores no IP, no cookie, no user-agent — only path, referrer source/host, country,
-- and language. Privacy-first; no consent banner required (like server logs / Cloudflare Web Analytics).
CREATE TABLE IF NOT EXISTS page_views (
  id         TEXT PRIMARY KEY,
  path       TEXT,
  ref_source TEXT,   -- organic | social | referral | direct | internal
  ref_host   TEXT,
  country    TEXT,
  lang       TEXT,   -- en | es
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pv_created ON page_views(created_at);
CREATE INDEX IF NOT EXISTS idx_pv_path ON page_views(path);
