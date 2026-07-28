-- Owner-editable copy on the public site.
--
-- 53 static HTML files, 8,503 lines. Making PAGES editable would be a CMS — it would let someone
-- break the SEO schema, the hreflang pairing, and the on-demand translation layer without knowing.
-- So pages stay code and named SLOTS become data: the announcement bar, a hero line, a notice.
--
-- Bilingual by design. Añejo runs EN/ES and /es is crawlable, so a slot carries both. Spanish left
-- blank falls back to the on-demand translator rather than showing English — a half-translated bar
-- is the exact defect the language work fixed.
--
-- Scheduling is an EXPIRY, not a flag, for the same reason the ordering override is: a promo bar
-- nobody remembers to switch off is worse than no bar. starts_at/ends_at are epoch ms, both
-- optional; NULL means "no bound".
CREATE TABLE IF NOT EXISTS content_blocks (
  slot        TEXT PRIMARY KEY,          -- e.g. 'announcement', 'home_hero_note'
  body_en     TEXT,
  body_es     TEXT,
  link_url    TEXT,                      -- optional call to action
  link_label  TEXT,
  tone        TEXT NOT NULL DEFAULT 'info',   -- info | good | urgent (styling only)
  active      INTEGER NOT NULL DEFAULT 0,
  starts_at   INTEGER,
  ends_at     INTEGER,
  updated_by  TEXT,
  updated_at  INTEGER NOT NULL
);
