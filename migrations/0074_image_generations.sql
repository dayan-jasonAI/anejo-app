-- Image-generation provenance ledger for the Creative Studio plate-photo engine
-- (functions/_lib/plate_image.js).
--
-- plate_image.js now tries OpenAI (gpt-image-1) -> Gemini (nano-banana image) -> Workers AI
-- (Leonardo Phoenix, the old single-model path) in order, falling through silently on a missing
-- API key, a provider error, or a timeout. That fallthrough is invisible in the image URL alone:
-- a bowl photo made by OpenAI and one that quietly degraded all the way to Leonardo look
-- identical to the caller, and a silent degradation to the worst-looking model is exactly the
-- "you can tell it's AI" complaint that started this rewrite. This table makes the degradation
-- visible instead of mysterious, so the HUB can show "made by OpenAI" (or flag "fell back to
-- Workers AI, here's why") next to any generated photo.
--
-- Keyed by the produced image's URL (unique per call -- putMedia mints a random R2 key), NOT by
-- a foreign key into recipe_session_events / recipe_sessions: plate_image.js is a shared _lib
-- helper called from more than one route (studio content + studio chat today) and must not know
-- its callers' schemas.
CREATE TABLE IF NOT EXISTS image_generations (
  id           TEXT PRIMARY KEY,
  image_url    TEXT,                       -- NULL when every provider failed (chain-exhausted row)
  provider     TEXT,                       -- 'openai' | 'gemini' | 'workers_ai' | NULL (all failed/gated)
  model        TEXT,                       -- the specific model id that produced the image
  skipped      TEXT NOT NULL DEFAULT '[]', -- JSON [{provider, reason}] for every provider that did NOT produce it
  prompt       TEXT,                       -- truncated dish prompt, for debugging a bad generation
  created_at   INTEGER NOT NULL
);
-- The HUB looks up "who made this image" by URL; a debugging session pulls the recent tail by time.
CREATE INDEX IF NOT EXISTS idx_image_generations_url ON image_generations (image_url);
CREATE INDEX IF NOT EXISTS idx_image_generations_created ON image_generations (created_at);
