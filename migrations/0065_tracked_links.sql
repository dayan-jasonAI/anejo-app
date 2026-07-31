-- 0065 — Tracked short links (/l/:code) and their clicks. Additive only.
--
-- Instagram allows exactly one bio URL and reports nothing about who tapped it, so until now a
-- profile tap was invisible: page_views (0033) files it under "social" at best, and orders only
-- carry utm_* (0044) when the link itself supplied them — which the bio link never did. A tracked
-- link closes the loop: /l/ig-order records the tap, then forwards to the destination WITH utm_*
-- appended, so the click lands here and the sale lands in orders.utm_campaign — two ends of the
-- same funnel, joinable by campaign with no third-party analytics.
--
-- Apply: wrangler d1 execute anejo --remote --file=migrations/0065_tracked_links.sql

CREATE TABLE IF NOT EXISTS tracked_links (
  id           TEXT PRIMARY KEY,
  code         TEXT NOT NULL UNIQUE,        -- the /l/<code> path segment, lowercase
  label        TEXT,                        -- owner-facing name ("IG bio → Order Now")
  dest_url     TEXT NOT NULL,               -- site-relative path (preferred) or absolute https URL
  utm_source   TEXT,
  utm_medium   TEXT,
  utm_campaign TEXT,                        -- the join key: matches orders.utm_campaign (0044)
  active       INTEGER NOT NULL DEFAULT 1,  -- 0 → redirect falls back home, untagged, unrecorded
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);

-- One row per tap. The IP is stored ONLY as a salted SHA-256 hash: unique-visitor counting needs
-- a stable per-visitor token, but a raw IP is PII (GDPR/CCPA), and a click log that grows forever
-- is exactly the table a leak would hurt most. The hash counts uniques; the address itself never
-- touches the database.
CREATE TABLE IF NOT EXISTS link_clicks (
  id         TEXT PRIMARY KEY,
  link_id    TEXT NOT NULL REFERENCES tracked_links(id),
  clicked_at INTEGER NOT NULL,
  referer    TEXT,
  user_agent TEXT,
  ip_hash    TEXT
);
CREATE INDEX IF NOT EXISTS idx_link_clicks_link ON link_clicks (link_id, clicked_at);

-- The three links the /go bio page ships pointing at. Destinations verified against public/:
--   · /order      — the order page.
--   · /calculator — there is NO /macro-portal page; the free macro calculator is the public entry
--     to the Macro Portal funnel (calculator → plan → subscribe), so that is where the button goes.
--   · /#tasting   — catering has no standalone page either; the tasting-request form on the
--     homepage is the catering & events intake.
-- utm_campaign mirrors the code so the owner links report needs no mapping table.
INSERT OR IGNORE INTO tracked_links (id, code, label, dest_url, utm_source, utm_medium, utm_campaign, active, created_at, updated_at)
VALUES
  ('lnk_ig_order',    'ig-order',    'IG bio → Order Now',           '/order',      'instagram', 'bio', 'ig-order',    1, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('lnk_ig_macro',    'ig-macro',    'IG bio → The Macro Portal',    '/calculator', 'instagram', 'bio', 'ig-macro',    1, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000),
  ('lnk_ig_catering', 'ig-catering', 'IG bio → Catering & Events',   '/#tasting',   'instagram', 'bio', 'ig-catering', 1, CAST(strftime('%s','now') AS INTEGER)*1000, CAST(strftime('%s','now') AS INTEGER)*1000);
