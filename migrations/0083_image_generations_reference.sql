-- image_generations gains reference-conditioning provenance (0083).
--
-- functions/_lib/reference_variant.js sends a REAL customer-facing bowl photo (staged in R2 by
-- bowl_art.js, `studio/bowls/<bowl>.jpg`) into OpenAI/Gemini's image-edit path and asks the model
-- to restyle only the surroundings — background, surface, camera, light, campaign theme — never
-- the food. Without a durable record of WHICH source photo (if any) fed a generation, a styled
-- derivative and an ordinary text-to-image render become indistinguishable in this ledger: both
-- are just "an image, made by OpenAI." The owner was explicit: a derivative must never be
-- indistinguishable from an original in the record. This is that record.
--
-- Additive only, same convention as 0076/0081's post_provenance columns: NULL in both new columns
-- means "not reference-conditioned" (the ordinary text-to-image path, unchanged). A non-NULL
-- source_bowl means this row's image_url is a STYLED VARIANT of that bowl's real photo — a claim
-- about lineage, never a claim that the pixels ARE that photo.
ALTER TABLE image_generations ADD COLUMN source_bowl TEXT;   -- bowl_art.js key ('coco', 'ligero', …) — NULL = not reference-conditioned
ALTER TABLE image_generations ADD COLUMN reference_key TEXT; -- the exact R2 key sent as the reference image, e.g. 'studio/bowls/coco.jpg'
