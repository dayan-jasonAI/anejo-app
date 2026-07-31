// Matching a draft to a ready-made, on-brand bowl image.
//
// The Lead writes a caption and art direction but no pixels, and Workers cannot render an image
// at request time — so a draft used to land with media_key NULL and look, to the owner, like the
// team had produced half a post. Every bowl now has one canonical brand-treated post image staged
// in R2 (built by tools/cardgen/bowl_post.py, keys `studio/bowls/<bowl>.jpg`), and a draft that is
// unambiguously about one bowl gets it attached automatically.
//
// Deliberately conservative: a starting point the owner replaces with real photography via the
// 📷 upload button, never a claim that the art direction was fulfilled. When the text names two
// bowls or none, it attaches NOTHING — a wrong bowl on a post is worse than no bowl at all.

export const BOWL_ART = {
  coco: 'studio/bowls/coco.jpg',
  ligero: 'studio/bowls/ligero.jpg',
  congreen: 'studio/bowls/congreen.jpg',
  fuego: 'studio/bowls/fuego.jpg',
  vida: 'studio/bowls/vida.jpg',
  mar: 'studio/bowls/mar.jpg',
  raiz: 'studio/bowls/raiz.jpg',
  fuerza: 'studio/bowls/fuerza.jpg',
};

/**
 * The R2 key for the single bowl a draft is about, or null.
 * Matches whole words only, case-insensitively, and accepts RAÍZ with or without the accent.
 * Two different bowls named → null (ambiguous). Zero → null.
 */
export function bowlArtFor(text) {
  const s = String(text || '').toLowerCase().replace(/í/g, 'i');
  const hits = new Set();
  for (const bowl of Object.keys(BOWL_ART)) {
    if (new RegExp(`\\b${bowl}\\b`).test(s)) hits.add(bowl);
  }
  if (hits.size !== 1) return null;
  return BOWL_ART[[...hits][0]];
}
